# 自研 JP-5 登录入口

本次仓库清理移除了 twitter-monitor 登录/采集实现、上游 vendor、采集探针与专属依赖。`pnpm x:auth` 现在只引用自研编排，不再调用旧上游。

## 当前可运行内容

- `pnpm x:auth --help`：入口说明。
- `pnpm x:auth:test`：JP-5 协议、编排、生产阻断与私有会话存储的离线测试。
- `pnpm x:auth:offline`：合成状态的离线表单演示。
- `pnpm x:auth`：当前以 `AUTH_RUNTIME_UNAVAILABLE` 非零退出，不读取凭证、不访问网络、不修改已有会话。

## 模块与边界

`packages/x/src/jp5/login.ts` 根据实际返回状态编排输入与表单提交，使用当前状态的字段。生产适配器负责同一登录上下文的初始化、运行时字段与 POST，以及独立身份验证。编排拒绝倒退、重复或未知状态；中止后不继续提交。候选完成不是登录成功，必须验证身份、校验 cookie 并由用户确认。

`apps/collector/src/auth/adapter.ts` 明确标记生产适配尚不可用。不会用历史捕获、合成 token 或独立 SDK 调查脚本填补缺失能力。

`apps/collector/src/auth/login.ts` 保留隐藏输入、15 分钟取消、确认覆盖和私有原子保存。适配器就绪后才会进入这些步骤。已有 `playwright/.auth/x.json` 保持原样。

## 待完成门槛

1. 同会话正常运行时提供者与 HTTP POST 适配。
2. 支持从 guest 上下文进入认证态的 cookie 生命周期。
3. 独立远端身份读取与账号一致性验证。
4. 私有保存后在新进程验证会话复用。
5. 单独实现并验证 For You 采集，不恢复旧探针。

以上均不能用离线测试、SDK 可加载或字符串已生成代替。
