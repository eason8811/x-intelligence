# 自研登录与会话复用：现状证据及实施步骤

准备日期：2026-10-14。代码基线：`main` / `01217c7`。

## 范围与决定

先调查、实现并验证 Web HTTP 登录和会话复用，再替换 For You 请求与解析。REA 用于分析授权样本，不作为生产采集依赖。保留 apps/web、apps/collector 与四个共享 package，不新增 package，不接数据库、Jev 或生产部署。

当前准备阶段只回滚未提交诊断修改、建立源码与离线测试证据、定义真实验收步骤。未运行真实登录、未读取私有 cookie，也未确认当前线上接口有效。

## 回滚记录

以下文件已恢复至 HEAD：

- `docs/manual-login.md`
- `packages/x/src/twitter-monitor/login.ts`
- `packages/x/src/twitter-monitor/login.test.ts`

未回滚提交，不删除 Git 忽略文件或私有登录态。之前新增的登录步骤 HTTP/响应类型诊断不属于回滚后的基线，不能再据此描述当前错误输出。

## 现状证据

| 编号 | 证据入口 | 当前代码行为 | 证明边界 |
| --- | --- | --- | --- |
| E01 | `packages/x/src/twitter-monitor/vendor/PROVENANCE.md`、`source-manifest.json`、`local-patches.json` | 固定上游 dd8de94e3e2853beb7b5e5b785f1908c2cafea4b，记录日期 2026-07-20；有模块加载兼容补丁 | 源码溯源，不证明上游当前最新版本或接口失效 |
| E02 | `packages/x/src/twitter-monitor/login.ts` | getToken 一次，默认 API guest；Login.Init 开始任务；单项 subtask 调度，最多 20 步；未知任务停止 | 静态流程，不证明服务端当前返回相同任务 |
| E03 | vendor `Core.fetch.mjs`：getToken、postFlowTask、getViewer；`Core.function.mjs`：Login | guest/activate、onboarding/task、Viewer 是待调查请求入口；query ID/features 来自固定配置 | 仅接口候选，不是线上验证 |
| E04 | `apps/collector/src/auth/login.ts` | TTY 隐藏密码/验证码，15 分钟取消；Viewer 账号确认后保存；覆盖前确认，登录失败保留旧会话 | 文件及交互设计，不是实际登录验收 |
| E05 | `apps/collector/src/auth/state.ts` | 临时文件、fsync、rename；目录 700、文件 600；cookie-only 兼容容器 | POSIX 文件保存逻辑；不能由此声称 Windows ACL 验证通过 |
| E06 | `apps/collector/src/auth/credentials.ts` | 从文件提取 auth_token/ct0；校验域、路径、格式及已记录到期时间 | 仅本地校验；expires=-1 不证明远端有效 |
| E07 | `packages/x/src/twitter-monitor/transport.ts`、`apps/collector/src/jobs/probe.ts` | 已保存凭证可直接用于 HomeTimeline；有分页边界及错误映射 | 没有独立 session-check/Viewer 复用预检；采集错误不等于精确会话诊断 |
| E08 | vendor `packages/axios-helper/index.node.js` | 上游代理、TLS cipher、超时行为仍保留 | 特定上游保留例外，不授权在自研实现中新加规避逻辑 |

已有历史文档记载 API guest HTTP 200；先前诊断记录曾有 Init HTML 403，发生在账号输入前。它们是历史观察，本次未复现；不能据此认定密码错误、账号无效或上游代码已过期。

### 离线验证入口

`pnpm x:auth:test`：登录调度与会话保存测试。

`pnpm x:collect:test`：transport/parser/probe/credentials 等离线测试。

本次执行结果：`pnpm x:auth:test` 10/10 通过，`pnpm x:collect:test` 15/15 通过（其中登录测试与前一命令重叠，不是 25 个独立用例）；上游源码 checksum 与补丁记录检查通过。`git diff --check` 通过。测试使用 mock/fixture，不访问真实授权账号，不替代运行验收。未运行完整 build/lint、数据库执行或真实 X 请求。

## 调查样本与证据规范

