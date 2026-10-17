# 登录运行时路线决策（2026-10-17）

当前可以正常 HTTP 初始化 guest、读取 landing，并离线编码四步表单。当前没有生产 Castle、Prelude 或 transaction 提供者，尚不能启用完整 POST 登录。仅校验调用方提供的非空字符串不能建立同会话绑定；继续增加接口不能替代真实运行证据。

## 本轮复核证据

只读复核用户已有捕获，未重新登录、未发送 signals、未执行 SDK，也未输出凭证。下列 offset 按 UTF-16 code units，文件位于仓库外 manual-login-2/codec-scripts。

| 观察 | 文件与位置 | 结论边界 |
| --- | --- | --- |
| Prelude core 构造器在 window 不存在时抛 browser-like environment 错误；锁路径另检查 navigator/isSecureContext | signals-CizIIZE3.js，249764 附近 | 此捕获 Web SDK 的直接 Node 路径不满足环境要求；不证明所有官方 SDK 或纯 HTTP 方案不可能 |
| dispatchSignals 调用 collect → generatePayload → POST /v1/signals；只在响应 ok 后返回同次 collect.id | 同文件，263314 | dispatch ID 是正常执行结果，不能凭空填值或复用捕获 |
| ce.collect 读取 window.location.hostname；ue.collect 收集真实浏览器能力，包含 document canvas 调用 | 同文件，255955 起 | 正常运行依赖页面上下文；复制 Cookie 不是浏览器上下文等价证明 |
| Castle 的 X 客户端初始化先读 window.location.pathname，检查 feature/public key，再加载 configure；uC 调用 createRequestToken | startup-dynamic-HMYQUZdZ.js，253579 起 | 当前正常集成路径依赖页面；未证明 Castle SDK 的全部分支都不支持 Node |
| transaction 初始化缓存生成函数；jf 生成入口参数为 jf/PATCH；异常时有上游编码错误字符串分支 | 同文件，56354 起 | PATCH 不是实际 HTTP method；本项目不复制该错误字符串作为成功凭据，也不据此认定服务端接受 |

本机只做环境能力读取：Node v24.14.0；window/document/isSecureContext/Worker 为 undefined，navigator 为 object。没有给 Node 注入页面全局对象、运行第三方 SDK 或调用信号端点。这是宿主环境证据，不是 SDK 执行测试。

文件 SHA-256：signals `9026dffd63d5e3d424f22b177ed9280b60f6d37ad00e4418b89cb8de4a0f34a9`；Castle `25b2272d619b2d11c7625aabf3fb12b48e789e87dad18ac06e1aa7da582e6399`；startup-dynamic `b70c8b18437bd8489e452511af34924c89017261e1faad351735e5ffcf1cb65e`。Castle 本体只局部读回公开 API 与环境相关代码，不把混淆字符串命中当作完整调用图。

## 可执行路线

### A：保持纯 HTTP 目标

从合作方获得服务端支持的登录入口、Node SDK 或动态字段提供契约，并明确白名单是否允许/要求这些字段。现有 guest、codec、状态和表单编码模块保留。获取方式、使用范围与凭证交付需单独明确；本轮不会代发消息或索要聊天中的密码。

退出条件：有可实际运行的正常提供者，能证明其输出与当前 guest/动作/时间关联，并在授权账号上逐步验证。没有该提供者时停止在离线构建，不以“白名单可能允许省略”自动试密码登录。

### B：允许正常浏览器参与协议验证

这是对“终端纯 HTTP 登录”目标的架构调整，需要用户明确选择后才实施。先用独立临时浏览器配置，仅验证正常页面、guest、SDK 加载与请求的关联，不输入账号密码。保留真实浏览器环境，不设置伪装 UA、不修改 webdriver 或 canvas，不注入历史 Cookie/信号。

第一阶段不承诺“浏览器生成 token 后转给 Node 即可用”。若后续需要账号验证，应先让页面与正常 SDK 在同一浏览器上下文工作，观测完整流程；浏览器侧网络和 Node 侧网络的 Cookie/设备/出口关联是独立待验证条件。可能最终采用浏览器登录后私有保存会话、HTTP 采集，这必须另行确认，不能静默取代当前目标。

退出条件：先拿到同一上下文正常运行证据，再决定是否存在受支持的 Node 提交边界。账号验证时继续使用用户控制的隐藏输入，不在聊天中传密码/OTP。

## 当前交付

本轮只补充路线决策与证据，不新增空实现提供者、不安装软件、不切换 CLI、不提交 Git。运行时路线选定后继续实施；完整登录、独立身份验证和跨进程复用仍未验收。

REA 限制：尝试读回历史 Evidence `ev_62cba361b1e817a302056349c54e8153108d13c9d66fb98e0c597031b93100ff`，当前连接报告未保留，未把历史 ID 当作本轮可读回证据。随后仅选择 signals/Castle 两文件发起静态分析，等待期间未取得返回结果，已停止本轮等待；不报告成功、失败、覆盖率或新 Evidence ID。上述本轮结论来自哈希绑定的原文局部检查与 Node 能力读取，不依赖未返回的图分析。

## 用户已选择路线 B

2026-10-17 用户明确允许正常浏览器参与验证，先仅验证无账号页面与 SDK 上下文，后续再评估 HTTP 提交边界。服务器受控 REA 场景已尝试，初始 GET / 返回 403，导航失败，未到 SDK 阶段，临时进程已清理。后续转为本地真实 Chrome 无账号观测，步骤与局部证据见 [浏览器运行观察](browser-bootstrap-observation.md)。不因此启用浏览器账号登录或 Node token 转发。
