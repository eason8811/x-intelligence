# JP-5 登录状态契约（调查草案）

版本范围：Chrome 155.0.8059.79 对应人工样本及已绑定 bundle；日期 2026-10-15。此文档是 A1 的有限实现契约；纯数据状态提取已实现，完整线上协议仍未验收。

## 证据层与职责

分四层：HTTP 响应及 Cookie → 长度帧/类型 codec → 页面状态及 action 引用 → 登录领域状态。packages/x 承载协议与领域映射；apps/collector 承载终端输入和私有会话存储。不增加共享 package，不让 Web 或数据库依赖页面运行时。

codec 仅解码数据；不执行返回的导航、system action 或页面代码。只认可本业务已验证的 action 与字段，不实现通用页面执行器。

## 状态模型

| 建议领域状态 | 必须提取/核对的证据 | 用户输入/下一步 |
| --- | --- | --- |
| BOOTSTRAP_REQUIRED | 已观察 GET /onboarding/web/landing；其无损字节及空白 guest 上下文仍未补齐 | 不凭旧地址猜测初始化 |
| ACCOUNT_REQUIRED | landing 活跃容器树关联 begin_login，初始字段仅 username_or_email；已在新样本验证 | 用户名/邮箱 |
| PASSWORD_REQUIRED | 活跃根关联到 login_enter_password 表单；username、password、非空 session_token | 隐藏输入 password |
| VERIFICATION_PREPARATION_REQUIRED | 活跃根关联到 begin_login_acid；session_token、from_prelude_gate、prelude_dispatch_id | 浏览器正常 SDK 生成结果；未支持时停止 |
| CODE_REQUIRED | 活跃根关联到 finish_login_acid；code、destination、非空 session_token | 隐藏输入 code；destination 只用于必要提示并脱敏 |
| LOGIN_COMPLETED_UNVERIFIED | 根关联动作中存在已验证 open_account，响应身份字段结构正确 | 合并响应 Cookie，进行独立身份验证 |
| SESSION_VERIFIED | 远端身份等于预期账号；cookie 完整 | 用户确认后原子保存 |
| STOPPED | 未知/歧义状态、拒绝、取消、网络故障等明确原因 | 不隐式回退、重试密码或删除旧会话 |

“根关联”已在 `packages/x/src/jp5/state.ts` 实现有限引用解析：从根导航的 preview 进入活跃树，追踪元素、atom/subatom 与提交引用，排除旁支导航 preview；完成状态按 system 引用读取账号 Map。当前仅支持本次样本中观察到的结构。不能用字符串搜索、固定 property 索引、页面文案或第一个 form 代替状态识别。

## 已观察表单结构

J.form 的解码类型 tag=30，值为 5 元组：action URL、字段 Map、错误 Map、字符串、状态整数。前三项含义有源码与样本支撑，末两项的完整语义尚需追踪，不提前给永久命名。

- begin_login 响应包含 login_enter_password 主表单及 begin_password_recovery 旁支，不能自动选第一个或执行找回流程。
- 密码表单字段：username、password、session_token；password 初值为空。
- 验证准备表单字段：prelude_dispatch_id、from_prelude_gate、session_token；dispatch 初值为空。
- 验证码表单字段：code、destination、session_token；code 初值为空。
- 三表单 session_token 均非空且彼此相等。本地仅比较相等性，不输出值；不能据此拒绝未来合法轮换，轮换语义待验证。
- 本次字节捕获与第二轮 HAR 为不同登录操作，不能将它们的 token 按顺序拼成同一 flow。

## 成功信号

finish_login_acid 状态含 user_id、username、login_success、complete。其 action property 为 multi，包含 change、system(type=8=open_account, ref=2)、scribe。数字 tag 与 ref 仅对当前 schema 有意义，不能把 property 2 永久写死。

open_account 是候选登录完成信号；身份字段不能替代远端校验，成功文案不能替代 Cookie 检查。独立 Viewer/等价账号身份接口尚未确认，不用 ViewerBadgeCounts 冒充。前次 HAR 支持 auth_token/twid 在完成验证码后设置、ct0 随首页更新，不证明只需要这三项 cookie。

