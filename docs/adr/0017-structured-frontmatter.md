# ADR 0017: 结构化 frontmatter（严格 schema）

- **Status**: Proposed
- **Date**: 2026-08-20
- **Contract**: [`08`](../08-发现层对象模型.md) §5.11（预留）；[`parse-document.ts`](../../lib/archive/parse-document.ts)

## Context

- HTTP 写面已有 JSON PUT/PATCH（08 §5.7–5.8）；终端 `edit` 使用整份 raw markdown（`saveDocumentRaw`），可含**任意** frontmatter 键。
- PUT 整份替换会**丢弃契约外** frontmatter；PATCH 保留未提及键——Agent 与人类 editor 行为不一致。
- 曾考虑 HTTP **raw 读**（返回磁盘全文）作为第二真相源；若全站改为**严格结构化**，则 raw 读**不再需要**——GET 详情即权威结构化视图。

## Decision（Proposed — 未实现）

1. **按组白名单** frontmatter 键：
   - 通用（projects / thoughts / resources）：`title`（必填）、`summary`、`status`、`tags`
   - resources 追加：`url`、`resourceType`、`platform`、`embed`、`audioSrc`（对齐 `ArchiveDocument` / ADR 0008）
2. **GET 详情**：只返回**非空**合法字段；空键省略（不返回 `""` / 空 tags）。
3. **非法键**：磁盘存在白名单外 frontmatter → 文档标记 **structurally invalid**（详情响应 `valid: false` + `issues[]`，或独立错误码——Accepted 时二选一）。
4. **写**：PUT/PATCH 拒绝写入非法键；若磁盘已有非法键，写前要求修复（400/409——Accepted 时定）。
5. **Rejected（本 ADR）**：
   - HTTP `?format=raw` 读/写端点
   - 静默保留任意 frontmatter 键（与严格结构化冲突）

## 冗余与预留字段

- 白名单可含「允许但常为空」的键；GET 仍省略空值。
- 扩展键须 **新开 ADR 修订白名单**，不得 ad-hoc 加键。

## 后续（不在 Proposed 实现）

- **站内 AI 文档格式化**：错别字、frontmatter 规范化、非法键修复——另开 ADR / `09` 项；0017 只锁 schema，不锁 AI 产品面。
- **Accepted 时**：统一 `parseDocument`、HTTP 详情、PUT/PATCH 校验；可选迁移脚本清理存量非法键。

## Consequences（若 Accepted）

- Agent 与人类共用同一结构化视图；无 raw 第二真相源。
- 人 editor 粘贴未知键将被显式拒绝或标记，需修复后再写。

## Rejected

- 维持「磁盘 raw = API 真相」双轨
- 0017 阶段实现 AI 自动修文
