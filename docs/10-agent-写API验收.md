# Agent 写 API 验收 playbook

> 对应 [`09-v1.x-后续工作.md`](09-v1.x-后续工作.md) §1.1；契约细节见 [`08-发现层对象模型.md`](08-发现层对象模型.md) §5.7（PUT/DELETE）与 §5.8（PATCH）。

可重复回归用脚本：`scripts/smoke-write-api.mjs`（`npm run smoke:write-api`）。本页是人手走读路径；脚本覆盖鉴权、写副作用码、PATCH 三态与索引过滤。

**一句话规则**：新建 / 整份替换用 `PUT`（省略=清除）；只改一处用 `PATCH`（省略=保留）。

## 前置

1. `npm run dev`（默认 `http://localhost:3000`）
2. `npm run token:generate -- --scope thoughts/*` — **立刻保存明文**；`.env.local` 只存哈希
3. **重启 dev**（改 `.env.local` 后进程需重载环境变量）
4. 导出：`ARCHIVE_WRITE_TOKEN=<明文>`（或传 `--token`）

推荐 `thoughts/*`：脚本用 `projects/…` 测 403。全权 `*` 无法触发 403，smoke 会失败。

## 手走路径（发现 → 扫读 → 写 → 确认 → 删）

| 步 | 请求 | 期望 |
|----|------|------|
| 1 发现 | `GET /api/v1` | `ok`，含 `capabilities`（写面 + `search`/`find` + `filters`） |
| 1b 检索 | `GET /api/v1/search?q=…` / `GET /api/v1/find?q=…` | 200；items 无 body；find 含 path/localKey（见 08 §5.9） |
| 2 扫读 | `GET /api/v1/items?status=…&tag=…&fields=…` | `data.items[]`（索引已带 status/tags；过滤参数表见 08 §5.3） |
| 3 单读 | `GET /api/v1/items?source=local&localKey=thoughts/<已有>` | `{title, summary, status, tags, body, hash}` |
| 4 无鉴权写 | `PUT` 同 URL，无 `Authorization` | **401** |
| 5 越权 | `PUT … localKey=projects/…`，Bearer=`thoughts/*` token | **403** |
| 6 创建 | `PUT … localKey=thoughts/_smoke_write_api`，body 含 `title` | **201**，响应即完整落盘文档 + `created: true` + 新 `hash` |
| 7 修改 | `PATCH …` body 只带要改的字段（如 `{"body":"…"}`） | **200**，响应即完整落盘文档 + `created: false` + 新 `hash`（无需再 GET） |
| 8 删字段 | `PATCH …` body 带 `{"status": null}`（或 `""` / `tags: []`） | **200**，字段移除；原无该字段时 no-op 静默通过 |
| 9 冲突 | `PATCH`/`PUT` 带 `If-Match: <错误hash>` | **409**；按「重读详情 → 合并 → 再写」收敛 |
| 10 方法 | `POST /api/v1/items` | **405** |
| 11 删除 | `DELETE … localKey=thoughts/_smoke_write_api` | **200**；再 GET → **404** |

边界（契约已写死，脚本有断言）：`title` 不可删（null/空串 → 400）；空 body `{}` → 400；白名单外 body 键 → 400；`?status=` 重复 → 400；`?tag=` 重复为 AND。

脚本用专用 slug `_smoke_write_api`，结束会删。

## 一键

```bash
npm run token:generate -- --scope thoughts/*
# 重启 npm run dev 后：
set ARCHIVE_WRITE_TOKEN=<明文>   # PowerShell: $env:ARCHIVE_WRITE_TOKEN="…"
npm run smoke:write-api
```

可选：`ARCHIVE_API_BASE` 或 `--base` 指向非默认主机。

**站外真写实验**（docs/19 §4.8）：`ARCHIVE_WRITE_TOKEN=<token> node scripts/agent-write-thought.mjs` — 从仓内 markdown 源 PUT `thoughts/digital-archive-entry`（非 `_smoke_*`）；判据见 docs/19 §4.8。

## 与终端 edit 的关系

本包只护 **HTTP 写契约**。终端 `edit` / 面板回归见 `09` §1.2（手测清单，未含在本脚本内）。
