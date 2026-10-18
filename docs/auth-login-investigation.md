# A0 授权登录样本调查

日期：2026-10-14。准备基线：`ebac114`。状态：已执行无凭证登录入口探测，页面导航 HTTP 403；成功登录及会话复用样本尚未取得。

## 工具与样本现状

- 本机 REA CLI 6.5.0；`rea doctor --client codex --skill --format json` 的指定范围 healthy=true，Codex 注册与 Skill aligned。
- 当前聊天未暴露 REA MCP 工具，使用已安装 CLI；不重复安装或修改注册。用户此前在另一会话已验证实时 MCP 连接，不把本次 doctor 当作实时连接验证。
- 本次检查 `~/rea-investigations/`、仓库 `debug-artifacts/` 与当前附件中的 HAR/SAZ 文件，未发现可用样本；未搜索其他账号目录或读取私有 cookie。
- 已核对实际 CLI：`rea inspect-web-network-capture ABSOLUTE_PATH har --format json`。原始结果保存私有目录，不直接输出聊天。

## 录制两份样本

1. 登录样本：使用授权账号及独立调查浏览器配置。在进入登录页面前打开 Network，启用 Preserve log，清空旧记录；人工完成一次正常登录和实际出现的验证，等待首页加载后导出含可用响应内容的 HAR。未知挑战不绕过，失败不反复提交密码。
2. 复用样本：保留相同浏览器配置及会话，结束浏览器后重新打开；在导航前开启 Network，记录进入首页且无需输入密码的过程，再导出 HAR。若浏览器重启前的初始请求未录到，记录缺口，重新录制不能混称为同一次过程。
3. 两份文件分别命名 `login.har`、`session-reuse.har`，置于服务器仓库外私有目录；另记录 UTC 时间、浏览器版本、运行机器和出口是否相同。不要把密码或验证码发到聊天。

浏览器默认导出可能排除 Cookie 或部分正文：在报告中明确缺失，不将未记录 cookie 当作不存在。HAR 本身可能包含请求密码/验证码及会话凭证；传输与保存按账号凭证处理。

## 调查问题与请求矩阵

| 编号 | 问题 | 所需证据 | 当前状态 |
| --- | --- | --- | --- |
| Q01 | 登录开始是否使用 API guest，还是其他初始化方式？ | 登录前完整请求序列、响应结构 | 未观察 |
| Q02 | Init 请求字段及返回 subtask 是什么？ | onboarding 初始化请求/响应，HAR ordinal | 未观察 |
| Q03 | instrumentation 来自哪里、何时提交？ | 脚本与任务请求关联；必要时静态脚本分析 | 未观察 |
| Q04 | 用户名、密码、补充标识、2FA 的实际任务顺序？ | task 类型及字段形状，敏感值不输出 | 未观察 |
| Q05 | 成功如何表示，哪些 cookie 更新？ | 成功响应、Set-Cookie 名称与属性 | 未观察 |
| Q06 | Viewer 或等价身份请求如何确认当前账号？ | 实际身份接口与响应结构 | 未观察 |
| Q07 | 新进程/浏览器如何复用会话？ | 复用样本、匿名化账号一致性及 cookie 更新 | 未观察 |
| Q08 | 与固定上游有哪些有证据的差异？ | Q01-Q07 对照源码基线 | 待样本，不推定失效 |

每条已观察请求记录：样本 SHA-256、原始 ordinal、UTC 时间、方法、host/path、状态、请求字段路径/类型、响应字段路径/类型、subtask 名称、cookie 名称/属性、REA Evidence ID、覆盖缺口。查询中 token、账号标识等值不写入报告。

## 分析顺序

先在本地检查 HAR 完整性及登录相关记录位置，只输出允许列出的元数据。通过 REA 解析原始文件并将完整结果留在私有目录；随后提取最小字段结构与证据位置，分开记录观察、推断和未知。需要查看敏感正文时仅在本地处理，不原样送入聊天。禁止将秘密作为 `--sensitive-value` 命令行参数提交以免留在日志或进程列表。

不重放捕获请求，不运行现有密码登录流程；取得样本不等于授权自动重复提交凭证。只有真实样本能支撑协议调查；源码及合成 fixture 不补齐观察缺口。

## A0 退出条件

至少一份成功授权登录样本和一份同账号复用样本，Q01-Q08 的结论都有位置及覆盖说明，实际遇到的任务能映射到脱敏结构。未遇到的 2FA/挑战仍标未验证。此时再推进 A1 契约，不能提前标记自研登录成功。

## 人工实地样本补充（2026-10-15）

用户提供人工登录步骤、4 份登录 curl、HomeTimeline curl 及 JSON 响应。仅本地解析文本，未执行 curl、未重放凭证。用户报告成功属于人工观察；附件没有完整响应头/状态/时间链，不能当作本机真实执行成功。curl 文本不是 HAR，未伪造 HAR 交给 REA。

| 样本 | 请求 | 表单字段（只记录名称） |
| --- | --- | --- |
| U01 | POST jf.x.com/onboarding/web/actions/begin_login | username_or_email、$castle_token |
| U02 | POST jf.x.com/onboarding/web/actions/login_enter_password | username、password、session_token、$castle_token |
| U03 | POST jf.x.com/onboarding/web/actions/begin_login_acid | prelude_dispatch_id、from_prelude_gate、session_token、$castle_token |
| U04 | POST jf.x.com/onboarding/web/actions/finish_login_acid | code、destination、session_token、$castle_token |
| U05 | GET x.com/i/api/graphql/svLglq6U2wlTyZMGDDcLYQ/HomeTimeline | query: variables、features、fieldToggles |
| U06 | HomeTimeline JSON 响应 | data.home.home_timeline_urt.instructions |

