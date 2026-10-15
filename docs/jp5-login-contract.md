# JP-5 登录状态契约（调查草案）

版本范围：Chrome 155.0.8059.79 对应人工样本及已绑定 bundle；日期 2026-10-15。此文档是后续 A1 设计输入，不是已实现接口或完整线上协议说明。

## 证据层与职责

分四层：HTTP 响应及 Cookie → 长度帧/类型 codec → 页面状态及 action 引用 → 登录领域状态。packages/x 承载协议与领域映射；apps/collector 承载终端输入和私有会话存储。不增加共享 package，不让 Web 或数据库依赖页面运行时。

codec 仅解码数据；不执行返回的导航、system action 或页面代码。只认可本业务已验证的 action 与字段，不实现通用页面执行器。

## 状态模型

| 建议领域状态 | 必须提取/核对的证据 | 用户输入/下一步 |
| --- | --- | --- |
| BOOTSTRAP_REQUIRED | 协议版本、guest 上下文、初始登录 action；当前未补齐 | 不凭旧地址猜测初始化 |
| ACCOUNT_REQUIRED | begin_login 请求契约；首页完整状态关系仍未恢复 | 用户名/邮箱 |
| PASSWORD_REQUIRED | 活跃根关联到 login_enter_password 表单；username、password、非空 session_token | 隐藏输入 password |
| VERIFICATION_PREPARATION_REQUIRED | 活跃根关联到 begin_login_acid；session_token、from_prelude_gate、prelude_dispatch_id | 浏览器正常 SDK 生成结果；未支持时停止 |
| CODE_REQUIRED | 活跃根关联到 finish_login_acid；code、destination、非空 session_token | 隐藏输入 code；destination 只用于必要提示并脱敏 |
| LOGIN_COMPLETED_UNVERIFIED | 根关联动作中存在已验证 open_account，响应身份字段结构正确 | 合并响应 Cookie，进行独立身份验证 |
| SESSION_VERIFIED | 远端身份等于预期账号；cookie 完整 | 用户确认后原子保存 |
| STOPPED | 未知/歧义状态、拒绝、取消、网络故障等明确原因 | 不隐式回退、重试密码或删除旧会话 |

“根关联”尚需实现引用解析与验证；当前文档中表单路径及最终动作来自真实解码对象读回。不能用字符串搜索、固定 property 索引、页面文案或第一个 form 代替状态识别。

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

先做纯数据引用解析及状态提取，用合成/明确脱敏 fixtures 验证：密码找回旁支不抢主流程、错误 Map 非空、未知 action、无根/无表单/多义表单、非法引用和类型不匹配均明确停止。真实原文不得直接进 fixture。

codec 验证需覆盖截断帧、超长帧、未知 tag、变长整数及引用边界；失败不继续提交表单。网络/限流/拒绝不是密码错误；不自动重登。当前没有这些真实失败样本，不能声称已覆盖服务端全部异常。

会话验收仍按：正常登录 → 合并 Cookie → 独立账号身份确认 → 用户确认保存 → 新进程无密码验证同账号。当前只完成历史成功响应解码与状态草案，尚未完成该链路。