## 请求与动态字段

| 字段/行为 | 当前证据 | 未知项/约束 |
| --- | --- | --- |
| x-jf-v | 样本及脚本均为 JP-5 | 升级时版本/schema 必须匹配，未知版本停止 |
| session_token | 由响应表单恢复、三步同值 | bootstrap 来源、轮换、过期与失败语义 |
| $castle_token | 请求脚本按正常 SDK 返回值条件加入表单 | 生成依赖及必要性未验证；不得复制样本 token、伪造或绕过 |
| prelude_dispatch_id | 表单初始为空，正常人工流程稍后提交 | SDK 回填关联与失败策略；不得以随机值替代 |
| guest 上下文 | 首页请求已携带 gt/guest_id | 空白配置首次生成过程未知，不认定必须 guest/activate |
| x-client-transaction-id 等 | HAR/curl 存在 | 是否必需、具体生成与轮换待调查；不因出现就认定必要 |
| cookie | HTTP 层完整处理作用域、更新和失效 | 最小凭证集、跨出口可用性未验收 |

当前纯 HTTP 自研可行范围尚未确定。需要浏览器正常 SDK 的部分若不能在现有约束内实现，应向用户说明证据并提出最小方案调整，不静默退回 Playwright 登录或新增反 Bot 规避。

## 后续验证与失败语义

纯数据引用解析及状态提取已实现，用合成 fixtures 验证：密码找回旁支不抢主流程、错误 Map 非空、未知 action、无根/无表单/多义表单、非法引用和类型不匹配均明确停止。真实原文不得直接进 fixture。

codec 验证需覆盖截断帧、超长帧、未知 tag、变长整数及引用边界；失败不继续提交表单。网络/限流/拒绝不是密码错误；不自动重登。当前没有这些真实失败样本，不能声称已覆盖服务端全部异常。

会话验收仍按：正常登录 → 合并 Cookie → 独立账号身份确认 → 用户确认保存 → 新进程无密码验证同账号。当前完成历史成功响应解码与有限状态提取，尚未完成该链路。

## 有限实现与验证（2026-10-15）

`extractJp5LoginState` 接收已解码的 `Jp5Snapshot`（真实 Map、元素和属性引用），返回四种表单状态或 `LOGIN_COMPLETED_UNVERIFIED`。该函数本身不解码原始字节，不执行 action，不发送 HTTP，不保存会话；新增 codec 见下节。字段值仅在调用方内存中返回；错误仅含固定代码，不包含响应字段值。

未知版本/action、引用越界或循环、过深引用、多活跃表单、字段集合变化、缺少 session_token、非空错误 Map 或非零表单状态均停止。本次仅观察到状态整数 0；将其他值停止是保守实现边界，不代表已确认其完整语义。

验证：5 项合成测试通过；完整 `pnpm x:auth:test` 15/15 通过；x 包 typecheck/lint 与 collector typecheck 通过。另在私有目录将四份真实解码结果转换为 Snapshot，四种后继均识别正确，原始字段未进入仓库或日志。最后的引用边界补充后，5 项合成测试及 x 包 typecheck/lint 再次通过。上述不等于新实现完成真实登录、账号身份校验或会话复用。

下一步调查首页 bootstrap 与初始账号表单，补齐从空白上下文到 begin_login 的证据；Castle/Prelude 正常 SDK 与独立身份校验仍为后续门槛，不接入密码自动提交。

## landing 补录与账号状态

收到 `x-login-bytes-1-landing.json`：HTTP 200，6439 字节，两帧 6428/3，长度与 SHA-256 匹配，逐帧完整消费。解码为 dom_data/dom_ready，124 元素、187 属性。此捕获是另一次操作，不能与此前四步拼成一次完整登录。

landing 的 root 是直接容器树，区别于后续步骤的导航 action root。根下活跃树只关联一个 begin_login 表单，字段 Map 仅 username_or_email（空值），错误 Map 空、状态 0；没有 session_token。注册表单存在于非活跃导航 preview 中，不能因其存在而提交注册请求。

