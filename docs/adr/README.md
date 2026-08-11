# Architecture Decision Records

> **权威**：本目录记录**难逆的结构取舍**（选了什么 / 否了什么）。  
> **不是**：WIP 进度（→ 本机中枢）、HTTP 契约细节（→ [`../08-发现层对象模型.md`](../08-发现层对象模型.md)）、下一刀清单（→ [`../09-v1.x-后续工作.md`](../09-v1.x-后续工作.md)）、领域词条（→ [`../../CONTEXT.md`](../../CONTEXT.md)）。

## 怎么用

1. 改身份、写路径、命令注册、阅读会话、发现/HTTP 边界等**模块形状**前：先读相关 ADR。  
2. 若要推翻某条：新开 ADR（`Supersedes: NNNN`），勿改写历史 Decision 装成从未选过。  
3. 新 ADR：复制最短模板（Context / Decision / Consequences / Rejected）；编号递增。

## 索引

| ADR | 标题 | 状态 | 落地提交 |
|-----|------|------|----------|
| [0001](0001-document-ref.md) | DocumentRef 为本地文档权威身份 | Accepted | `8aaa852` |
| [0002](0002-command-registry.md) | 终端命令注册表同源 | Accepted | `6055363` |
| [0003](0003-discovery-http-split.md) | 发现域与 HTTP 适配分层 | Accepted | `bb5a255` |
| [0004](0004-reading-session.md) | 阅读会话 leave/demote 状态机 | Accepted | `74c317e` |
| [0005](0005-unified-write-entry.md) | 统一写入口 + expectedHash | Accepted | `d678064` |
| [0006](0006-post-write-reading-refresh.md) | 写后阅读面即时刷新 | Accepted | `3d88447` |

编号与 2026-08-11 架构深化候选 #1–#6 对齐，便于对照；落地顺序不必等于编号顺序。
