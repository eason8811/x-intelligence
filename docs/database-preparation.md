# Phase 2 数据库准备

验证日期：2026-10-06（Asia/Shanghai）。目标：用户配置的 Neon 开发数据库。

## 配置与执行

根目录 `.env` 已配置 DATABASE_URL，文件被 Git 忽略。未记录或输出连接串、用户名、密码或端点。

- `pnpm db:migrate`：成功执行初始 migration。
- `pnpm db:check`：migration 元数据检查通过。
- 已确认 x_post、feed_run、feed_observation、post_classification 四张表存在。
- drizzle.__drizzle_migrations 中有一条记录。
- `packages/db/tests/schema.sql` 的约束测试执行通过，测试事务回滚。执行时将位置约束测试的 UPDATE 限定到测试 run，避免更新其他记录。
- 项目 createDatabase 工厂通过实际 Neon/Drizzle 连接验证。
- 通过该工厂执行事务插入、事务内读回、主动回滚，并确认事务外不存在测试记录。

数据库准备阶段未修改 Schema 或生成新的 migration，也未接入 X 或 Jev。

## 已观察到的提示

pg 驱动提示 sslmode=require 等值的兼容语义将在未来主版本变化。当前验证成功；本次未修改用户的连接配置，也未关闭证书验证。

## 下一步

实现本地 `pnpm x:auth` 人工登录工具，登录态保存在被 Git 忽略的 playwright/.auth/x.json。随后实现静态 HTML fixture Parser 与本地采集入库。