状态提取新增 ACCOUNT_REQUIRED，只允许该直接根结构用于 begin_login；活跃树仍要求唯一表单与精确字段集合。其他形状继续停止，不把此样本提升为通用 UI 解析。合成测试覆盖账号提取、注册旁支排除、额外字段及多表单拒绝。

前次 HAR 的 begin_login 请求还带 password 与 $castle_token，而本次响应初始字段没有它们。跨次样本与客户端回填逻辑尚未闭合，不能据此删除请求字段，也不能把观察到的字段写死为最小充分请求集。下一步追踪正常客户端从账号输入到请求编码的字段变化、guest transport 依赖及 SDK 边界，再决定最小 HTTP 原型。

## 客户端补充字段与 transport 边界（2026-10-17）

本轮使用既有原文与真实解码对象做静态追踪，没有调用登录接口、执行 SDK 或生成 token。

| 项 | 来源与证据 | 可实现边界 |
| --- | --- | --- |
| username_or_email | landing 主表单的字段 Map，后由用户输入更新 | ACCOUNT_REQUIRED 返回的是响应初始字段，不是最终请求完整快照 |
| password（第一步） | landing 账号元素 94 的属性 -19077 → property 159 → 字符串 password；纯属性哈希计算确认 -19077 对应 linkedPasswordField | 页面生成关联密码 input，其 change/blur 将值经 gs 写入同一表单；账号清空时也可写入空 password。不能把该字段固定为必需或凭空补密码 |
| $castle_token | use-jetfuel-dev 的 ct.httpPOST 调用导入 A；A 绑定 startup-dynamic 导出 Wn=uC，最终调用正常 SDK createRequestToken；成功返回时追加到 URLSearchParams | feature switch/public key、SDK 加载、失败与超时影响返回值；客户端条件追加不等于服务端允许省略。不得复制样本 token 或伪造 |
| Authorization / CSRF / auth type | startup 的 x-auth 插件按目标域、cookie 和认证状态补齐；jf.x.com 在目标集合内 | 本轮只确认本地构造链，不证明任何固定头集合足够。文档不存值 |
| credentials | 同一 x-auth 插件对 x.com/twitter.com 及子域设置 include | 自研 HTTP 必须用 cookie jar 正确实现作用域与响应更新，不能只复制请求头 |
| x-guest-token | x-guest-token 插件优先从上下文或 gt cookie 读取；另有 guest 刷新路径 | 本次 HAR 起点已有 guest，未证实空白浏览器如何首次进入此状态；不机械移植重试策略 |
| x-client-transaction-id | 历史 HAR 有该头 | 本轮尚未闭合生成/注入链及必要性，不复用历史值 |

关联密码来源的证据层：HAR begin_login 的 password 非空；静态代码证明可写入途径，无法证明具体一次录制中是自动填充、人工操作还是其他页面行为触发。新 landing 与旧 HAR 非同次流程，不声称已复现这次字段变化。当前状态提取器继续只验证响应初始 Map；未来请求构造须另设明确输入与动态字段提供边界，不把响应 allowlist 当成最终请求 allowlist。

源码定位（UTF-16 字符 offset，仅对所绑文件有效）：video-container 的 va 35380、gs 119945、linkedPasswordField 121030、输入回写 124100 附近、关联密码 input 126383 附近；startup 的 x-auth 12850 起、guest 读取 37636 起、transport 插件组合 42489 附近；startup-dynamic 的 aC 253579、cC 254097、uC 254478。属性 hash 只在无网络 vm 中提取纯 ji/Ai 计算，未执行页面或 SDK。

REA 父 Evidence：`ev_10f01126fb37734d665acc55cc59e136cef9d9cb54a72d11f2fd93d1f5acc52a`。选择 startup 两文件，2 个 JS 解析成功、0 parse failure；302 文件未选，图 partial，不能称为完整 transport 调用图。关键结论来自局部原文读回与既有 landing 对象交叉核对。

