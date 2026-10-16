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

`extractJp5LoginState` 接收已解码的 `Jp5Snapshot`（真实 Map、元素和属性引用），返回四种表单状态或 `LOGIN_COMPLETED_UNVERIFIED`。不解码原始字节，不执行 action，不发送 HTTP，不保存会话。字段值仅在调用方内存中返回；错误仅含固定代码，不包含响应字段值。

未知版本/action、引用越界或循环、过深引用、多活跃表单、字段集合变化、缺少 session_token、非空错误 Map 或非零表单状态均停止。本次仅观察到状态整数 0；将其他值停止是保守实现边界，不代表已确认其完整语义。

验证：5 项合成测试通过；完整 `pnpm x:auth:test` 15/15 通过；x 包 typecheck/lint 与 collector typecheck 通过。另在私有目录将四份真实解码结果转换为 Snapshot，四种后继均识别正确，原始字段未进入仓库或日志。最后的引用边界补充后，5 项合成测试及 x 包 typecheck/lint 再次通过。上述不等于新实现完成真实登录、账号身份校验或会话复用。

下一步调查首页 bootstrap 与初始账号表单，补齐从空白上下文到 begin_login 的证据；Castle/Prelude 正常 SDK 与独立身份校验仍为后续门槛，不接入密码自动提交。

## landing 补录与账号状态

收到 `x-login-bytes-1-landing.json`：HTTP 200，6439 字节，两帧 6428/3，长度与 SHA-256 匹配，逐帧完整消费。解码为 dom_data/dom_ready，124 元素、187 属性。此捕获是另一次操作，不能与此前四步拼成一次完整登录。

landing 的 root 是直接容器树，区别于后续步骤的导航 action root。根下活跃树只关联一个 begin_login 表单，字段 Map 仅 username_or_email（空值），错误 Map 空、状态 0；没有 session_token。注册表单存在于非活跃导航 preview 中，不能因其存在而提交注册请求。

状态提取新增 ACCOUNT_REQUIRED，只允许该直接根结构用于 begin_login；活跃树仍要求唯一表单与精确字段集合。其他形状继续停止，不把此样本提升为通用 UI 解析。合成测试覆盖账号提取、注册旁支排除、额外字段及多表单拒绝。

前次 HAR 的 begin_login 请求还带 password 与 $castle_token，而本次响应初始字段没有它们。跨次样本与客户端回填逻辑尚未闭合，不能据此删除请求字段，也不能把观察到的字段写死为最小充分请求集。下一步追踪正常客户端从账号输入到请求编码的字段变化、guest transport 依赖及 SDK 边界，再决定最小 HTTP 原型。
