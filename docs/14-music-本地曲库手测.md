# 本地曲库手测（ADR 0011）

> 身份闸见 [`12`](12-站点身份手测.md)。部署同步见 [`13`](13-cylf.me-部署.md)。

前置：本机 `npm run dev` 为 implicit owner；网易 Cookie 已写入 `.netease-cookie`。

## owner（本机）

| # | 步骤 | 期望 |
|---|------|------|
| 1 | `music ls` | 第一份为「本地」，下列已缓存曲名+作者；其后为 yaml 歌单 |
| 2 | `music play` 未缓存曲 | 走网易流式 |
| 3 | `music play --song <歌名>` | 只搜单曲，不误开同名歌单 |
| 4 | `music play --playlist <歌单>` | 只开歌单 |
| 5 | `music download`（正在播单曲） | 无确认；`data/music/audio/<id>.<ext>` + 可选 lrc |
| 6 | `music download 歌名` | 打印「歌名 — 作者」；`y` 才下载，`n` 跳过 |
| 7 | `music download 甲,乙` | 逐首确认 |
| 8 | `music delete <完整歌名>` | 仅本地曲库精确名；文件删除；再播回到流式 |
| 9 | `music download --playlist …` | 拒绝 |

## visitor（`next build` + `NODE_ENV=production` 的 `next start`，未 login）

| # | 步骤 | 期望 |
|---|------|------|
| 10 | `music ls` | 只见「本地」歌单及曲目；无缓存则空提示 |
| 11 | 点播列表中的曲 | `/api/music/local` 200；网易 `song/url` 仍 403 |
| 12 | yaml 其它歌单 | 不出现在 picker / ls |
| 13 | `music download` / `music delete` | 需要主人会话 |

## 程序验证

`npm run test:local-audio` · `npm run test:playlist-project` · `npm run test:music-command` · `npm run test:track-resolve` · `npm run test:netease-url` · `npm run test:playlist-import`
