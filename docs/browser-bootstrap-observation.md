# 无账号浏览器运行观察

用户已于 2026-10-17 选择：允许正常浏览器参与验证，先仅验证无账号页面与 SDK 上下文，后续再评估 HTTP 提交边界。此授权不等于启用浏览器账号登录、复制信号到 Node 或更换现有 CLI。

## 服务器本轮结果

REA `capture_browser_scenario` 使用现有 Playwright Chromium 可执行文件，launch 模式、临时 profile、headless。实际版本 153.0.8010.12，与用户历史 Chrome 155.0.8059.79 不同。起点 https://x.com/，声明等待 12 秒；采集网络元数据和页面错误，关闭 header values/request body/response body。

结果为 execution_failure，携带 partial_observation：初始 document GET 收到 HTTP 403，随后 net::ERR_HTTP_RESPONSE_CODE_FAILURE；等待动作尚未执行，未取得初始 DOM。3 个网络事件、0 dropped；cleanup=terminated-owned-process。没有输入、点击、验证码请求或账号 POST。无法证明 guest/SDK 加载或运行，不能把此失败称为无账号验证通过。未取得成功 Evidence ID，不把局部错误记录当完整场景。

本轮不重复相同请求、不修改 UA/TLS/指纹，也不启动反 Bot 绕过。此前 Node HTTP 入口 200 属于另一执行路径和时刻，不能覆盖本次 403；原因尚未确定。下一步在用户已能正常访问 X 的本地真实 Chrome 中按相同边界观察。

## 本地操作

新增 `tools/investigation/observe-login-bootstrap.mjs`，复用 collector 已有 Playwright 依赖，不增加依赖、不自动安装 Chrome。需要本地仓库已安装依赖，并已有正常可运行的 Google Chrome。

从仓库根目录运行：

```bash
node tools/investigation/observe-login-bootstrap.mjs chrome
```

浏览器窗口打开后，不输入账号、不点击登录或验证码，也不要人工操作窗口。工具创建独立临时上下文，不读取日常浏览器 profile/storageState，自动访问首页并等待 15 秒后关闭。网络失败或非 200 停止；不要为了通过而修改指纹。未传 chrome 时使用已安装 Playwright Chromium，但不能将其结果当作 Chrome 155 的等价证据。

终端只输出 JSON 摘要，可以上传该摘要；无需上传 HAR、Cookie 或截图。观察内容为浏览器实际版本、首页状态、最终 origin、请求/错误计数、SDK 名称匹配脚本的 200 响应计数、landing/signals 状态码，以及 guest/header 的存在性与内存相等比较。不会输出完整 URL/query、header、Cookie 值、页面正文、console 内容或错误原文。

脚本加载计数不能证明 SDK 执行、Castle token 生成、Prelude 成功关联或 transaction 有效。guest 比较在异步事件中读取当前 Cookie，只是窗口内一致性线索；Cookie 轮换可能造成不匹配，不能作为严格同请求快照。无 signals 也不代表登录后不需要 Prelude。当前工具不采集字段内容，不发送自建登录请求，不做页面环境模拟。

## 本轮验证层

- REA 已实际启动服务器浏览器，得到上述局部 403 证据并报告清理完成。
- 本地工具仅完成 `node --check` 语法检查；尚未在用户电脑运行，不能声称本地观察成功。
- 文档与 diff 检查通过；本轮没有改业务登录代码、切换 CLI 或提交 Git。

## 本地首次摘要与工具超时修复

用户提供的终端摘要：开始时间 2026-10-17T15:24:56.240Z，Chrome 155.0.8059.80，homepage=200，最终 origin=https://x.com，landingStatuses=[200]；164 请求、1 failedRequest、1 pageError。Castle 脚本 1、transaction 脚本 1、Prelude 脚本 0；signalsStatuses=[]、actionRequests=0。gt/guest_id 存在、账号 Cookie 不存在；9 个 guest 头均与读取时当前 gt 匹配，9 个请求包含 transaction 头。此为用户本地运行回传，服务器未独立复现；脚本加载与头存在不证明生成过程、服务端必要性或账号登录成功。

