# ADR 0011: 本地曲库（访客可播已落盘媒体）

- **Status**: Accepted
- **Date**: 2026-08-15
- **Code**: `lib/music/local-audio-store.ts`；`lib/music/playlist-project.ts`；`app/api/music/local/`；`app/api/music/song/play/`；`app/api/music/song/download/`
- **Contract**: [0009](0009-music-layer-netease-bff.md)（歌单 yaml + BGM）；[0010](0010-site-principal.md)（owner 流式 / download）；[0008](0008-resources-content-group.md)（解读单曲 ≠ BGM 曲库）

## Context

公网访客不能走网易云 Cookie 代理。需要同一套终端 + 底栏：访客只听**已落盘**媒体；主人仍可流式，并用 `music download` 固化。yaml 歌单已是目录权威；缺的是按 `songId` 的 blob + 歌词层。

## Decision

### 1. 曲库 ≠ 第二套歌单

- 目录与曲名仍是 `content/music/playlists/<id>.yaml`（`PlaylistTrack.id` = 网易 song id）。
- 媒体与歌词在 `data/music/`（gitignore；部署 volume / rsync），**不进 Git**、不进 `public/resources/audio`（0008）。

```text
data/music/
  audio/<songId>.<ext>    # ext ∈ mp3|m4a|ogg|flac
  lyric/<songId>.lrc      # 可选
```

同 id 只保留一份媒体。上架判定以**盘上文件存在**为准；yaml 的 `localCachedAt` / `localExt` 仅展示。

### 2. 播放源

1. 本地音频存在 → `GET /api/music/local?id=`（**公开**，不读站点 session / 网易 Cookie）
2. 否则仅 **owner** → 现有 `song/url` + audio 代理
3. visitor 无文件 → unplayable

统一入口：`GET /api/music/song/play?id=`（有本地则 local URL；否则 owner 流式）。

### 3. 访客投影

`assemblePlaylistCatalog`：合成一份特殊歌单 **「本地」**（跨 yaml 去重的已落盘曲）。访客 **只看见这一份**；owner 看到「本地」排在 yaml 歌单之前。上架仍以盘上文件为准。

### 4. 歌词

- 有 `lyric/<id>.lrc`：任何人可读（与 `parseLrc` 共用）。
- 否则仅 owner 打网易 lyric API。

### 5. 管理（无新管理页）

| 动作 | 谁 | 行为 |
|------|-----|------|
| `music download` | owner | 无参：当前正在播放的单曲（不确认）。有参：逗号分隔歌名，逐首取搜索第一命中，y/N 确认后写入。只单曲（`--playlist` 拒绝） |
| `music delete <完整歌名>` | owner | 精确歌名且须已在本地曲库；删文件 + 清字段 |
| 手扔 `data/music/audio/` | 运维 | 按存在性识别 |
| `sync` / `import` | owner | 只动 yaml，不自动下媒体 |

首刀不转码；download 按 CDN 路径推断 ext。

### 6. 与 0008 / 0009 / 0010

- 0008 自托管 mp3 仍是解读单曲（`public/resources/audio`）。
- 0009 全量 mp3 进仓仍否决；**按需缓存**允许。
- 网易 BFF 路由保持 owner 闸；公开的只有 `local` 与「有本地 lrc 时的 lyric / play」。

## Consequences

- 公网默认可听的曲 = 部署机上 `data/music/audio` 的子集。
- 访客队列可能远短于 yaml；这是产品预期，不是丢数据。

## Rejected

- 把 BGM 曲库 merge 进 resources
- 默认把媒体进 Git / `public/`
- 访客可见全量灰条
- 冷库管理页（0009 已否）
- 首刀转码管线
- 本机 `logout` 伪装 visitor（验访客用单测 + `next start`）
