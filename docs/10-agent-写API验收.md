# Agent 写 API 验收 playbook

> 对应 [`09-v1.x-后续工作.md`](09-v1.x-后续工作.md) §1.1；契约细节见 [`08-发现层对象模型.md`](08-发现层对象模型.md) §5.7。

可重复回归用脚本：`scripts/smoke-write-api.mjs`（`npm run smoke:write-api`）。本页是人手走读路径；脚本覆盖鉴权与写副作用码。

## 前置

1. `npm run dev`（默认 `http://localhost:3000`）
2. `npm run token:generate -- --scope thoughts/*` — **立刻保存明文**；`.env.local` 只存哈希
3. **重启 dev**（改 `.env.local` 后进程需重载环境变量）
4. 导出：`ARCHIVE_WRITE_TOKEN=<明文>`（或传 `--token`）

推荐 `thoughts/*`：脚本用 `projects/…` 测 403。全权 `*` 无法触发 403，smoke 会失败。

## 手走路径（发现 → 写 → 删）

| 步 | 请求 | 期望 |
|----|------|------|
| 1 发现 | `GET /api/v1` | `ok`，含 `capabilities`（写面已声明） |
| 2 索引 | `GET /api/v1/items` | `data.items[]` |
| 3 详情 | `GET /api/v1/items?source=local&localKey=thoughts/<已有>` | `data.hash`（SHA-256 hex） |
| 4 无鉴权写 | `PUT` 同 URL，无 `Authorization` | **401** |
| 5 越权 | `PUT … localKey=projects/…`，Bearer=`thoughts/*` token | **403** |
| 6 创建 | `PUT … localKey=thoughts/_smoke_write_api`，body 含 `title` | **201**，响应带新 `hash` |
| 7 冲突 | 同上 PUT，`If-Match: <错误hash>` | **409** |
| 8 覆盖 | `If-Match: <步骤6/详情的 hash>` | **200**，新 `hash` |
| 9 方法 | `POST /api/v1/items` | **405** |
| 10 删除 | `DELETE … localKey=thoughts/_smoke_write_api` | **200**；再 GET → **404** |

`If-Match` 不带 = 直接覆盖（upsert）。脚本用专用 slug `_smoke_write_api`，结束会删。

## 一键

```bash
npm run token:generate -- --scope thoughts/*
# 重启 npm run dev 后：
set ARCHIVE_WRITE_TOKEN=<明文>   # PowerShell: $env:ARCHIVE_WRITE_TOKEN="…"
npm run smoke:write-api
```

可选：`ARCHIVE_API_BASE` 或 `--base` 指向非默认主机。

## 与终端 edit 的关系

本包只护 **HTTP 写契约**。终端 `edit` / 面板回归见 `09` §1.2（手测清单，未含在本脚本内）。
