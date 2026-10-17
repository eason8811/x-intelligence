# 空白 guest 初始化补录（无需登录）

目标：确认正常浏览器第一次访问 X 时 guest 上下文如何取得。已有录制首个请求已带 gt/guest_id，无法回答这一问题。只录首页及正常打开登录界面，不提交账号、密码或验证码，不手工调用 API。

1. Chrome 新建一个临时本地配置，不开启同步、不导入旧 cookie/资料。不退出或清理日常账号；关闭调查浏览器时也不要删除已有证据。只用无痕窗口未必能隔离既有无痕会话，优先新建配置。
2. 在新配置的空白标签页先打开 DevTools → Network，勾选 Preserve log。确认录制开启，清空网络列表。此时尚未访问 x.com；不要先打开 X 再开始录制。
3. 地址栏输入 `https://x.com/`，等待正常页面稳定，然后通过页面正常入口打开账号输入界面。在此停止，不填写账号。不要绕过挑战或改浏览器标识；若遇到拒绝/挑战，保留这次结果并停止。
4. 从 Network 导出包含响应内容的 HAR。Chrome 如果提供 sanitized 与含敏感信息两种导出，调查需要含 Cookie/Set-Cookie 的版本才能追踪 guest 来源；仅在独立未登录配置中使用，并按私有凭证保管。不要在聊天展示内容。若当前浏览器无法导出这些字段，告知限制即可。
5. 上传到 `~/rea-investigations/clean-bootstrap/bootstrap.har`。服务器目录权限 700、文件 600；不要放仓库。

```bash
mkdir -p ~/rea-investigations/clean-bootstrap
chmod 700 ~/rea-investigations/clean-bootstrap
# 上传后执行
chmod 600 ~/rea-investigations/clean-bootstrap/bootstrap.har
```

此步骤不运行 snippet。首页首次初始化可能早于可安装 snippet 的时机，现有 landing 字节样本用于后续对照，不能从旧 token 推断本次 guest 来源。若导出里的二进制正文有损，仍可先检查请求顺序、JSON guest 响应和 Set-Cookie；不重建损坏字节。

可在服务器本地运行只输出元数据的检查工具：

```bash
node tools/investigation/summarize-login-context.mjs ~/rea-investigations/clean-bootstrap/bootstrap.har
```

输出仅显示初始 guest 是否存在、指定请求的序号/类型/状态及 SDK 脚本类型，不显示请求头值、Cookie 值、URL 参数、正文或账号信息。`cleanBootstrapProven: false` 表示工具不自动认证捕获起点或协议完整性；即便未发现激活请求，也不能断言从未发生。工具仅支持约定 HAR 结构，不访问其记录的 URL；128 MiB 文件上限，失败输出固定错误提示。

## 本次补录已完成

已收到 117 条记录的 bootstrap.har，确认首个首页请求未携带 guest，响应设置的 gt 与后续 6 个 guest 请求头相等。当前无需重复补录。此样本未含 landing；后续若需要新证据，应围绕具体缺口另定范围，不重复密码登录。