文件 SHA-256：

- startup-BPgs90Km.js：`a1798ec5a974c2373acd6ea42a14e16ab7ed5cdbeb6ad5eb42820065723a3708`
- startup-dynamic-HMYQUZdZ.js：`b70c8b18437bd8489e452511af34924c89017261e1faad351735e5ffcf1cb65e`
- video-container-CusfPNz4.js：`577f784eeab9a577a2a5a95c47d31048bccc3f4406781dcfe9abf7b368ad302c`

下一步先把已有响应 codec 从私有验证脚本收敛为可审查的最小、带长度/类型限制的仓库模块，并用合成异常输入和私有真实样本验证；无需再录一次密码登录。完整网络编排仍暂不启用，待 guest/transaction 注入与正常 SDK 运行方式、独立身份接口明确后再确定最小方案调整。

## 受限字节 codec 实现（2026-10-17）

`packages/x/src/jp5/codec.ts` 导出 `decodeJp5Snapshot(bytes, version)`，调用方显式提供已核对版本 JP-5；字节本身没有用于此函数验证版本的独立声明。它读取 4 字节小端长度帧及 schema 类型，返回带 Map/BigInt 的 Snapshot，可交给 `extractJp5LoginState`。不执行任何 action、表达式、页面脚本或 SDK，不使用 eval/vm，不调用网络。不包含请求编码器。

范围仅接受一份完整响应按序包含一个 dom_data 和一个 dom_ready。不支持 action 消息、增量更新、多批数据或重排；这些情况明确停止。不会把此完整响应适配器称为通用 Jetfuel 运行时。

限制：响应最多 1 MiB、最多两帧、每帧累计集合条目最多 100000、解析嵌套深度最多 64。检查帧边界及完全消费、JS 安全整数/规范变长整数、严格 UTF-8、bool/optional 标志、有限浮点数、重复 Map 键、未知类型和根索引边界。非法值返回固定错误代码，不携带响应内容。严格 UTF-8、规范整数、bool 和有限浮点限制是本实现的保守策略，不能宣称与上游对所有异常输入等价。其他页面引用的语义有效性仍由状态提取层检查；解码成功不代表所有引用有效或账号已验证。

5 项合成测试覆盖有效帧与非零 byteOffset、逐字节截断、尾随内容/帧顺序、未知标签/根索引/标志、非法 UTF-8/整数、集合/字节/递归上限和重复键。测试文件不含真实样本。

私有差分脚本对六份捕获（landing、两个 begin_login、其余三步）使用新模块解码，与原 bundle 隔离 decoder 的完整结果逐字段 deepEqual，全部一致；随后同一状态提取函数均返回预期状态。真实样本、差分脚本及 token 留在私有目录。相同 schema 来源的差分结果不构成独立协议认证，也不证明失败分支或未来版本兼容。

## 独立身份候选与 transaction 注入定位（2026-10-17）

只读检查既有 HAR：login entry 195/318 的 GET /home HTML 内有以 `window.__INITIAL_STATE__=` 开始的 script，其中 session.user_id 对应 entities.users.entities[user_id]，其 id_str 与 session.user_id 一致。两份首页身份一致；login entry 298 与 session-reuse entry 127 的 GET /1.1/account/settings.json 均含非空 screen_name，均与上述首页账号名一致。settings 顶层没有用户 ID，不能单独证明不可变账号 ID；session-reuse entry 0 的首页正文为空，不能声称该次首页 ID 已检查。未把不同次 bytes 捕获中的身份与历史 HAR 拼为一条登录流程。

POST /1.1/graphql/viewer_context.json 在捕获中提交 category/log，响应为空。旧 main bundle 也将该路径放在 keepalive/sendBeacon 处理列表中；这不是已验证的 Viewer 查询。/flow/viewer.json 同样未提供可用身份响应，不按名称当作身份接口。ViewerBadgeCounts 继续不作为认证依据。