4 个登录请求 Content-Type 均为 application/x-www-form-urlencoded；带 authorization、x-guest-token、x-client-transaction-id、x-jf-v 等请求头。是否必需、如何产生及轮换仍未知，不复制敏感值。Prelude signals 用户给出的请求声明 content-encoding=deflate 和 application/vnd.prelude.signals；损坏的文本 payload 不足以验证真实编码或其与登录成功的因果关系。

粘贴登录响应含 U+FFFD 替换字符，原字节不可从粘贴文本可靠恢复。可见字符串暗示服务端页面状态/下一步 action，但只是线索；未确认二进制格式、压缩或加密算法，不据此编写解码器。需要原始响应 Content-Type/Content-Encoding、body 字节及对应浏览器解码脚本。

U06 结构可解析：TimelineShowCover 与 TimelineAddEntries；38 个 entry，其中 35 TimelineTimelineItem、1 TimelineTimelineModule、2 Cursor（Top/Bottom）。entry 数不等于帖子数；本轮未执行既有 parser 对照，不证明全部业务字段兼容。

更新证据优先级：当前人工运行样本 > 与该样本绑定的浏览器脚本 > 当前固定上游源码。上游编排仅参考，接口地址属于弱候选。旧 task 链路尚未证明全面失效。此前 /i/flow/login 是调查者选定的页面探测地址，不是上游失败接口的证据。

当前缺口：首页 bootstrap/guest 获取、castle token 正常生成流程、jf 协议解码、响应 cookie 更新、Prelude dispatch 的对应关系、成功身份检查及独立复用样本。正常浏览器 SDK 调用与未知挑战由真实浏览器承载，不伪造信号、不绕过验证。若证据显示纯 HTTP 方案必须新增规避逻辑，则说明障碍，提出最小的浏览器登录 + HTTP 会话复用调整，不自行改变登录基线。

根据用户纠正的入口，本机使用 REA capture-browser-scenario 导航 https://x.com/，其他浏览器条件不变。仍观察 GET 文档 HTTP 403 与 net::ERR_HTTP_RESPONSE_CODE_FAILURE；没有进入登录页面，owned browser 已清理。原始部分观察存 `~/rea-investigations/login-root-20261015/evidence.json`，无成功 Evidence ID。此次结果说明本机问题不只局限于 /i/flow/login 路径；仍未判断拒绝来源、出口一致性或白名单条件。

## 完整 HAR 首轮分析（2026-10-15）

用户确认录制时区 UTC+8、Chrome 内核、登录与复用成功；录制电脑与服务器不是同一公网出口。已取得两份完整 JSON，并建立仓库外私有 snapshot；未重放请求。

| 原始样本 | SHA-256 | 原始条目 |
| --- | --- | --- |
| login.har | 3ed24799a2dd3e19a41efd7b305a5bc21e83a782a4124fe601b8228c47823a67 | 574 |
| session-reuse.har | 8bd629c7e7d6560a55d141bb168188c4f3a81de2941fd14fb5e960eaca073c47 | 288 |

REA 原件分析受限：login 超过 32 MiB；reuse 的 serverIPAddress 不符合 REA IPv4 schema。原件不改动；分别生成 54/52 条的 focused.har，仅保留 jf.x.com、edge.prelude.dev 及 x.com 首页/home/API 请求；reuse 分析副本移除 13 条非法 serverIPAddress 字段。focused.manifest.json 保存源摘要、派生摘要、原始 ordinal 映射与修改范围。REA 中的 ordinal 是派生序号，不能直接当作原始 HAR 序号。

REA 成功父 Evidence：

- 登录：`ev_1e6c7c884deac6daf1b12b2f2540d558996681d69d89f6952be1acbb6c8dae73`；派生 SHA-256 `9c36b17c9715b0f3f090d5cd5db1381996fd64abeddf38ca63772f1b1916cf3c`。
- 复用：`ev_33b03d5995c636c86826ce19a28947f92805fac724130876a1c8833d7ccaf20e`；派生 SHA-256 `01f54022a2ff34b7a0bddc5efeac3eb89bee326c9544a8eeec255b9295c519cf`。

以下原始 ordinal 由本地 JSON 结构核对，REA summary 证明派生记录成功解码，不代替全部正文审阅：

| 样本/原始 ordinal | UTC+8 时间 | 观察 |
| --- | --- | --- |
| login/0 | 14:53:15 | GET /，200，但正文未保留 |
| login/166 | 14:53:27 | POST begin_login，200；字段还包含 password，与前一份 curl 不完全相同；字段出现不证明非空 |
| login/176 | 14:53:34 | POST login_enter_password，200 |
| login/181 | 14:53:35 | POST Prelude signals，200 |
| login/185 | 14:53:38 | POST begin_login_acid，200 |
| login/195 | 14:54:01 | POST finish_login_acid，200 |
| login/197 | 14:54:02 | GET /home，200，HTML 保留 |
| login/301 | 14:54:10 | GET HomeTimeline，200，JSON 可解析，TimelineAddEntries 37 条 |
| reuse/0 | 15:02:08 | GET /home，200，HTML 保留 |
| reuse/103 | 15:02:17 | POST HomeTimeline，200，JSON 可解析，TimelineAddEntries 37 条 |

