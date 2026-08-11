# ADR 0003: 发现域与 HTTP 适配分层

- **Status**: Accepted
- **Date**: 2026-08-11
- **Commit**: （本提交）
- **Code**: `lib/archive/discovery.ts` · `lib/archive/api-http.ts` · `lib/archive/read-adapter.ts`；`api-read.ts` 薄 barrel
- **Contract**: 对外 JSON 仍以 `docs/08` 为准（本 ADR 只钉模块边界）

## Context

`api-read.ts` 曾同时含 Item 发现模型、索引过滤、`/api/v1` href、`jsonOk`/`jsonError` 与读盘 hash，不利于单测发现逻辑与未来外源扩展。

## Decision

1. **三模块**：  
   - **discovery**：Item 模型、索引/过滤/查找、文档→Item 投影；`href` 经可注入 `ItemHrefFor`（默认 `defaultItemHref`）  
   - **api-http**：`jsonOk` / `jsonError` / CORS / `methodNotAllowed`  
   - **read-adapter**：`payloadFromRaw` / `toItemPayloadWithHash`（fs → ItemPayload）  
2. `api-read.ts` 保留为 **deprecated 薄 re-export**；路由改从三模块直接 import。  
3. 不改对外 JSON 契约字段与过滤语义。

## Consequences

- 发现索引可无 Response、无 fs 单测（`npm run test:discovery`）。  
- HTTP 与读盘可分别扩展；外源/新 kind 优先改 discovery。

## Rejected

- 只抽 HTTP 信封、Item 仍困在 `api-read`。  
- 两分且读盘长期留在 discovery（相对本 ADR 的三拆）。
