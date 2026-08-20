# ADR 0014: 歌单策展与 sync 曲目分层

- **Status**: Accepted
- **Date**: 2026-08-20
- **Supersedes**: [0009](0009-music-layer-netease-bff.md) §3 单文件 yaml 形状（策展 + 曲目同文件）
- **Code**: `lib/music/playlist-store.ts`、`playlist-yaml.ts`、`playlist-sync.ts`；`app/api/music/playlist/import|tracks`
- **Related**: [0011](0011-music-local-cache-public.md)（`data/music/` gitignore）

## Context

`music sync` 在启动时与每 30 分钟自动跑，向 `content/music/playlists/*.yaml` 写盘。该目录被 Git 跟踪，导致正常运行持续产生脏 diff。`data/music/` 已 gitignore，但 playlists 不在其下。

## Decision

**方案 B — 拆两层：**

| 层 | 路径 | Git | 内容 |
|----|------|-----|------|
| 策展 | `content/music/playlists/<id>.yaml` | 是 | `slug` / `neteasePlaylistId` / `name` / `sourceUrl` |
| 曲目 | `data/music/playlists/<id>.yaml` | 否（随 `/data/music/`） | `importedAt` / `trackCount` / `tracks[]`（含 `localCachedAt` / `localExt`） |

1. **`syncPlaylistCatalog` 只写 `data/`**。自动发现的新远程歌单 → 仅 data stub（无 content）；data-only stub 可带展示字段供 owner 目录可见。
2. **显式 `music import`** → 写 slim content + 全量 data（策展动作，content 由人提交）。
3. **`patchTracksLocalCache`** 只改 data 层。
4. **`listPlaylistIndexes`** join content + data；content 与 data 的 id 并集；content 优先覆盖展示名。
5. **prune** 只删 data 里远程已不存在的空 stub；**不自动删 content yaml**。
6. 部署时同步整个 `data/music/`（含 `playlists/`），见 [`13`](../13-cylf.me-部署.md)。

## Consequences

- 正常 dev / sync 不再修改 Git 跟踪的 content playlists。
- 大曲目清单（数千行）离开仓；策展意图仍版本化。
- 迁移：`node scripts/migrate-playlist-split.mjs` 拆分存量全量 yaml。

## Rejected

- **A**：全部迁到 `data/`，策展也离开 Git。
- **C**：取消自动 sync，产物由人提交（零结构改动但丢自动更新语感）。