复用文件未见上述登录 action，支持浏览器会话复用；浏览器确实重启、同一账号等仍来自用户观察，尚未通过独立 Viewer 身份比对确认。ViewerBadgeCounts 不是身份接口。两份样本均未见 guest/activate，不能推出初始化不需要 guest。

关键缺口：四个 action 响应头均为 text/plain、content-encoding=gzip，但正文为空、bodySize=-1；不是空响应的证明。Cookie 数组为空且相关 Set-Cookie/Authorization 未保留，无法还原 cookie 生成、更新及身份。gzip 说明传输编码，不说明解压后格式，也不能据此断言粘贴乱码只由 gzip 造成。

已在 login HAR 保留的 JavaScript 正文中搜索 begin_login、finish_login_acid、x-jf-v、castle_token、prelude_dispatch_id，未命中；搜索边界不包括缺失响应、未保留脚本或运行期拼装字符串，不等于浏览器没有这些逻辑。

阶段结论：登录及复用请求链的首轮证据建立；A0 未退出。下一步补齐 action 原始响应及对应前端脚本，调查 cookie 与同账号验证；不开始猜测式 HTTP 重写。不以不同出口的录制成功证明服务器访问成功。

## 第二轮完整信息样本（2026-10-15）

用户报告浏览器 Chrome 155.0.8059.79。文件位于仓库外 `~/rea-investigations/manual-login-2/`，目录 700、文件及派生物 600；原件未改正文，另建立 snapshot。只读分析，无请求重放、账号输入或服务器登录验证。

| 样本 | SHA-256 | 原始条目数 |
| --- | --- | --- |
| login.har | 89499b479186ffd2c3d287da1380153cbca4fefa1f7ad7bc97913ceb9def44e8 | 447 |
| session-reuse.har | 31b9416e755caf2447e7ba7dfb37f2451a3abe44bc0626ff35da73e0c1eafc84 | 244 |

REA 仍使用上一轮相同的聚焦选择规则，派生序号映射在各 focused.manifest.json 中；login 46 条，reuse 35 条，后者移除 7 个非法 IPv4 serverIPAddress 字段。成功父 Evidence：

- login：`ev_3ca7dd86456f0604a8d85277395e7d5d1e1c1d577228c34b2187c805bce43700`，派生 SHA `b6d8fff6164060a18a8e61468928ed38bd0fc636727179da88722c1a40c0de08`。
- reuse：`ev_ac9f969137a9b7d497096538d723c71aa22e05222c13f8c13d5e78638c0c2430`，派生 SHA `5802489475360861fdc749d7e34eb46f87ac65aff7c93daee06c1151bdd32c51`。

### 会话证据补齐

以下为本地原始 HAR 结构核对，均不输出 Cookie 值：

- login/0（16:00:23 UTC+8）：首页 HTTP 200，设置 ct0；已有 gt/guest_id 等 cookie，不是完全空白浏览器初始化样本。
- login/166、174、183、193：四个 jf 登录 action 均为 200；login/179 Prelude signals 为 200。
- login/193（16:01:06）：finish_login_acid 响应设置 twid 与 auth_token。
- login/195（16:01:07）：GET /home 200，请求已有 auth_token/twid，响应设置 lang/twid/ct0。
- login/295（16:01:11）及 reuse/124（16:02:11）：POST HomeTimeline 200，均可解析 TimelineAddEntries，37 条 entry（不是 37 篇帖子）。
- 本地比较上述两次 HomeTimeline 的 auth_token、ct0、twid，三项均存在且相同。支持相同登录态复用，不证明三项构成最小必要凭证集；没有独立 Viewer 身份请求验证，也不证明跨出口复用。

### 响应格式与前端代码

四个 action 的正文现在有内容，但 HAR encoding 未标为 base64，已含 U+FFFD：分别 741、460、563、6 个。不能从这些普通文本无损恢复原字节。Content-Encoding gzip 是传输头，浏览器可能已解压，不能对文本直接 gunzip 或假设其为加密。

从 login 原始 ordinal 35 提取的前端脚本（19,940 字节）包含 x-jf-v、castle_token；ordinal 37（823,573 字节）含 castle_token。仅在私有目录保留脚本。REA 对 35.js 静态分析成功，父 Evidence `ev_d661180ea7147d897a7819583f78f02324314a21c860efa1457ba1e2a717db06`，无 parse failure；覆盖 partial，另一个文件未选，不是完整协议恢复。

人工静态读回 35.js：HTTP GET/POST 都使用 response.arrayBuffer()；POST 使用 URLSearchParams，按条件加入 $castle_token；头构造包含 x-jf-v、x-jf-client-theme、语言与时区。脚本提供 get_castle_token 和 prelude_sdk_fetch 系统 action。此项支持该协议按二进制处理的判断，但未确定底层 codec、版本与完整状态转换，不运行该脚本或生成/伪造信号。

### 更新后的阶段判断

成功登录、Cookie 落点与同会话复用已取得历史样本支持；纯 HTTP 自研仍缺无损 action 字节、bootstrap、实际 codec 及验证信号正常生成边界。下一步优先追踪已捕获脚本的依赖与 codec；不要求重复导出同一种会损坏字节的 HAR。如果必须补样本，应采用浏览器 CDP 在原请求完成时将 response body 按字节/base64 保存，捕获方案需先验证浏览器是否已将其误判为文本；不能承诺标准 HAR 导出能保留任意二进制。A0 保持未完成，既定浏览器登录/HTTP 登录取舍不擅自改变。

## 第三轮：JP-5 解码链定位

