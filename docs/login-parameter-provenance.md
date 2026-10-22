# 登录参数及来源清单（2026-10-19）

范围：用户授权的 Chrome 155 人工成功样本、捕获的 X 前端构建产物与无损 JP-5 响应；调查来源与流转，不生成信号、不重放请求。本表描述已观察到的一条登录分支，不是 X 官方永久契约，也不是服务端最小必需参数清单。

## 一、每步表单

action 基址为 https://jf.x.com/onboarding/web/actions/，POST Content-Type 为 application/x-www-form-urlencoded。具体后继 action 与服务端字段取自当前响应的活跃表单，不从历史请求拼接。

| 步骤 | 参数 | 来源与处理 | 证据/必需性边界 |
| --- | --- | --- | --- |
| begin_login | username_or_email | landing 初始字段，值由用户输入 | 无损 landing 与请求均有；不是 server session token |
| begin_login | password | 关联密码 input 可写入同一表单 | 成功 HAR 此步出现非空值，但 landing 初始 Map 没有；不能提升为首步必须输入密码 |
| login_enter_password | username | begin_login 响应中的表单字段，保留服务端值 | 不擅自改成用户最初输入的邮箱/别名 |
| login_enter_password | password | 用户在密码步骤输入，替换对应空字段 | 不日志输出，不 trim，不写 fixture |
| login_enter_password | session_token | begin_login 的 JP-5 响应包含后继表单，携带该值 | 客户端只恢复并传递；服务端生成算法、过期规则未知 |
| begin_login_acid | session_token | 密码响应的当前表单 | 每步使用当前响应，未来轮换不能机械拒绝 |
| begin_login_acid | from_prelude_gate | 密码响应的当前表单，观察值为 1 | 分支标记，不是用户输入或 SDK token |
| begin_login_acid | prelude_dispatch_id | 正常页面 Prelude 组件调用 SDK，signals 成功后回填结果 | 初始表单为空；正常提供者尚未在纯 Node 中实现；服务端能否允许替代路径未知 |
| finish_login_acid | code | 用户从正常邮箱/手机验证码渠道取得并输入 | 此分支为人工验证码，不生成或绕过 |
| finish_login_acid | destination | begin_login_acid 响应的当前表单，观察为掩码目的地址 | 保留原字段，不从账号名猜测或补完整邮箱 |
| finish_login_acid | session_token | begin_login_acid 响应的当前表单 | 作为不透明服务端状态传递 |
| 四个 POST | $castle_token | 公共 HTTP POST transport 调用正常 Castle 入口，结果非空时追加 | 成功样本四步均有；源码为条件追加，不证明服务端允许省略或每步强制要求 |

登录完成响应的 user_id/username 是候选身份输出，不是应提前生成的请求参数；需独立远端身份校验。finish_login_acid 成功样本设置 auth_token/twid，此前不能凭空准备登录 Cookie。

## 二、请求头与 Cookie

| 项目 | 来源 | 处理与未知项 |
| --- | --- | --- |
| Cookie | 同次浏览器或 Cookie jar 按目标域、路径、有效期提供；随 Set-Cookie 更新 | 不是固定字符串。成功样本动作请求含 gt、guest_id、__cuid、__cf_bm；不能认定都是最低必需。后两项的完整生成链本轮未追踪 |
| gt / x-guest-token | 空白 bootstrap 样本支持首页 Set-Cookie 建立 gt；guest 插件从当前上下文/gt 读取并设置头 | 不无条件调用历史 guest/activate，不复制旧 gt；已实现同次 jar 初始化 |
| guest_id | 空白首页响应 Set-Cookie | 不是用户名或 session_token；按 jar 维护 |
| Authorization | X 前端公共应用 bearer 配置，由 x-auth 插件补齐 | 不是账号密码、auth_token 或用户专属 access token；值不写入文档，公开并不代表所有调用都获授权 |
| x-csrf-token | x-auth 从当前 ct0 Cookie 读取，存在时设置 | 初始空白 ct0 为空不是有效凭证；该成功 HAR 的四个未登录动作没有此头，不证明所有阶段不需要 |
| x-twitter-auth-type | x-auth 按 auth_token / 认证状态及 ct0 条件设置 OAuth2Session | 不对所有 guest 请求无条件硬编码；样本未登录动作中未出现 |
| x-client-transaction-id | 正常客户端 transaction 插件按目标/开关调用生成器 | 历史 landing 与四 POST 均有；首次服务器 GET 探测未提供仍返回 200，仅支持当次 GET；不推导 POST 可省略 |
| x-jf-v | Jetfuel 模块常量 JP-5 | 与解码 schema 绑定，未知版本停止 |
| x-jf-client-theme | 页面传给 transport 的 theme | 属于 UI 上下文，不是安全 token |
| accept-language / x-twitter-client-language | 页面传入的 language | 来自实际会话配置，不复制别人的浏览器值 |
| timezone | Intl.DateTimeFormat().resolvedOptions().timeZone | 来自当前真实运行环境，不固定用户历史时区 |
| Origin / Referer | 浏览器正常请求上下文 | 历史有这些头不证明手填头即可获得同等来源环境 |
| User-Agent / sec-ch-ua / Sec-Fetch-* 等 | 浏览器网络栈及正常策略 | 不属于用户表单参数，不将完整浏览器头盲拷贝到 Node；本项目不做指纹伪装 |
| x-twitter-active-user | 捕获动作请求存在，属于公共请求链 | 本轮未把具体注入点追到完整来源，不认定服务端强制要求 |

