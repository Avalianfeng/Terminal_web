# ADR 0015: HTTP 目录写（mkdir / rmdir）

- **Status**: Accepted
- **Date**: 2026-08-20
- **Code**: `app/api/v1/directories/route.ts`；`lib/archive/write-api-auth.ts`；`lib/archive/content-write.ts`（`createDirectory` / `removeDirectory`）
- **Contract**: [`08`](../08-发现层对象模型.md) §5.10；终端 `mkdir` / `rmdir`（owner Actions）

## Context

- Agent HTTP 写面已有 document CRUD（`/api/v1/items`），但终端 **mkdir / rmdir** 仅经 owner Server Actions，Agent 无法建空目录或删空目录。
- PUT 文档时 `ensureParentDir` 会自动建**父目录**，但不能单独建空目录簇（ADR 0013）。
- 不需要 owner session：与 items 相同，**Bearer + scope** 即可（0007 HTTP 轨）。

## Decision

1. **`PUT /api/v1/directories?group=&path=`** — mkdir -p 语义；201 新建 / 200 已存在 no-op。
2. **`DELETE /api/v1/directories?group=&path=`** — 仅删**空**目录；非空 → 409；不存在 → 404。
3. **鉴权**：`Authorization: Bearer`；scope target = `` `${group}/${path}` ``（`thoughts/*` 覆盖 `thoughts/a/b`）。
4. **校验**：`group` ∈ projects|thoughts|resources；`path` 多段 slug 白名单（同 0013）。
5. **发现文档**：`resources.directories.write` → `PUT|DELETE /api/v1/directories?…`。
6. 写后 `revalidatePath("/")`（与 items 一致）。

## 与 items 的分工

| 操作 | items | directories |
|------|-------|---------------|
| 写文档并顺带建父目录 | PUT/PATCH | — |
| 只建空目录 | — | PUT |
| 删文档 | DELETE items | — |
| 删空目录 | — | DELETE |

## Consequences

- Agent 可 mkdir → PUT 文档 → rmdir 空目录，完整簇管理。
- UI 仍走 owner Actions；HTTP 不替代 login。

## Rejected

- owner session 作为目录写鉴权（与 Agent 轨混淆）
- 非空目录级联删除
- music / person / timeline 目录 API

## 与既有 ADR

- **0013**：VfsDirRef 与路径校验共用。
- **0007**：只经 `content-write.ts`；Bearer 写轨扩展，无新无鉴权口。
