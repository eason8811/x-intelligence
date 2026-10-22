# 捕获 Web SDK 的 Node 可加载性证据（2026-10-19）

本轮响应用户要求，区分静态依赖、实际加载、入口前置条件和 token 有效性。没有补浏览器全局、模拟指纹或重建反滥用信号，没有向 X/Prelude 发请求，也没有生成/保存 token。源码与探测脚本仍在仓库外私有调查目录。

## 原文证据

下列 offset 为 UTF-16 code units，针对 manual-login-2/codec-scripts 中绑定的文件。

### Prelude

signals-CizIIZE3.js，SHA-256 `9026dffd63d5e3d424f22b177ed9280b60f6d37ad00e4418b89cb8de4a0f34a9`。

- core 构造器 offset 250176：`typeof window > 'u'` 时抛 `@prelude.so/js-sdk must be used in a browser-like environment`。原脚本用反引号字符串。这是显式保护条件，不仅是字符串搜索到 window。
- offset 255955 的 ce.collect 读取 `window.location.hostname`，随后调用 ue.collect；后者读取 navigator 属性、浏览器存储和 canvas/WebGL。静态读取不是已执行到所有 API 的证据。
- offset 263314 的 dispatchSignals 实现先取得 core，随后 collect、generatePayload、POST signals，只有 HTTP ok 才返回同次 collect.id。入口不是离线纯函数，也不从响应正文获取 dispatch ID。

### Castle 的 X 集成及模块本身

startup-dynamic-HMYQUZdZ.js，SHA-256 `b70c8b18437bd8489e452511af34924c89017261e1faad351735e5ffcf1cb65e`。

- iC offset 253521 直接读取 `window.location.pathname`。
- aC offset 253579 调用 iC，检查 `responsive_web_castle_sdk_enabled` 和 `responsive_web_castle_public_key`，然后加载 Castle 并 configure。
- uC offset 254478 通过上述初始化获得 SDK 后调用 createRequestToken。没有初始化配置时可返回 undefined，不能将此当成可用 token。

castle.umd-DlxlULA2.js SHA-256 `25b2272d619b2d11c7625aabf3fb12b48e789e87dad18ac06e1aa7da582e6399`。上述是 X 集成路径；模块的加载兼容性另由下节离线测试观察，不扩大为所有 Castle 产品均不支持 Node。

### transaction

sign.o-DyQ9HcFr.js SHA-256 `b12e5f76bae961f9dd41fd1933585442991e21eb9a415555c3858195b73ebf5d`。本轮模块加载成功，未调用 default 初始化器或其结果。此前存在页面依赖线索不能提升为“import 一定失败”，也不等于能在 Node 成功生成有效 transaction。

## 实际离线探测

Node v24.14.0，使用 vm.SourceTextModule 与捕获的原始文件、本地静态依赖。仅提供部分真实 Node 可用基础 API；不提供 window/document/self，不注入 DOM、浏览器存储、canvas 或 WebGL 替代物。fetch/XMLHttpRequest/WebSocket/EventSource 均为拒绝接口，动态导入与非本地模块导入拒绝；单次 evaluate 1 秒、进程总计 4 秒截止。受控 VM 不是安全沙箱，也不是原生 Node import 的完整等价环境，不把其缺失 API 结果推广到所有 Node 运行方式。

| 文件 | 加载结果 | 调用范围与结果 | 网络拒绝计数 |
| --- | --- | --- | --- |
| Prelude signals | 成功；导出 Features、dispatchSignals | 无 key 调用 dispatchSignals，仅检查无 window 前置条件，返回 BROWSER_ENVIRONMENT_REQUIRED | 0 |
| Castle | evaluate 阶段失败 | WINDOW_MISSING / ReferenceError；未 configure、未调用 createRequestToken | 0 |
| transaction | 成功；导出 default | 未调用初始化器或生成函数；MODULE_LOADED_NO_TOKEN_CALL | 0 |

Prelude 的无 key 调用不是正常配置下的完整 SDK 测试，失败发生于浏览器环境检查；没有进入信号生成、网络或服务端接受性测试。各探测均由独立进程运行，报告只含模块名、阶段、固定错误类别和导出名，不输出 SDK 日志、token 或请求内容。私有脚本：login-bytes/probe-sdk-loading.mjs。

## REA 证据与覆盖

REA 选中 signals-CizIIZE3.js，15 秒/源、256 MiB、2500 semantic nodes 上限。父 Evidence：`ev_52b12b29215b0049eb5e0c41dbbf0f54eba74e6ab30ab49739aada563899bdea`；summary view：`ev_cdd014b4c64b445f5bbbb91a74e8dcc51fbc00f05439b4f9cfa72a930b589c0d`。

1 文件解析、0 parse failures、303 文件未选；应用图 partial，语义图 partial/truncated，触及节点上限。原文检查与上面的本地运行结果分别提供证据，不声称完整 SDK 调用图或由 REA 执行了本地探测。没有增加上限重跑混淆图或抽取 token 算法。

## 可行性结论

- 获取/加载 JS 是可做且已部分实测的；模块加载成功不等于生成入口能运行，更不等于结果有效。
- 可以继续调查标准协议编码与受支持的服务端运行入口。补缺少的普通平台 API 与构造虚假浏览器信号是不同任务；当前项目禁止后者。
- DOM、存储、渲染、权限、设备能力、Cookie 与时间上下文不能通过补同名对象就证明与浏览器等价。分析能定位依赖，不能认证环境等价。
- 同一正常浏览器每次执行也可能因时间、随机数与状态产生不同结果；字节不同不等于无效。需要正常集成契约及同次上下文中的服务端结果，不能以“字符串生成了/长度一样”验收。
- 没有比较真实浏览器和 Node 生成产物，因为本轮未生成 token；没有证明服务端一定要求每个动态字段。完整 HTTP 登录可行性继续开放。