先取得一次授权浏览器登录样本，再取得同账号刷新/重新打开页面的复用样本。记录 UTC 时间、运行机器、浏览器/工具版本、授权范围与出口标识；不记录代理凭证。不要自动重复提交密码。

原始 HAR、脚本及会话放仓库外私有目录（例如 `~/rea-investigations/`），不提交、不公开。通过 REA 离线 HAR 分析及必要的 bundle/CDP 观察核对请求顺序、方法、host/path、状态、subtask 类型、cookie 名称与属性、Viewer 结构。原始样本可能包含秘密，提交仓库的 fixture 必须用合成值替换密码、OTP、token、cookie、账号标识及敏感正文；结构保真与脱敏分别检查。

维护请求矩阵：证据 ID、来源位置、请求阶段、方法/路径、必要字段、响应结构、观察状态、未知项。未知是否必要的字段不凭猜测删掉；静态接口候选须真实授权请求验证。发生访问拒绝时先核对授权与出口，不添加 stealth、验证码绕过或未知挑战处理。

## 实施阶段与退出条件

### A0：授权样本与协议调查

产出登录、Viewer、会话复用请求矩阵和脱敏 fixtures。确认 guest、任务初始化、instrumentation、用户名、密码、实际出现的 2FA、成功与失败响应；没有遇到的任务标为未验证。检查与现有上游实现的差异，不先假定过期。

退出条件：至少一次授权浏览器登录成功和一次复用样本；如果 Init 被拒绝，明确阻塞位置与缺失证据，不进入猜测实现。

### A1：登录接口与会话契约

在 packages/x 定义自研登录 transport、任务状态、Viewer 身份及结构化错误契约；apps/collector 保留终端输入与文件读写。复用现有 LoginDriver 接口或作最小调整，不让业务逻辑依赖 vendor 类。会话校验区分本地缺失/损坏、远端有效、远端失效、访问拒绝、限流、网络失败及未知响应；网络故障不能触发自动重登。账号身份用于防止意外复用错账号，不保存密码/OTP/flow token。

退出条件：契约及合成 fixtures 审查通过；明确 HTTP 依赖用途后才新增依赖。上游特定 TLS 保留授权不能直接扩展到新的自研指纹调整。

### A2：自研 Web HTTP 登录

按 A0 证据实现 guest、登录任务、完整 cookie 更新、Viewer 验证；保持隐藏输入、取消/超时、未知挑战停止及失败不覆盖文件。使用显式实现选择保留旧 driver；禁止隐式失败回退，避免重复密码提交。

退出条件：有意义的任务/错误/秘密泄露测试通过；授权账号在交互终端真实登录成功，Viewer 身份确认后原子保存。只完成模拟测试不能退出此阶段。

### A3：独立会话检查与跨进程复用

增加独立的 session-check CLI（名称待实现确定）。新进程读取已保存会话，先本地校验，再通过已验证的 Viewer 请求确认身份。检查时不询问密码；不自动登录，不因网络错误删除会话。明确 Cookie 更新与到期语义，必要更新原子保存。

退出条件：退出登录进程后重新启动检查，远端确认同一账号且不输入密码；本地无效、远端失效、限流和网络错误行为均有证据。远端失效测试以服务端确认或授权可控失效样本为准，不能把人工改坏 cookie 当作所有过期行为的证明。

### A4：接入现有少量采集探针

以新登录/会话产出的凭证运行现有 For You 一页探针，保持 DTO 和 parser 边界。暂不替换采集请求核心，不写数据库、不调用 Jev。

退出条件：新进程复用会话获取一页真实响应，核对账号、帖子字段和观察顺序；如果失败，区分登录、权限、query 配置与解析问题。

### A5：For You 自研替换及上游退出

单独调查首屏/分页、Cursor、features、响应条目；实现自研请求与解析并通过离线及少量真实验证后，逐模块移除上游引用。原生/Android、搜索和其他业务外能力不纳入范围。登录与采集各自验收，不整体盲目替换。

## 首个可展示成果

交互终端完成自研登录 → Viewer 确认 → 私有文件保存 → 结束进程 → 新进程无密码验证同账号会话 → 一页授权探针。

分阶段交付证据，不承诺未观察的挑战支持、长期会话寿命或生产可用性。