用户报告超过 3 分钟无输出、手动关闭窗口后才出现摘要，outcome=OBSERVATION_COMPLETE_UNVERIFIED、cleanup=CLOSED。旧摘要无阶段时间线，不能定位唯一挂点，也不能由 CLOSED 推断脚本自动关闭成功。旧实现的 allHeaders、cookies、pending drain 与 browser.close 都缺少外部截止，且最终输出位于关闭之后；这是已确认的工具健壮性缺陷，不能把首页正常显示解释为 Prelude 阻塞。

工具现输出 stderr 阶段提示，并对元数据读取、上下文/页面创建及清理加截止；60 秒总 watchdog，关闭再限 5 秒，最后输出一份 stdout JSON 并退出。新增 lastStage；超时/清理失败有固定结果，不输出原始异常。清理超时可能仍残留浏览器窗口，不能把强制结束 Node 等同于浏览器清理。摘要仍只写 stdout，不自动生成文件。

复测可将 stdout 保存为文件（进度仍在终端）：

```powershell
node tools/investigation/observe-login-bootstrap.mjs chrome > bootstrap-summary.json
```

不要操作窗口。新增两个隔离子进程测试，模拟永不返回的请求头、页面创建和关闭，确认能够限时输出退出；这不是 Windows Chrome 实测。脚本语法与 diff 检查通过，尚待本地复测修复版本。

## Prelude 的调用阶段

本地首页摘要没有 signals，符合当前观察范围。历史授权登录样本中，提交密码后响应导航至 prelude_gate，关联 begin_login_acid；正常客户端的 Input2PreludeToken 路径加载 signals 模块并调用 dispatchSignals，成功提交 signals 后回填同次 dispatch ID，再由正常页面推进验证准备与验证码流程。网络时间接近不能单独证明严格先后，客户端调用链才支持返回 ID 的条件。其他账号、挑战分支或未来版本可能不同，不断言每次登录都走此分支。

Prelude 影响的是该验证准备分支的纯 Node 重建：服务端表单要求 prelude_dispatch_id，正常来源是依赖浏览器上下文的 SDK 执行结果。缺少这个正常提供者时不能用历史值或随机数替代。它不阻塞无账号首页或已实测的 landing GET，也不是本次观测工具应等待的成功条件。

## 人工授权登录观测模式（2026-10-18）

用户明确同意扩展为人工登录观测。超时修复已提交为 e757dd3。新增 --login 显式模式；原无账号模式行为保留。此模式仅为调查，不替换生产 CLI，不启用 SDK token 转交 Node、会话保存或复用。

本地命令（取得包含本模式的代码后）：

```powershell
node tools/investigation/observe-login-bootstrap.mjs chrome --login > login-summary.json
```

1. 本地先关闭旧观测窗口，使用授权账号。在新临时 Chrome 窗口中自行输入账号、密码和验证码，终端不输入凭证。
2. 进入首页后回到终端按 Enter。工具不会自动认定登录完成；最多等 10 分钟，Ctrl+C 可提前停止。若遇未知挑战或异常验证，不继续操作，Ctrl+C 停止。
3. 工具关闭浏览器，仅将脱敏 JSON 写 stdout（以上重定向保存文件），阶段提示在 stderr。向调查方提供 login-summary.json 即可，不提供 Cookie、密码、验证码或浏览器 profile。

记录仅包括已知四个 action、landing/signals 的请求和响应状态、配对 ID、相对毫秒、脚本加载及头/Cookie 的存在性计数。不读取请求正文、不抓 HAR、截图、页面文本或 console，不主动调用 SDK、不代填表、不重试登录。未知 action 只记录 UNKNOWN_ACTION 并停止，不输出其路径。timeline 的事件顺序是监听器收到事件的顺序，不当作严格因果；成功 signals 与后续请求相邻不能证明具体 dispatch 值已回填。

观察到 /home 路径及账号 Cookie 只标记 LOGIN_CANDIDATE_UNVERIFIED；始终输出 identityVerified=false、sessionSaved=false，不输出账号名或 ID，也不进行独立远端身份校验。身份确认与新进程复用为后续阶段。10 分钟超时可能销毁本次临时登录成果；当前不保存会话。

验证：3 个隔离子进程用例覆盖未返回元数据、页面创建/关闭卡住，以及五个已知登录/信号阶段的请求响应配对和秘密值排除。仅 mock 验证，不是本地 Chrome 的人工登录验收。真实账号测试需在用户电脑执行。
