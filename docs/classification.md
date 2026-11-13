# TypeSafe Jev 分类

`pnpm x:classify` 是手动运行的独立分类任务。它从 `post_classification` 认领 `PENDING` 帖子，逐条调用 TypeSafe Jev，再写入主题、标签、相关性和实际模型版本。采集过程不会等待分类。

## 运行

在根目录 `.env` 配置：

```env
DATABASE_URL=...
JEV_API_KEY=...
JEV_MODEL=jev-1.14.0
```

执行小批次：

```bash
pnpm x:classify --count 5
```

默认处理 5 条，单次上限 20 条。`PENDING` 记录按创建时间处理。失败记录变为 `FAILED`，保存错误码而不保存原始响应、异常文本或帖子内容。重试失败记录需要显式运行：

```bash
pnpm x:classify --count 5 --retry-failed
```

超过一小时仍为 `PROCESSING` 的记录会在下次启动分类命令时转为 `FAILED`。任务不会自动重试，也未接入 Cron。

## 每次调用的审计记录

每次尝试会在请求 Jev 前新增一行 `post_classification_attempt`：

- `request_snapshot` 保存实际使用的 endpoint、方法、超时、非敏感请求头和完整 JSON 请求体。它包含帖子文本、引用帖文本、语言和问题定义，不含 `Authorization` 或 API Key。
- 成功收到 JSON 响应后，`response_snapshot` 保存 Jev 原始响应对象，包括 `answers`、模型和 token usage。即使响应结构无法映射到业务 DTO，也会保留该响应并将尝试标为 `FAILED`。
- 网络、HTTP 或 JSON 解析失败时，保存请求快照与安全错误码；没有可用的 Jev JSON 响应时，`response_snapshot` 为空。
- 每次重试新增一条尝试记录；`post_classification` 仍保存当前业务结果。审计行通过帖子 ID 与原帖关联，并按请求开始时间排序。

请求快照会重复保存 `x_post` 中的文本。当前没有自动过期或清理任务；按项目的数据保留要求处理这些快照。新增 migration 尚需在目标 PostgreSQL 上应用：

```bash
pnpm db:migrate
```

查看最近调用及其结果：

```sql
SELECT post_id, attempt_number, provider, classifier,
       model_requested, model_returned, status, error_code,
       started_at, completed_at
FROM post_classification_attempt
ORDER BY started_at DESC
LIMIT 10;

SELECT post_id, request_snapshot, response_snapshot
FROM post_classification_attempt
ORDER BY started_at DESC
LIMIT 1;
```

第一次实际运行的 5 条分类发生在审计表实现之前，因此没有对应的请求或响应快照，无法从当前分类结果还原原始 Jev 回答。

## 分类字段

- `topic` 使用共享 DTO 中的 11 个主主题之一。
- 标签从当前有限候选集筛选；只有 Jev 判定概率不低于 `0.5` 的标签会保存。
- `relevance_score` 将 Jev 的 0–4 评分除以 4，保存为 0–1。
- `classifier` 固定为 `jev`，`classifier_version` 使用 API 响应里的版本化模型 ID。

当前候选标签：OpenAI、Claude、Gemini、LLM、Agent、MCP、RAG、Java、Spring、React、Next.js、Vue、Database、DevOps、GitHub、Open Source。之后可根据真实结果调整。

## 发送到 TypeSafe 的数据

请求只包含帖子文本、引用帖文本和语言；不包含帖子 ID、作者 ID、用户名、作者名称、帖子 URL 或图片。API Key 仅由服务端进程读取，不写入日志或数据库。

TypeSafe 文档说明 Jev 不使用客户输入和输出训练模型，数据在美国处理；标准使用没有公开的固定保留时长。若需要响应后立即删除请求内容，可在 TypeSafe 控制台启用 Zero Data Retention。首次实际运行前请确认账号侧的数据保留设置符合项目要求。参见 [模型文档](https://docs.typesafe.ai/models) 与 [数据处理说明](https://help.typesafe.ai/articles/5974925716)。

用户于 2026-11-13 回报：`pnpm x:classify --count 5` 成功，数据库中有 5 条 `CLASSIFIED`、30 条 `PENDING`，无失败。该结果验证了 5 条请求的服务连通、响应映射和分类写回；分类质量仍需更多样本评估。新增审计表的 migration 需要在目标数据库上应用后，后续调用才会保存快照。
