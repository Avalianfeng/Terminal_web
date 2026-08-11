# ADR 0003: 发现域与 HTTP 适配分层

- **Status**: Proposed（**暂缓实现**；grilling Q1/Q2 已定）
- **Date**: 2026-08-11
- **Commit**: —
- **Related**: `lib/archive/api-read.ts`（现状混杂）；契约权威仍为 `docs/08`

## Context

`api-read.ts` 同时含 Item 发现模型、索引过滤、`/api/v1` href、`jsonOk`/`jsonError` 与读盘 hash，不利于单测发现逻辑与未来外源扩展。

## Decision（拟定，实现前勿当已落地）

1. **三模块**：  
   - **discovery**：Item 模型、索引/过滤/查找、文档→Item 投影（无硬编码传输细节为权威）  
   - **api-http**：`jsonOk` / `jsonError`、状态码映射  
   - **read-adapter**（或同等命名）：读盘 / `toItemPayloadWithHash` 等 I/O  
2. 现 `api-read.ts` 落地时可薄 re-export 或删除并由调用方改 import。  
3. **对外 JSON 契约**仍以 `docs/08` 为准；本 ADR 只钉模块边界。

## Consequences（实现后）

- 发现索引可无 Response、无 fs 单测。  
- HTTP 与读盘可分别替换/扩展（外源、新 kind）。

## Rejected（grilling）

- 只抽 HTTP 信封、Item 仍困在 `api-read`（过小）。  
- 两分且读盘长期留在 discovery（相对本 ADR 的三拆决定被否为默认落地形状）。

## Note

实现节奏：**暂缓**；恢复时以本 ADR 为准开刀，勿另起冲突方向的「优化重构」而不修订 ADR。
