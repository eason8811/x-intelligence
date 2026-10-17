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