OPTIONS 是浏览器 CORS 预检，不是账号登录状态机的新业务步骤；Native HTTP 客户端无需为了复刻 HAR 而逐条照发 OPTIONS。浏览器实际适用的 CORS 策略仍需遵守。

## 三、SDK 配置与 SDK 结果要分开

| 项目 | 来源/职责 |
| --- | --- |
| Castle public key、feature switch | 页面功能配置；aC 读取开关与 public key 后正常 configure，不是 createRequestToken 的返回值 |
| Prelude sdkKey | 页面 Prelude 组件属性，传给 dispatchSignals；配置 key 不等于 dispatch ID |
| Prelude dispatch ID | SDK 同次收集上下文中的 id；同时写入 signals 的 X-SDK-DispatchID，signals 成功后 SDK 才返回该 id |
| signals body | 正常 SDK 对收集上下文调用 generatePayload 的结果，Content-Type 为 application/vnd.prelude.signals；不是普通登录 URLSearchParams 表单 |
| X-SDK-Request-Date、X-SDK-User-Agent、功能标记 | 正常 SDK 为自身请求设置的日期、SDK/core 版本与功能配置；不是手工输入账号时应提供的参数 |
| transaction 生成器参数 | 正常插件为 jf 传 jf/PATCH；这是内部生成器参数，实际业务请求仍是 POST，不能据此改 HTTP method |

不在本表展开指纹构造、信号载荷格式或 token 生成算法。生成非空结果、相同长度或 API 不报错均不等于结果被服务端接受。

## 四、同次抓包交叉核对

对仓库外 manual-login-2/login.snapshot.har 本地解析，仅输出字段名、状态与内存相等比较：

| HAR entry | 观察 |
| --- | --- |
| 149 | landing GET 200 |
| 166 | begin_login POST 200；username_or_email、password、$castle_token |
| 174 | login_enter_password POST 200；username、password、session_token、$castle_token |
| 179 | signals POST 200；X-SDK-DispatchID 存在 |
| 183 | begin_login_acid POST 200；prelude_dispatch_id、from_prelude_gate、session_token、$castle_token |
| 193 | finish_login_acid POST 200；code、destination、session_token、$castle_token；响应设置 auth_token/twid |

HAR params 中 $castle_token 的名称以 %24castle_token 导出，按 URL 编码规范解码名称后记录；不因此把 %24 当业务字段名称的一部分。

两项新核对结果：entry 179 的 X-SDK-DispatchID 与 entry 183 的 prelude_dispatch_id 均非空且相同；entry 174/183/193 的 session_token 均非空且相同。没有输出值，没有与另一次无损 bytes 的 token 拼接。同值关系支持已观察流转，不证明服务端因果、未来 token 不轮换或跨会话可用。

JP-5 初始字段证据来自另一次独立无损录制，只用于解释结构；不能把该次 session_token 当作本 HAR 的当前值。HTTP 200 本身不是登录成功；本报告结合已知成功录制、完成响应结构与 Set-Cookie，但完整自研身份/复用验收仍未完成。

## 五、源码定位与 REA 覆盖

- use-jetfuel-dev-DAyTh4gO.js SHA-256 `af24947dc4c397f845bdf99c212bad06f89570df500cd19d65f34251074dece9`。UTF-16 offset 11986 附近定义 JP-5 与 Intl 时区；13692 的 Ke 构造公共上下文头；16784 的 httpPOST 调用 A(n)、遍历字段 Map、通过 URLSearchParams 编码、非空时追加 Castle；A 导入 startup-dynamic 的 Wn。
- startup-BPgs90Km.js：ai offset 12850 从公共应用配置和 cookie 构造 auth/CSRF；guest 插件 Fa/Ia 约 37636 起从上下文或 gt 取得 guest。读取原文时应用 bearer 值已脱敏，不写入本报告。
- 其他页面字段回写、Prelude 正常入口、Castle/transaction 链见 jp5-login-contract.md 与 sdk-node-feasibility.md。本轮未重复执行 SDK 或扩大为全部脚本审计。

本轮 REA 仅选 use-jetfuel-dev-DAyTh4gO.js，父 Evidence `ev_68612818f707cdee900ddc47934f641a347df2eaabbc12f68d4ec5c96ee447ee`；summary `ev_53ed44b2d3b0cdd9054cc1731fdb94f5c6614343ff0053ab736c390f5169871c`。1 文件解析、0 failure、303 未选；应用图 partial，语义图 partial/truncated、2500 节点上限。

以 $castle_token 为 literal seed 做来源 trace，Evidence `ev_5176f5dd5dd109a8cb486747086674859e20c36b0909c32fd50eddde051ca603`，结果 partial、0 seed match；不能称为不存在或完整证明。参数追加结论由绑定文件的原文逐段读回与 HAR 字段交叉核对建立，不以截断图替代源码证据。

## 六、当前结论与下一证据

已能明确把字段分为用户输入、服务端表单、Cookie 上下文、公共页面配置、正常 SDK/transaction 结果五类；不是所有字段都需要在 Node 内生成。尤其 session_token、username、destination 应来自当前响应。

尚未确定最小必需参数集合、服务端省略策略、SDK 结果跨环境关联、失败表单状态与正常提供者的服务端接口。应先对比同一步成功/失败响应的状态与错误存在性，或取得合作方协议；不通过删除校验字段、重放凭证或补浏览器指纹来建立结论。