仅从第二轮 login.snapshot.har 提取 309 个有正文的 JS 记录到私有 codec-scripts 目录，按捕获文件名恢复相对导入；provenance.json 保留原始 ordinal。没有下载新脚本或执行网页/SDK。文件名可能属于通用 bundle，不能从名称推断功能。

### 静态确认

- 原 ordinal 35 的脚本导入 `video-container-CusfPNz4.js`（原 ordinal 37，823,573 字节）。该依赖含实际 codec 和页面状态运行时。
- 请求头构造的版本常量为 `JP-5`；4 个 action 的 HAR 请求头 x-jf-v 都是 JP-5，代码与样本一致。该标记仅适用于本样本版本，不硬编码为永久接口保证。
- video-container 中 `wa(runtime, bytes)`（UTF-16 offset 46175）建立 Ca 状态对象并把 bytes 交给 session.onChunk。表单提交先获取 arrayBuffer，再调用 wa，读取 root.value。
- `Ca`（41522）维护元素、属性及根状态。onChunk 在缓存至少可读长度时以 getUint32(0,true) 读取 4 字节小端消息长度，等待完整消息体；将该段交给 ci().decodeMessage(ui(segment))，剩余字节继续缓存。
- `ci`（14132）按 `si`（9788）中的类型 schema 组合解码函数；`ui`（14812）提供 u8、有符号小端 i16/i32/i64、f64、bool、varuint，以及长度前缀 UTF-8 字符串。映射、数组、可选值、变体等由组合器处理。这里是自定义 schema 驱动的二进制协议线索，不称为已确认 Protobuf/MessagePack。
- 消息标签 ai 为 dom_data=0、dom_ready=1、action=2；当前观察到 onChunk 的分支将 dom_data 交给 ingest、dom_ready 交给根引用处理。只读代码证明这些分支存在，不证明本次每个响应都实际触发。

上述 offset 是已捕获 JS 文本的 UTF-16 字符位置，不是 HAR 文件偏移或通用版本地址。底层 codec 的静态代码片段未出现解密调用，不足以排除其他层的编码/加密；不将乱码解释为加密证据。

REA 对指定 codec 文件的分析父 Evidence 为 `ev_e9e0ac4f86b57267893c4582dfd7c5c2eddeecdcaa7ac7b85454a5ca7eab239c`，文件 SHA-256 `577f784eeab9a577a2a5a95c47d31048bccc3f4406781dcfe9abf7b368ad302c`。1 个 JS 解析成功，0 parse failure；语义图触及单文件 20,000 节点限制、partial/truncated，不能声称完整调用图。309 是提取记录数，落盘去重后 REA 识别 relevant_files=304，其中 303 未选；本节精确函数结论来自原文局部读回，不依赖截断图穷尽性。

### 对自研实现的影响

不能仅替换 URL 并沿用旧 subtask JSON 模型。新链路至少需要版本绑定的帧/类型解码、页面状态中的字段与 action 提取、正常 Cookie 更新及明确未知状态处理。castle/Prelude SDK 生成行为仍是独立边界，未授权伪造信号或绕过挑战。

下一步先取得能验证解码的无损字节：现有 action HAR 文本含 U+FFFD，不能逆向补全字节或用猜测填充测试。优先检查 bootstrap 是否含有效 base64 二进制及其消费路径；若不足，再提供浏览器端本地采集方案。只有对真实响应成功分帧、解码出与页面一致的下一步状态后，才考虑最小协议原型。暂不修改现有登录业务实现。

## 定向字节采集工具

已新增 [浏览器操作指南](login-byte-capture.md) 与 `tools/investigation/capture-login-bytes.js`。采用页面 fetch 响应 clone().arrayBuffer()，直接 Base64 导出四个 action 的浏览器解压后字节及 SHA-256，避免 HAR text 路径；仅人工正常登录，不采集请求正文或生成验证信号。为防止最终导航销毁数据，在把响应返回页面前读取副本并发起本地下载，会影响交付时序，归类受控诊断而不是被动观察。

合成字节测试 1/1 通过（含非法 UTF-8、原响应保留、请求秘密排除、域名范围及 stop 恢复）；git diff --check 通过。尚未验证真实 Chrome 页面是否缓存 fetch、是否触发下载以及 action 字节实际分帧结果。先以 begin_login 单步检查工具覆盖，捕获不到则停止，不重复密码提交。业务代码、依赖与登录方案未变；未执行真实登录、提交或推送。

## 第四轮：真实字节校验与解码

已接收 `~/rea-investigations/login-bytes/` 中四份 capture JSON。收紧目录 700、文件 600；原始 Base64、解码状态和 session 字段保留私有目录，不提交仓库。捕获是用户人工浏览器受控诊断，不是本机自动登录或无干预观察。

| action | HTTP | 正文字节数 | 两帧消息体长度 | dom_data 元素/属性数 | 可解出的后继 |
| --- | --- | --- | --- | --- | --- |
| begin_login | 200 | 4295 | 4284、3 | 100 / 131 | login_enter_password（另有密码找回 action） |
| login_enter_password | 200 | 2507 | 2496、3 | 52 / 86 | begin_login_acid |
| begin_login_acid | 200 | 2848 | 2837、3 | 57 / 93 | finish_login_acid |
| finish_login_acid | 200 | 182 | 171、3 | 1 / 5 | login_success、complete 标记，无上述后继路径 |

校验：全部严格 Base64 解码，字节数与 SHA-256 与捕获元数据一致；4 字节小端帧长度恰好覆盖全部字节，无残留。每个 frame 经类型解码后消费字节数也与 frame 声明长度一致；四份均为 dom_data=0、dom_ready=1。该一致性校验不等于数字签名或独立来源认证。