新增 `extractXHomeIdentity(html)` 与 `assertXHomeIdentity(actual, expected)`：仅解析限定 script 开头的 JSON 数据，不执行 script；验证 session ID、对应用户 id_str 和账号名。ID 保持原始十进制字符串；ID 精确比较，账号名比较忽略大小写。限制 HTML 长度 2 Mi 个 UTF-16 code units、JSON 嵌套 64；缺失/歧义/无效或身份不符抛固定代码。仅是观察到的旧首页 SSR 数据适配器，不是任意 HTML 解析器，不支持新首页格式或客户端生成状态；变化时停止。

调用方仍必须验证实际请求为授权 X 来源、成功响应、无认证重定向、非旧缓存，并在新进程重新请求后验证；解析出对象或本地匹配不返回 SESSION_VERIFIED、不保存凭证。新会话预期 ID 应来自同次登录候选响应，账号名应与用户确认的目标匹配；这里尚未实现这些网络与交互环节。

transaction 的静态链已定位：startup-dynamic 的 Uu 插件（56838 附近）在目标/开关条件下注入 x-client-transaction-id，经 Vu → Bu → zu 动态加载 sign.o-DyQ9HcFr.js。jf.x.com 分支给正常签名入口传入 `jf`/`PATCH`；这些是客户端生成器参数，不是改变实际 HTTP method 的指令。未执行生成器、移植算法或伪造头；生成依赖及服务端必要性仍未验收。此定位复用前轮已选文件与 Evidence `ev_10f01126fb37734d665acc55cc59e136cef9d9cb54a72d11f2fd93d1f5acc52a` 的原文局部读回，未将 partial 图当完整运行证据。

下一步 HTTP 编排前还需确定正常 SDK/transaction 运行边界与空白 guest 初始化。身份验证可优先设计为获取实际首页、提取不可变 ID 并比较，settings 仅辅助核对账号名；本轮历史验证不证明服务器出口请求能成功。

## 空白 guest 与 SDK 启动条件的调查结论（2026-10-17）

- 既有 447 条 login HAR 记录未观察到 guest/activate 或 help/settings 请求；首个 GET / 已带 gt/guest_id。landing 及 begin_login 也已带 guest 与 transaction 头。该有限负面结果只说明捕获缺少 guest 首次来源，不能认定激活 API 已废弃。
- startup 中 xa/ka 仍有正常 POST guest/activate 的实现；浏览器和服务端分支使用不同基址/上下文，存在同请求合并、缓存和过期恢复。Ia 在缺 guest 时的自动激活条件还区分 window/SSR；不能把“存在 ka 函数”当作正常浏览器首访必经调用。现阶段不移植完整重试器，也不采用已缓存的旧 guest。
- Castle：aC 受页面路径、feature switch 和 public key 控制；oC 在 idle 时尝试初始化；uC 请求 createRequestToken，cC 施加 15 秒超时。SDK 源码包含浏览器全局依赖。尚未证明其在 Node 中可直接运行或服务端可不提供 token；本轮没有执行/模拟 SDK。
- Prelude：dispatchSignals 收集上下文、generatePayload、POST signals，确认 HTTP 成功后返回同次 collect 生成的 dispatch ID。录制 entry 179 是一次成功 signals 请求；空响应不代表没有作用。id 不能随机替代或跨次复用。初始化依赖页面正常 SDK，不伪造浏览器环境。
- transaction：sign.o 脚本被静态分析并有 window/document 依赖线索。此项不等于完整 DOM 调用链、每个分支都依赖 DOM，亦不能据此断言纯 HTTP 数学上不可实现。生成入口已定位，运行兼容性与服务端要求未验证，不执行或重建信号算法。

REA 精确分析 sign.o 的父 Evidence `ev_62cba361b1e817a302056349c54e8153108d13c9d66fb98e0c597031b93100ff`：1 JS 解析、0 失败、303 文件未选、graph partial。SHA-256：sign.o `b12e5f76bae961f9dd41fd1933585442991e21eb9a415555c3858195b73ebf5d`；signals `9026dffd63d5e3d424f22b177ed9280b60f6d37ad00e4418b89cb8de4a0f34a9`；Castle `25b2272d619b2d11c7625aabf3fb12b48e789e87dad18ac06e1aa7da582e6399`。后两文件仅做局部文本读回，不称为 REA 完整分析。浏览器全局名称计数不是执行证据。

