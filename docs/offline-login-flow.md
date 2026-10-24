# 无浏览器离线登录演示

运行 `pnpm x:auth:offline`。仅使用内置合成状态与输入，不打开浏览器、不执行 SDK、不访问网络、不读取账号会话。

顺序为账号 → 密码 → 验证准备 → 验证码 → 候选完成。每一步复用现有表单构建器校验 action、字段及输入，报告只包含阶段、目标地址和缺失运行时能力，不输出表单内容。合成状态允许 session_token 逐步变化。

配置入口：`X_OFFLINE_LANGUAGE`（默认 zh-CN）、`X_OFFLINE_TIMEZONE`（默认 Asia/Shanghai）、`X_OFFLINE_TIMEOUT_MS`（1–60000，默认 15000）。超时值仅校验配置，本演示没有网络操作，因而不执行网络计时。没有新增依赖。

`fixtureSequenceComplete` 只表示合成状态序列完整。`liveExecution.status` 始终为 `BLOCKED_RUNTIME_UNAVAILABLE`；Castle、transaction、Prelude 尚无受支持提供者，本演示不接受 token 注入。候选完成不等于远端身份确认。

该入口在已解码状态层进行离线编排检查，不模拟 Cookie 更新或原始 JP-5 字节解码；这些由既有 bootstrap、landing、codec 测试分别验证。它不是可接入网络的登录驱动。

后续仍需 HTTP POST 适配、远端身份检查、会话保存及跨进程复用，最后才是 HomeTimeline。上述阶段仅报告为未完成门槛，不调用已有采集器。`pnpm x:auth` 继续使用既有 twitter-monitor HTTP 驱动，不受此演示影响。