方法：从已哈希绑定的原始 bundle 中仅提取 literal enum、si/ci schema 与 ui 字节读取函数，放入无网络/DOM 的 Node vm 上下文（限制执行时间），不导入或执行完整应用、Castle/Prelude SDK。为验证消费边界，仅给 reader 增加位置读数；为组合器的 function/schema 判别提供最小兼容函数，实际样本全部成功消费不证明其他 schema 分支通用。私有 `decode-local.mjs` 保留可复现脚本，`.decoded.json` 保留完整结果；Map 和 BigInt 显式序列化以避免丢失数据。vm 只用于隔离纯 codec 依赖，不宣称它是恶意代码安全沙箱。

脱敏读回：第一步状态含 username/password/session_token 字段；第二步含 prelude_dispatch_id/from_prelude_gate/session_token；第三步含 code/destination/session_token；最终含 user_id/username/login_success/complete。字段值不输出，session 的产生与跨步骤约束仍需结构追踪，不用字符串存在替代状态语义验证。

结论：JP-5 的分帧与类型解码已在这四份真实字节上验证，原“缺少无损响应导致无法验证 codec”的阻塞解除。不是完整 HTTP 登录验收；首页 bootstrap、请求所需动态字段的来源、正常 SDK 调用边界、未知状态及账号身份校验仍未完成。下一步从解码对象建立版本绑定的登录状态契约与最小字段提取方案，再决定 HTTP 可实现范围；不复制捕获 token、不实现信号伪造、不直接进入真实密码自动化。

## 第五轮：登录状态契约草案

新增 [JP-5 登录状态契约](jp5-login-contract.md)。本地解码对象读回确认三表单 session_token 均非空且同值；password、prelude_dispatch_id、code 的对应初值为空。主流程之外还有找回密码表单，状态提取须按根及引用定位，不匹配第一个表单或敏感字符串。

最终响应 action 是 multi，含 system type=8（open_account），结合身份字段支持候选完成状态；仍需独立远端身份确认后才保存。本文不将标签/字段存在提升为完整引用图已验证。没有把不同次录制的 HAR 和 bytes token 拼接。

契约明确协议、页面状态、领域状态及终端/存储边界，并列 bootstrap、Castle/Prelude、身份验证与错误分支缺口。仅新增文档，未改变业务代码、依赖或真实登录行为。后续最小实现是纯数据引用解析与状态提取；完整 HTTP 自研仍受动态字段来源与授权约束约束。A0 未完全退出，A1 为调查草案，不标记验收完成。

## 第六轮：有限状态提取实现

在 `packages/x/src/jp5/state.ts` 实现纯数据状态提取并从 x 包导出，collector 的现有认证测试命令纳入合成用例。按根导航 preview 追踪活跃表单引用，忽略密码找回链接的非活跃 preview；最终 open_account 通过引用读取账号，仍返回未独立验证状态。未知版本/结构、非法或循环引用、多义表单、字段变化与表单错误明确停止。错误不回显字段值。

5 项合成测试通过；完整认证测试 15/15 通过；x typecheck/lint 与 collector typecheck 通过。补充 subatom 引用检查后，定向 5 项及 x typecheck/lint 再次通过。私有脚本对四份真实解码结果运行同一提取函数，依次得到 PASSWORD_REQUIRED、VERIFICATION_PREPARATION_REQUIRED、CODE_REQUIRED、LOGIN_COMPLETED_UNVERIFIED。真实数据仍仅存私有目录。

本轮没有实现仓库内字节 codec、HTTP 提交、SDK 信号生成或会话保存，没有执行真实登录。下一步先调查 bootstrap 与 begin_login 初始账号状态，补齐入口证据；完整登录仍需动态字段来源及独立远端身份校验。细节见 [状态契约](jp5-login-contract.md)。

## 首次无头入口探测

用户说明目前没有样本，服务器 IP 已获 X 授权，要求以无头浏览器调查。本次通过 REA CLI `capture-browser-scenario` 启动现有 Chromium 153.0.8010.12，导航 `https://x.com/i/flow/login`，计划等待 8 秒并记录 DOM/accessibility/URL 及网络元数据。未输入凭证、未导入 cookie、未修改 TLS/指纹或安装软件。

原始请求与输出存于仓库外 `~/rea-investigations/login-entry-20261014/`，私有权限；`scenario.json` 为请求，`evidence.json` 为错误及 partial_observation。此次操作没有成功 Evidence ID，不虚构完整证据记录。

观察：同一 request-1 的 GET 文档请求收到 HTTP 403，随后 request-failed 为 `net::ERR_HTTP_RESPONSE_CODE_FAILURE`。REA 返回 `execution_failure`，保留 3 个网络事件、0 个丢弃事件；初始导航失败，未取得页面状态。Chromium 已由 Provider 清理（terminated-owned-process）。

结论边界：浏览器能启动，当前无凭证入口被拒绝；未观察登录 subtask、Viewer 或复用流程，不能归因于账号密码、上游实现或白名单配置。下一步核对授权 IP 是否为本次浏览器实际出口、是否有代理及白名单是否覆盖 Web 登录入口/相关域名；取得正常浏览器的同出口对照后再决定后续调查，不重复相同失败探测或引入规避逻辑。

## 第七轮：bootstrap 入口与最小补录

本轮仅检查既有 `manual-login-2/login.snapshot.har` 与已保存脚本，无网络重放、凭证提交或 SDK 执行。HAR entry 序号从 0 开始。