结论：保留直接 HTTP 登录目标；尚不能声称 Node-only 登录已可运行，也没有证据充分断言纯 HTTP 不可能。若后续确需正常浏览器辅助提供同会话动态上下文，须先提出最小架构调整并让用户选择，不能静默恢复 Playwright 登录、注入历史 token 或加入环境伪装。

当前最小证据请求是一次独立空白浏览器配置的启动 HAR，止于账号输入界面，无需登录。操作见 [空白 guest 补录](bootstrap-capture.md)。SDK 动态运行方式仍单列待验，不把该 HAR 当作动态信号生成方案。新增只读 metadata 检查工具用于检查录制范围，原始值始终留私有目录。

## 空白 bootstrap HAR 校验结果（2026-10-17）

收到仓库外 `clean-bootstrap/bootstrap.har`，7593238 字节，SHA-256 `45b2e782a4fec762904edc01a8f9e474f4fdb36dda07219b587d8610533e72a0`，117 条记录。目录 700、文件 600。仅本地解析；摘要绑定此文件，不提供来源认证。

entry 0 的 GET https://x.com/ 没有 Cookie 请求头、request.cookies 为空，也没有 x-guest-token，HTTP 200。响应 Set-Cookie 中 gt 与 guest_id 非空，域 .x.com、Path=/、Secure；ct0 为空，不能作为 CSRF 凭证。后续 entry 104/106/107/110/112/115 的 x-guest-token 均与 entry 0 设置的 gt 相等，比较仅输出布尔值。

本次捕获支持正常首页响应建立 guest 上下文：先请求首页、用 Cookie jar 按作用域/有效期处理 Set-Cookie，再从当前 gt 构造正常 guest 请求头。未记录额外 guest/activate；不要求在此路径无条件调用旧激活入口，亦不认定激活接口废弃。HAR 自报 Cookie 未出现仍受导出范围/脱敏影响；结合用户按空白配置录制的说明及后续相等关系，这是一次历史样本证据，不是服务器出口新请求验收。

本次没有 jf.x.com landing 请求，不能声称空白 guest→landing→begin_login 已在同一录制贯通，也不要求为了本轮结论再次提交账号密码。Castle 和 transaction 脚本已加载；加载不等于 SDK token 已生成，未观察 Prelude signals，不能推断验证步骤不需要它。

metadata 工具扩展只输出首次响应 guest/ct0 是否非空与后续 guest 头匹配计数；本次 6/6 匹配。工具继续固定 cleanBootstrapProven=false，表示不自动认证上下文起点、未脱敏性及完整协议；与上述人工核对的有限结论不矛盾。

下一实现边界：可设计首页初始化器，以空 Cookie jar 发一个正常 GET / 并返回临时 guest 上下文；必须先处理非 2xx、重定向、无 gt、空/过期 cookie，失败停止，不能以旧 cookie 或伪造 token 回填。正常 SDK/transaction 的运行方式仍独立待定，guest 来源闭合不代表可以启用完整 HTTP 登录。

## 首页 guest 初始化器（2026-10-17）

新增 `packages/x/src/jp5/bootstrap.ts`，导出 `bootstrapXGuest` 和 transport 类型。每次创建独立空 Cookie jar，只请求 GET https://x.com/，默认 Node fetch、redirect=manual、15 秒 AbortSignal、无重试；只读取响应元数据并取消未使用正文，不执行 HTML。自定义 transport 是可信适配边界，必须遵守空上下文、manual redirect 和 signal，不能内置旧会话或自动登录；本模块不证明任意适配器满足这些条件。

