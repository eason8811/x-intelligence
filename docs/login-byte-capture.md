# 登录 action 字节采集

用于调查 JP-5 响应格式，尚未完成真实 Chrome 登录验证。不替代 HAR，不实现登录、不生成验证信号，也不重放请求。

## 操作

1. 使用此前能成功登录的 Chrome 独立调查配置，打开 https://x.com/，停留在输入账号之前。不要退出日常账号或清除日常配置。
2. 打开 DevTools → Sources（源代码）→ Snippets（代码段）；可从左侧 `»` 找到。新建 `capture-login-bytes`，将仓库 `tools/investigation/capture-login-bytes.js` 全文复制进去，审阅后运行（Ctrl+Enter）。无需在 Console 粘贴，也不需要关闭浏览器安全功能。
3. 确认 Console 显示 `Login byte capture installed`。保持同一标签页，不刷新。正常输入账号并继续。
4. 第一个 begin_login 响应应自动下载 `x-login-bytes-1-begin_login.json`。在继续输密码前，通过 Console 执行 `xLoginBytes.status()`，确认该 action 有 bytes 且无 error；该命令仅显示元数据。若没有记录，停止录制并反馈，不反复提交账号密码。页面可能在安装前缓存了 fetch，脚本对此不能保证覆盖。
5. 按正常流程完成密码和验证码；每个指定 action 响应下载一个 JSON。浏览器可能要求允许该站点多文件下载，按浏览器正常提示处理。下载失败但页面尚未跳转时，可用 `xLoginBytes.save(序号)` 手动重试；不要在聊天展示文件正文。
6. 最终跳转首页会销毁旧页面的内存采集器。检查下载目录是否收到四份文件，尤其 finish_login_acid。下载发起不保证操作系统实际保存，务必核对文件。
7. 如果没有跳转，结束后运行 `xLoginBytes.stop()` 恢复 fetch 并清空内存；如果已跳转/刷新，脚本随原页面消失。Snippets 本身只保存脚本源码，不含捕获值。

只采集精确 jf.x.com 四个 action 的响应，不记录请求正文、密码输入、请求头或 cookie。响应本身仍可能含账号标识/session token，应按凭证保管；工具不能保证服务器不在响应中回显敏感字段。复制操作本身不联网发送数据；页面原有请求照常进行。

浏览器 fetch 返回的正文通常已被浏览器解压。本文件标记 transport_bytes=false，不应按原响应头再次 gunzip；Base64 编码只保存字节，不做字符解码。

## 上传

服务器执行：

```bash
mkdir -p ~/rea-investigations/login-bytes
chmod 700 ~/rea-investigations/login-bytes
```

通过现有 SFTP/SCP 上传 JSON 到该目录，然后：

```bash
chmod 600 ~/rea-investigations/login-bytes/*.json
```

文件不要放仓库或公开发送。只告知服务器路径及缺少哪个 action。

## 干预与边界

脚本临时包装 window.fetch，在把响应交还页面前读取 clone、计算摘要并发起下载，会增加少量延迟；未改变传入参数或返回响应正文。不是被动 CDP 观察，不用它证明无干预环境下的时序。读取失败仍将原响应交还页面。只适用于已观察的小型登录响应；无法捕获页面安装前的请求、已缓存的 fetch、XHR、worker 或其他 frame。若捕获不到，改用调试器/本地 CDP 定向方案，不加入 stealth 或伪造信号。

本地验证：`node --test tools/investigation/capture-login-bytes.test.mjs`。合成非法 UTF-8 字节验证 Base64/SHA-256、原响应可读、请求秘密不被记录、无关域名不被采集及 stop 恢复；不代表真实浏览器下载或登录已验证。