- entry 0：GET x.com/，HTTP 200，HTML 40509 字符且无 U+FFFD。内联包含 `__INITIAL_DATA__`、TanStack 路由流与 `x-web:bootstrap-data` 事件；未以执行这些脚本的方式获取状态。首页正文未直接出现 begin_login/session_token。此项只是该正文的有限文本检查。
- entry 149：GET jf.x.com/onboarding/web/landing，HTTP 200，text/plain，HAR text 6037 字符、1128 个 U+FFFD；这是已观测的 begin_login 前置入口，不能用损坏文本构造可信 JP-5 fixture。
- entry 153：GET /onboarding/web/remotes/passkey_one_fa，带 form_id 查询键，HTTP 200。存在此请求不证明密码登录必须调用它，不保留查询值或实现 passkey 分支。
- entry 166：POST /onboarding/web/actions/begin_login，请求为 application/x-www-form-urlencoded，参数名为 username_or_email、password、$castle_token。字段存在不证明全部必需，不能复制样本值。
- entry 0 已携带 gt、guest_id 等 cookie，响应设置 ct0；entry 149 已携带 x-guest-token、authorization、x-client-transaction-id 等头。因此这份录制不是从无 guest 上下文开始，不能证明初次 guest 获取方式或直接沿用旧 guest/activate。

REA 精确选择 `use-jetfuel-dev-DAyTh4gO.js` 静态分析，父 Evidence `ev_53d9c2450180a5aeb0235909bbcf6af6a610ac8ba18398fec81c03b9e3ef1d65`；脚本 SHA-256 `af24947dc4c397f845bdf99c212bad06f89570df500cd19d65f34251074dece9`。1 文件解析、0 失败，303 文件未选，图 partial、不宣称完整调用关系。原文局部读回确认：JP-5 头构造、GET 用 arrayBuffer 读取、POST 以 URLSearchParams 编码字符串字段并条件追加正常 SDK 的 $castle_token。其他认证头由导入的 transport 依赖处理，尚未完整追踪；不能把局部构造器列出的头视为最小充分请求集。

本轮扩展现有 fetch 字节采集器，增加精确 GET /onboarding/web/landing；保留原四个 action。合成测试 1/1 通过，覆盖 landing 字节保真及 POST/相近路径/其他域名排除；git diff --check 通过。未将 landing 加入领域状态 allowlist，因为尚无可信字节及活跃引用证据。