要求响应 URL 原样为首页、HTTP 200、text/html；非 200、重定向、错误来源或媒体类型明确停止。Set-Cookie 独立逐条交给 tough-cookie（strict parsing/prefix security），最多 64 条、每条最多 8192 字符。协议错误固定代码，不保留响应正文或原始网络异常，不回退旧 gt。

jar 中的 gt 必须在首页和 jf landing 作用域均唯一、非空、未过期且一致；仅限 x.com 主机或 /onboarding 路径的 gt 不满足 bootstrap 契约。非空 auth_token/twid 不允许悄悄把该 guest 上下文变为登录会话。空 ct0 由 jar 按普通 Cookie 规则处理，不据此生成 CSRF 头。

返回对象仅提供 `headersFor(url)`，限定 https 的 x.com、jf.x.com、api.x.com 三个 origin；输出 cookie 和 x-guest-token，并在每次调用时重新检查 gt 是否有效。拒绝其他域名、非 HTTPS、userinfo 与 fragment。对象不暴露 jar 或凭证属性，JSON 序列化为 {}；返回的请求头仍是私密凭证，调用方不得日志输出或公开存储。当前没有后续响应合并、Cookie 轮换或已登录会话持久化接口，不把临时 guest 当账号登录成果。

将既有间接依赖 tough-cookie@6.0.2 声明为 x 包直接依赖，复用锁定版本管理 domain/path/expiry，不手写 Cookie 解析器。package.json 与 lockfile 同步；未升级既有依赖。默认 Node fetch 没有复制上游特殊 HTTP/TLS 配置，也未将新初始化器切换为现有认证 CLI 的默认实现。

5 项新增合成测试覆盖空请求、跨子域/host-only/path、到期/删除/歧义 Cookie、拒绝/重定向/非 HTML、异常脱敏/取消、默认 fetch 的 manual 行为及正文取消。所有请求都由测试 transport/mock 接管，没有向 X 发请求；真实服务器出口可用性未验证。下一步仍需确定正常 SDK 与 transaction 提供方式，再设计完整编排，不能通过省略动态字段来宣称可用。

## 服务器无账号入口实测（2026-10-17）

在当前服务器执行正常 Node HTTP 请求，不导入历史 Cookie、无密码、无验证码、未执行/生成 Castle、Prelude 或 transaction 信号。先单独调用一次 bootstrapXGuest 成功；再在新一次临时上下文中依次执行首页初始化与 GET jf landing。共 3 个 HTTP 请求，无自动重定向、无失败重试。没有启动浏览器或调整 TLS/浏览器指纹。

后一轮脱敏报告时刻为 2026-10-17T06:06:07.271Z：bootstrap=ok，landing HTTP 200，redirected=false，6465 字节，decodeJp5Snapshot→extractJp5LoginState 得到 ACCOUNT_REQUIRED。报告和一次性探测脚本留在私有 login-bytes 目录，不保存 Cookie 或响应字节到仓库。此为当前服务器真实入口证据，不是用户浏览器历史录制。

landing 请求使用同次首页 jar 的 Cookie/guest，JP-5、主题/语言/时区、Origin/Referer，以及已绑定公开前端脚本中的应用 bearer。应用 bearer 是客户端公开配置，不是从 HAR 复制的账号会话凭证；不将其值写入文档。请求没有 x-client-transaction-id，也未生成 SDK token。这只证明该次账号入口 GET 被接受，不建立这些字段对后续 POST 可省略、长期可用、白名单生效范围或完整登录成功的结论。

更新推进边界：动态 SDK 问题不再阻塞本次已测的首页与账号入口 GET；仍阻塞完整 POST 登录可用性的判断。现有生产 CLI 未切换，未提交账号，未验证密码/验证码、独立远端账号身份或跨进程复用。

下一步可将该最小 landing 读取路径收敛为库模块：显式公开应用配置、限定 URL/方法、同次 Cookie 上下文、响应大小/超时限制、处理 Set-Cookie 更新并解码状态。随后再做离线请求编排与动态字段提供边界；没有运行时提供者时停止，不填历史 token 或伪造值。真实账号阶段继续使用终端隐藏输入，不在聊天或日志索要密码。
