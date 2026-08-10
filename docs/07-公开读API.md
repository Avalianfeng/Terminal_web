# 公开读 API（Agent 调用契约）

> ⚠️ **本文已被 [`08-发现层对象模型.md`](08-发现层对象模型.md) 替代。**（2026-08-06）  
> 08 原地演进为统一条目 `/api/v1/items`，替换了本文的 `/archive`、分桶形状、`slug` 别名和 `path`/`status`/`tags` 字段。  
> `/api/v1/docs?path=` 保留为语法糖，`/person` 和 `/timeline` 不变。  
> **Agent 请以 08 为准。** 本文保留作为历史记录。

---

## 1. Agent 推荐调用流程

1. `GET /api/v1` — 发现能力与资源 `href`
2. 跟随 `resources.archive.href` → `GET /api/v1/archive` — 无 body 的索引
3. 跟随某条文档的 `href`（形如 `/api/v1/docs?path=…`）— 取 Markdown `body`
4. 需要人物 / 时间线时，跟随索引或发现里的 `person` / `timeline` 链接

**不要爬 HTML。** 不要依赖 Cursor CLI。服务器在线 + HTTP 即可。

权威键是 **`path`**（如 `thoughts/archive-system`）。`slug` 是便捷别名；冲突时 **projects 优先于 thoughts**。

---

## 2. 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1` | 发现：版本、能力、资源表、写预告 |
| GET | `/api/v1/archive` | 索引：person 摘要、projects/thoughts（无 body）、timeline 计数 |
| GET | `/api/v1/person` | 完整人物记录 |
| GET | `/api/v1/timeline` | 时间线条目数组 |
| GET | `/api/v1/docs?path=` | **推荐**：按 path 取全文 |
| GET | `/api/v1/docs/{slug}` | 按 slug 取全文（冲突见上） |

写方法 `POST` / `PUT` / `PATCH` / `DELETE`：当前一律 **405** + `error: method_not_allowed`。

公开 GET 带 `Access-Control-Allow-Origin: *`。响应含 `X-Archive-Generated-At`（与 envelope 内 `generatedAt` 同值）。

---

## 3. Envelope

成功：

```json
{
  "ok": true,
  "apiVersion": 1,
  "generatedAt": "<iso>",
  "data": {}
}
```

单篇 `data` 字段：`slug`, `path`, `title`, `summary`, `status?`, `tags`, `body`, `bodyFormat`（固定 `"markdown"`）, `href`。

失败：

```json
{
  "ok": false,
  "apiVersion": 1,
  "error": "not_found",
  "message": "..."
}
```

### 错误码

| code | HTTP | 何时 |
|------|------|------|
| `not_found` | 404 | 无此 slug/path |
| `bad_request` | 400 | 缺 `path` 等 |
| `method_not_allowed` | 405 | 写方法尚未开放 |

预留（写落地后）：`unauthorized` | `forbidden` | `conflict`。

---

## 4. curl 示例

```bash
# 发现
curl -sS http://localhost:3000/api/v1

# 索引
curl -sS http://localhost:3000/api/v1/archive

# 按 path（推荐）
curl -sS "http://localhost:3000/api/v1/docs?path=thoughts/archive-system"

# 按 slug
curl -sS http://localhost:3000/api/v1/docs/archive-system

# 写占位（应 405）
curl -sS -X PUT http://localhost:3000/api/v1/docs/archive-system
```

与终端对应：`open archive-system` / `find` 看到的 path，即 API 的 `path`。

---

## 5. 与人机界面的关系

| 面 | 角色 |
|----|------|
| 终端 + 纸面 | 给人探索与阅读 |
| `/api/v1/*` | 给 Agent / 脚本 |

同一 `content/`；不要维护第二份正文。

---

## 6. 写 / 鉴权（历史预告；已 superseded）

> **现行写契约见 [`08` §5.7](08-发现层对象模型.md)**（2026-08-07 落地）。本节保留旧预告，勿再当作现行约定。

- 头：`Authorization: Bearer <token>`（仍适用）
- 资源：**已迁至** `PUT`/`DELETE /api/v1/items?source=local&localKey=…`（不再是「将来 `PUT /api/v1/docs`」）
- 范围：token scope（`*` / `prefix/*` / 精确路径）
- `docs` 语法糖仍只读；对其写方法 → 405

落地见路线纲要（`docs/06-v1.0-路线纲要.md`）§4 / §7：**C 已于 08-07 完成最小闭环**。
