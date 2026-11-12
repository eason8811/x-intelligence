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

## 分类字段

- `topic` 使用共享 DTO 中的 11 个主主题之一。
- 标签从当前有限候选集筛选；只有 Jev 判定概率不低于 `0.5` 的标签会保存。
- `relevance_score` 将 Jev 的 0–4 评分除以 4，保存为 0–1。
- `classifier` 固定为 `jev`，`classifier_version` 使用 API 响应里的版本化模型 ID。

当前候选标签：OpenAI、Claude、Gemini、LLM、Agent、MCP、RAG、Java、Spring、React、Next.js、Vue、Database、DevOps、GitHub、Open Source。之后可根据真实结果调整。

## 发送到 TypeSafe 的数据

请求只包含帖子文本、引用帖文本和语言；不包含帖子 ID、作者 ID、用户名、作者名称、帖子 URL 或图片。API Key 仅由服务端进程读取，不写入日志或数据库。

TypeSafe 文档说明 Jev 不使用客户输入和输出训练模型，数据在美国处理；标准使用没有公开的固定保留时长。若需要响应后立即删除请求内容，可在 TypeSafe 控制台启用 Zero Data Retention。首次实际运行前请确认账号侧的数据保留设置符合项目要求。参见 [模型文档](https://docs.typesafe.ai/models) 与 [数据处理说明](https://help.typesafe.ai/articles/5974925716)。

本地实现阶段没有调用 Jev API。真实服务连通、账号计费、分类质量和端到端数据库状态更新仍需实际运行验证。