下一步由用户在独立未登录调查配置中，安装最新 snippet 后只打开正常登录界面，补录 landing，无需输入账号密码或验证码。步骤见 [字节采集指南](login-byte-capture.md#本轮只补录-landing无需提交账号密码)。若 landing 已提前发生而未捕获，应停止反馈，不手工重放或重复提交。收到字节后再解码初始账号表单、核对 begin_login 字段和引用；空白 guest 初始化、动态 SDK 与身份确认仍单独待验。

## 第八轮：landing 无损字节与账号状态

新 landing 捕获长度/SHA-256 校验通过：6439 字节，两帧 6428、3，既有隔离 codec 完整消费；消息为 dom_data/dom_ready，124 元素、187 属性。原始和解码结果保留私有目录，文件权限 600。未执行页面 action 或发出网络请求。

按 root children 与属性引用追踪，活跃树到达唯一 begin_login 表单：只有空 username_or_email，没有 session_token；注册表单位于未激活导航 preview。根是直接容器树，与后续导航 root 不同。`packages/x/src/jp5/state.ts` 新增有限 ACCOUNT_REQUIRED 分支，精确字段集合与唯一表单检查不变；没有将所有响应表单扫成可提交接口。

前次 HAR 提交 begin_login 时还含 password/$castle_token；当前初始表单不足以解释其来源，且两者不是同次操作。下一步追踪客户端字段补充和 transport/SDK 依赖，不以复制旧 token 或省略字段的方式试错。空白 guest 初始化和完整纯 HTTP 登录仍未验收。

验证：完整认证测试 16/16 通过，x 包 typecheck/lint 通过，git diff --check 通过。私有真实解码样本运行同一提取函数，landing 返回 ACCOUNT_REQUIRED，其余五份（含新增 begin_login）保持预期状态。未执行真实自研登录、跨进程会话复用或远端账号身份校验；本轮未提交。

## 第九轮：初始请求字段来源与 transport 静态边界

本轮确认 landing 账号元素的 linkedPasswordField=password：属性 hash 与实际属性引用匹配；正常控件会渲染关联密码 input，并经 change/blur 更新表单。前次 HAR 的 begin_login password 非空，但没有足够运行时证据确认具体输入来源，也不能得出服务端必需结论。

$castle_token 的调用链已静态闭合到正常 SDK createRequestToken，由网络层在有返回值时追加。共享 transport 的认证/cookie/guest 插件也已定位；初始 guest 获取和 transaction 生成仍未闭合。不能把后续纯 HTTP 实现简化为固定字段、固定头的 URL 串联，更不能以空值或历史 token 代替动态上下文。

REA 两个指定 startup 文件静态解析成功，0 失败；父 Evidence `ev_10f01126fb37734d665acc55cc59e136cef9d9cb54a72d11f2fd93d1f5acc52a`，302 文件未选、graph partial。完整文件摘要、函数位置和证据边界见 [状态契约](jp5-login-contract.md#客户端补充字段与-transport-边界2026-10-17)。无网络重放、SDK 执行、新依赖或登录业务变更；本轮仅更新文档并运行 git diff --check，不将静态调查记为真实登录通过。

下一步在当前协议范围实现受限字节 codec，替换对私有脚本的手工依赖；网络编排和动态字段依赖仍独立待验，不需要用户再次提交密码样本。

## 第十轮：受限 JP-5 字节解码模块

新增 `packages/x/src/jp5/codec.ts` 及合成测试，从 x 包导出，纳入现有认证测试命令。按已绑定 schema 用普通 TypeScript 实现长度帧和类型读取，不再依赖执行 bundle 提取片段；返回 Snapshot 后接现有状态提取。无新增依赖、网络请求、请求编码、SDK 执行或会话保存。

限定为 dom_data → dom_ready 的完整两帧响应，并对字节、集合和递归设置上限；截断、尾随、未知类型、错误序列、非法编码/标志及重复 Map 键停止。具体策略与上游差异见 [状态契约](jp5-login-contract.md#受限字节-codec-实现2026-10-17)。原始凭证未进入源码或测试。

私有六份真实字节的新解码对象与既有隔离 decoder 完整逐字段相等，六份均得到预期登录状态；仅本地历史样本验证，不代表真实 HTTP 自研登录或会话复用。5 项新增合成测试通过，x typecheck/lint 通过。

最终检查：完整认证测试 21/21 通过，x 包 typecheck/lint、collector typecheck 与 git diff --check 通过。未运行整体 build、数据库或真实外部服务验收；本轮修改未提交。下一步继续厘清动态字段提供方式和独立身份验证，再接最小 HTTP 编排，不以 codec 通过替代登录验收。

## 第十一轮：身份数据候选与只读提取

检查历史登录/复用录制，确认 viewer_context 是 category/log 空响应请求，不能充当 Viewer 身份查询。登录后两份 /home 正文的 SSR 状态含一致的会话 ID 与对应用户记录；登录与复用的 account/settings 账号名均与之匹配。复用首页正文为空，因此没有复用首页 ID 证据。具体 entry、限制与 transaction 注入定位见 [状态契约](jp5-login-contract.md#独立身份候选与-transaction-注入定位2026-10-17)。

新增 `packages/x/src/jp5/identity.ts` 与测试，从 x 包导出只读首页身份提取及本地比较；不执行脚本、不联网、不保存 Cookie。三项合成测试通过，x typecheck/lint 通过。私有脚本读取两份历史首页与两份 settings 比较均成功，未输出 ID、账号名或正文。它只验证已捕获数据，不代表 HTTP 端点/当前登录可用。

网络编排仍未启用。下一步首先确定正常浏览器 SDK/transaction 的提供方式与空白 guest 初始化，未知条件继续停止；没有新增反 Bot 绕过或签名伪造逻辑。

最终验证：完整认证测试 24/24、x typecheck/lint、collector typecheck 与 git diff --check 通过；未进行整体 build、真实网络登录或跨进程会话验收。本轮未提交。

## 第十二轮：guest 首次来源缺口与 SDK 边界

既有 HAR 首个请求已带 guest cookie，且未记录激活/首次设置链；不能凭现有样本实现可验证的空白 bootstrap。正常客户端仍存在 guest 激活代码，但浏览器/SSR 条件不同，未将它当首访必经流程。

Castle 的 feature/public-key/idle/timeout 条件与 Prelude collect→generatePayload→signals 成功→dispatch ID 链已静态定位；不能用常量或历史值替代。sign.o 精确 REA 静态分析成功（父 Evidence `ev_62cba361b1e817a302056349c54e8153108d13c9d66fb98e0c597031b93100ff`），graph partial，未执行目标代码。并未证明纯 HTTP 不可能；正常 SDK 兼容性与服务端必要性仍待验证。

新增 [空白 guest 补录指南](bootstrap-capture.md)，只需新配置访问首页并打开账号界面，避免重复密码样本。新增离线 `summarize-login-context.mjs` 及合成测试，输出白名单元数据；私有既有 HAR 回读确认 firstHomepage guestCookiePresent=true，观察到 landing 与 signals、三类 SDK 脚本，不输出原始头值或正文。

验证：工具合成测试 1/1、node --check、git diff --check 通过。本轮不改业务登录实现，不执行真实登录/SDK，不新增依赖；未提交。完整空白 bootstrap 与正常动态上下文提供方式仍是 HTTP 编排的退出条件，不能将离线状态/codec/身份解析通过提升为登录验收。

## 第十三轮：空白首页 guest 来源链

用户上传 `clean-bootstrap/bootstrap.har`；长度 7593238、117 entries、SHA-256 `45b2e782a4fec762904edc01a8f9e474f4fdb36dda07219b587d8610533e72a0`。entry 0 无 Cookie 与 guest 请求头，GET / 返回 200 并设置非空 gt/guest_id；ct0 为空。后续 6 个带 guest 头的请求与该 gt 全部相等，未输出值。首次 guest 来源缺口在这份历史捕获范围内得到补齐，不能称服务器出口已验证。

没有 landing 或 guest/activate 记录；不把首页样本与其他次登录拼成完整 flow。下一步首页初始化器应采用正常 Cookie jar 接收首页 Set-Cookie，不无条件复用旧 guest 激活路径；动态 SDK/transaction 仍待确定。详见 [状态契约](jp5-login-contract.md#空白-bootstrap-har-校验结果2026-10-17)。

离线 metadata 工具补充首次响应非空标志及 guest 匹配计数；合成秘密排除测试 1/1 与 git diff --check 通过。原始 HAR 留私有目录，未重放请求、输入凭证或运行 SDK；本轮未提交。

## 第十四轮：首页 guest 初始化实现

新增 `bootstrapXGuest`、受限临时 Cookie jar 与 transport 边界，基于第十三轮首页 Set-Cookie 证据实现单次正常首页 GET。拒绝重定向/失败/非 HTML、缺失或过期/错误作用域/歧义 gt；账号凭证不混入 guest 上下文。仅返回受 origin 限制的私密 Cookie/guest 请求头，不执行页面、SDK，不接入密码或旧 CLI 默认路径。详见 [状态契约](jp5-login-contract.md#首页-guest-初始化器2026-10-17)。

依赖变更仅把仓库既有 tough-cookie@6.0.2 声明为 x 包直接依赖，同步 lockfile；不重写 Cookie 标准规则。5 项新增本地测试通过，完整认证回归 29/29 通过。未访问 X，未以旧捕获 Cookie 作请求，未保存任何账号会话。

最终检查：x 包 typecheck/lint、collector typecheck 和 git diff --check 均通过；未执行整体 build、数据库或真实外部登录验收。保留此前未提交 codec/identity/调查文件，本轮也未提交或推送。

## 第十五轮：服务器首页到账号入口实测

此前 codec、identity、bootstrap 的测试均为本地/历史样本。本轮新增真实无账号验证：单次首页 bootstrap 成功；另一次新上下文从首页取得 guest 后请求 landing，同次临时 jar 不使用历史 Cookie。共 3 HTTP 请求，无失败重试、自动重定向、浏览器或 SDK 执行。

landing HTTP 200、6465 字节，新 codec 与状态提取返回 ACCOUNT_REQUIRED；脱敏报告 `probe-landing-result.json` 留仓库外私有目录，时刻 2026-10-17T06:06:07.271Z。应用 bearer 仅从已保存的公开客户端配置读取，无账号凭证提交。具体头来源与限制见 [状态契约](jp5-login-contract.md#服务器无账号入口实测2026-10-17)。

这次已贯通服务器上的空会话→首页 guest→登录账号入口，但没有测试任何登录 POST、生成 SDK/transaction 信号、远端身份确认或会话复用。不能将本次未带动态字段仍成功的 GET 推广为后续 POST 的可省略结论。下一步收敛 landing 读取和 Cookie 更新接口，再推进请求编排；不提前切换现有 CLI。

本轮只更新调查文档，git diff --check 通过；保留已有未提交实现，未提交/推送。最初一次私有探测脚本因 .ts 被 tsx 按 CJS 转换、不支持顶层 await，在发请求前退出；改为 .mts 后运行。该工具启动错误不计作 X 请求失败或重试。

### 第十六轮：landing 库化与 guest Cookie 更新

准备阶段成果提交为 `49ddcc1`。随后新增 `loadXLoginLanding`，将已观测的无账号入口 GET 收敛为显式配置、固定地址、限时限大小的库接口，解码后仅接受账号输入状态。guest 上下文通过克隆 Cookie jar 接受响应更新，原上下文不变，失败不留下半更新。详细边界见 jp5-login-contract.md。本轮仅执行离线合成测试及静态检查，未发送真实登录请求；默认 transport 的 mock 测试已覆盖正常解码、手动重定向配置及流式超限取消；后续推进离线 POST 请求规划与动态字段提供边界。

### 第十七轮：离线 POST 构建边界

新增 `packages/x/src/jp5/submission.ts` 与合成测试，按四种已观察状态构造 URLSearchParams 表单，并将用户输入与服务端字段、运行时字段分离。复制当前响应字段，不固定历史 session_token；账号首步 password 仅在调用方明确提供关联输入时加入。缺少正常运行时结果停止，未接入生产提供者或发送器。本轮未发送真实 X 请求，未切换 CLI；下一步先确定正常 SDK/transaction 的运行方式及同 guest 上下文绑定，再决定完整 HTTP 提交适配器。

### 第十八轮：正常 SDK 运行边界与路线决策

复核 Prelude 构造器的明确浏览器环境检查、dispatchSignals 完整提交顺序，以及 Castle/transaction 既有集成入口。当前 Node 宿主缺少其所读页面环境；未执行 SDK 或发出真实请求。证据和两条可执行路线收敛到 login-runtime-decision.md，等待用户选择是否调整纯 HTTP 登录边界；不新增伪提供者、token 拼接或环境模拟代码。

### 第十九轮：授权无账号浏览器验证

用户选择正常浏览器参与验证。REA 临时 Chromium 153.0.8010.12 首次 GET x.com/ 得到 403，初始导航失败；partial observation 含 3 网络事件，无账号操作，provider 报告临时进程清理完成。未把该记录当作 SDK 成功执行。新增本地真实 Chrome 脱敏摘要工具及 browser-bootstrap-observation.md；工具只做语法检查，待用户电脑实际运行。不重试拒绝、不改指纹、不提交。

### 第二十轮：本地入口成功与观测器超时修复

用户回传 Chrome 155.0.8059.80 本地摘要：首页/landing 200，无账号 Cookie/动作/signals，guest 9/9 当前值匹配，Castle/transaction 脚本已加载。记录为本地入口证据，不升级为账号或 SDK 执行验收。旧脚本手动关闭后才输出，具体等待点未知；补充阶段提示、单项截止、60 秒总 watchdog 和有界清理。两个子进程故障模拟测试通过，需本地复测。明确 Prelude 属于已观察到的密码后 prelude_gate 分支，与首页观测挂起无已知因果关系。
