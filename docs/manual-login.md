# Phase 2 人工登录工具

验证日期：2026-10-06（Asia/Shanghai）。

## 实现

- 根目录 `pnpm x:auth` 启动 Collector 中的本地 TypeScript 工具。
- Playwright Chromium 使用 headless: false，由用户在浏览器中完成账号、密码、2FA 输入。
- 根目录 `pnpm x:auth:install` 安装 Chromium；`pnpm x:auth --help` 显示用法。
- 验证 HTTPS x.com/home、账号菜单、英文 For you 标签和有效 auth_token/ct0 cookie；X selector 集中在 packages/x/src/selectors.ts。
- 用户完成登录后回到终端按回车，校验成功才保存 storageState（包含 IndexedDB）。
- 登录态位置固定为仓库根目录 playwright/.auth/x.json，不依赖运行命令时的工作目录。
- 已有文件要求启动时输入 yes 确认覆盖；失败或取消不保存未验证状态。
- 原子写入；Linux/macOS 上目录 700、文件 600；文件与同目录临时文件均被 Git 忽略。
- 操作最多等待 15 分钟，支持 Ctrl+C、SIGTERM 和关闭浏览器取消。
- 不输出 cookie、密码、验证码或完整浏览器异常；不采集帖子、不访问数据库、不调用 Jev、不实现反自动化绕过。

新增依赖：Collector 的 playwright 1.63.0、开发依赖 tsx 4.23.15；pnpm-lock.yaml 已同步。

## 验证结果

- pnpm install --frozen-lockfile：通过。
- pnpm x:auth:test：三项测试通过，包括错误首页拒绝、无效 cookie 拒绝、权限及原子保存、无效替换保护。
- pnpm x:auth --help：通过。
- pnpm x:auth:install：Chromium 和 Headless Shell 安装成功。
- pnpm lint、pnpm typecheck、pnpm build：六个 workspace 通过。
- 非交互终端运行：预期以 INTERACTIVE_TERMINAL_REQUIRED 失败。
- 交互终端但无 DISPLAY：预期以 DISPLAY_REQUIRED 失败，未打开 X 页面。
- Chromium 主程序真实启动成功（验证使用 headless 模式）；本地模拟 HTML 的账号菜单和 For you 定位通过；模拟 cookie 的 storageState 保存和重新加载通过。临时文件已清理，未访问 X。
- 登录态及临时凭证路径的 Git 忽略规则通过；git diff --check 通过。

## 尚未验证

当前运行环境没有图形桌面，未进行真实 X 人工登录，未生成真实 playwright/.auth/x.json。真实 X DOM 和登录 cookie 规则仍需授权账号现场验证；模拟页面测试不能替代这一步。

在有图形桌面的电脑上按 README 的人工登录步骤运行，保持英文 X 界面。遇到登录限制按合作白名单流程处理，不增加绕过逻辑。当前仅本地凭证保存；生产加密与 Private Blob 在后续阶段实现。

数据库准备记录见 [database-preparation.md](database-preparation.md)。
