# twitter-monitor 小规模接入验证

保留现有 Monorepo 和数据库边界，采集与终端登录复用 twitter-monitor 固定版本核心。当前提供授权 Web GraphQL 的本地探针，不写数据库、不调用 Jev、不启动生产 Cron。

## 上游与依赖

固定上游 node 分支提交 `dd8de94e3e2853beb7b5e5b785f1908c2cafea4b`，保留原始 `postHomeTimeLine`、Axios HTTP 工具、TLS cipher 调整、User-Agent、超时及代理环境变量行为。本次按用户要求不裁剪 TLS 逻辑。axios、hpagent、acorn、lodash-es、jsdom 和三个本地 vendor helper 是加载原始核心所需的运行时依赖。

上游核心引用了生成配置中不存在的两个社区操作导出，会导致整个模块无法加载。仅追加两个 undefined 导出；探针不调用这些操作，未虚构 query ID。原文件前缀和 HTTP/TLS 文件保持一致，校验记录见 `packages/x/src/twitter-monitor/vendor/PROVENANCE.md`。

## 本地执行

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm x:auth
pnpm x:collect:probe --count 10 --pages 1
```

探针只从 `playwright/.auth/x.json` 读取 X 的 auth_token 和 ct0。文件缺失时以 AUTH_STATE_MISSING 退出，不发送请求。count 范围为 1..20，pages 为 1..3；count 是请求提示，实际返回量由上游决定。禁止自动重试；失效登录态需要人工重新登录。

结果保存到被 Git 忽略的 `debug-artifacts/x-probe/<uuid>.json`，含归一化帖子、观察顺序、entryId、字符串 sortIndex、分页信息及上游版本。结果不包含 cookie，但含账号可见的帖子内容，应作为私有调试数据保管。Linux/macOS 目录权限 700、文件 600，Windows 使用当前用户受保护目录。

取消信号停止等待；为保留原始 HTTP 实现，已经发出的请求仍可能持续到上游默认 30 秒超时。

## 验证边界

```bash
pnpm x:collect:test
pnpm x:auth:test
pnpm typecheck
pnpm lint
pnpm build
```

离线测试使用静态 GraphQL fixture 和 Axios adapter，不访问 X；覆盖原始 HTTP/TLS 调用、字符串 ID、长文本、引用、模块、分页去重、停止条件、凭证读取和错误脱敏。它们不能证明当前 queryId/features 对真实账号可用。

真实验证先请求一页，检查帖子内容、作者、时间、图片和引用，再最多验证三页的 cursor 与跨页去重。同账号、相近时间与 X 的 For you 首页对照推荐顺序；保留响应 entryId/sortIndex 作为证据。响应顺序目前只是观察顺序，输出固定 `orderVerified: false`，不可作为已验证的网页推荐排名。

确认真实请求、解析和排序后，再讨论精简上游依赖及接入幂等数据库写入。当前未改 Schema，无新增 migration。
