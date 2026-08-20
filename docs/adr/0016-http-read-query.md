# ADR 0016: HTTP 读查询（search / find）

- **Status**: Accepted
- **Date**: 2026-08-20
- **Code**: `lib/archive/query.ts`；`app/api/v1/search/route.ts`；`app/api/v1/find/route.ts`；`lib/archive/discovery.ts`
- **Contract**: [`08`](../08-发现层对象模型.md) §5.9；终端命令 `search` / `find`（[`05`](../05-v0.3-档案与命令.md)）

## Context

- Agent HTTP 写面已有 `PUT/PATCH/DELETE /api/v1/items`（ADR 0005 / 0007），但 **读侧** 仅有索引与详情；终端 `search`（全文子串）与 `find`（VFS 路径/名称）无 HTTP 等价。
- [`09`](../09-v1.x-后续工作.md) §3.3 将「HTTP 全文检索」列为能力债；规模仍小（~十几篇），可在不分页前提下先落地与终端对齐的查询。
- 音乐 BFF、owner session **不**纳入本 ADR。

## Decision

1. **共享内核**：`lib/archive/query.ts` 供终端（`commands.ts`）与 HTTP 共用；终端仍负责格式化输出。
2. **`GET /api/v1/search?q=`**（公开读）：
   - 在 title / summary / **body** / tags / slug / localKey 上做大小写无关子串匹配；
   - `q` 缺失或空白 → 400；
   - 响应 `{ items: ItemIndex[] }`，**不含 body**（与索引同构）。
3. **`GET /api/v1/find?q=`**（公开读）：
   - 在 VFS 可 open 节点上匹配 path / name / refSlug / 类型标签；
   - **不搜正文**；`q` 可省略或空 → 列出全部可 open 节点（与终端 `find` 无参一致）；
   - 响应 `{ nodes: { path, type, name, refSlug?, localKey? }[] }`。
4. **发现文档**：`capabilities.search` / `capabilities.find`；`resources.search` / `resources.find` 带 href。
5. **不分页**：破百篇再评估 `?limit=`（仍见 `09` §3.3）。

## Consequences

- Agent 可发现 → search/find → 详情 → 写，无需模拟终端。
- 读 API 仍 CORS `*`；无 Bearer。

## Rejected

- 将 search 合并进 `GET /api/v1/items?q=`（索引过滤与全文检索语义不同）
- 在 search 结果中返回 body（payload 膨胀）
- 本阶段接入 music / owner / mkdir

## 与既有 ADR

- **0003**：query 逻辑在 discovery 域旁路模块，HTTP 仍经 `api-http` 适配。
- **0007**：只增 **公开读** 端点，无新写口。
