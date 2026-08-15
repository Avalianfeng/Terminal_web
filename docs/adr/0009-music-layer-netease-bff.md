# ADR 0009: 音乐层（网易云 BFF + 歌单 + BGM）

- **Status**: Accepted
- **Date**: 2026-08-12
- **Code**（逐步落地）：`lib/music/`（含 `playback-session.ts`）；`app/api/music/`；`content/music/playlists/`；BGM UI（`components/bgm-bar.tsx`）
- **Contract**: [0007](0007-security-deployment-posture.md)（local-dev 先；Cookie 等同密钥）；[0008](0008-resources-content-group.md)（单曲解读 / 自托管 mp3，与本文音乐层分离）

## Context

- 档案站需要 **全站 BGM** 与 **歌单级** 收听（如网易云 122 首歌单），不宜把大量 mp3 进 Git，也不宜嵌 `music.163.com` iframe（登录墙、试听限制）。
- [0008](0008-resources-content-group.md) 已覆盖 **单曲收藏 + 笔记 + 可选自托管 mp3**；与「歌单整体 + 流式播放」生命周期不同，不应合并进 `resources` ContentGroup。
- 本机已有可参考实现：`Mineradio`（Cookie 持久化 + NeteaseCloudMusicApi + `/api/audio` 代理）。
- 当前姿态：**local-dev**（[0007](0007-security-deployment-posture.md)）；公网 BFF / Cookie 暴露须另开闸门。

## Decision

### 1. 双轨管理单元

| 轨 | 用途 | 存储 | 播放 |
|----|------|------|------|
| **resources**（0008） | 带解读的单曲/文章/视频 | `content/resources/*.md` | 三分区阅读面；audio 可自托管 mp3 |
| **music 层**（本 ADR） | 歌单、BGM 队列 | `content/music/playlists/*.yaml` | 登录后流式；无 mp3 进仓 |

### 2. 网易云 URL 解析（客户端 / BFF 共用）

- 歌单：`…#/…/playlist?id=<playlistId>` → `playlistId`
- 单曲：`…#/song?id=<songId>` → `songId`
- Hash 路由：解析在浏览器或 BFF 内完成（服务端 HTTP 拿不到 `#` 后段）。

### 3. 歌单索引（盘内 yaml）

路径：`content/music/playlists/<neteasePlaylistId>.yaml`（数字 id，不用拼音 slug）。

| 字段 | 说明 |
|------|------|
| `slug` | 与 `neteasePlaylistId` 相同（文件名） |
| `neteasePlaylistId` | 网易云歌单 id（权威身份） |
| `name` | 中文展示名；终端 `music play 如人饮水` 按名匹配 |
| `sourceUrl` | 原始分享链 |
| `importedAt` | ISO 时间 |
| `tracks` | `{ id, name, artists[], durationMs? }[]` |

导入时由 BFF 调非官方 API（如 NeteaseCloudMusicApi）+ **服务端 Cookie** 拉全量曲目；yaml 只存元数据，不存音频。

### 4. BFF（Next.js Route Handlers，local-dev）

参考 Mineradio，最小端点集（后续 checkpoint 实现）：

| 路由 | 作用 |
|------|------|
| `POST /api/music/login/cookie` | 写入服务端 Cookie（须含 `MUSIC_U`） |
| `GET /api/music/login/status` | 探测登录 |
| `POST /api/music/playlist/import` | `{ url \| playlistId }` → 写 `<id>.yaml` |
| `GET /api/music/song/url?id=` | 取 CDN 流（带 Cookie） |
| `GET /api/music/audio?url=` | 代理音频（CORS + Referer） |

Cookie 存仓根 **`.netease-cookie`**（gitignore；须含 `MUSIC_U`），**不进 Git**、不下发浏览器。`GET /api/music/login/status` 只返回 `loggedIn` / `hasCookie`，不回显 Cookie。BFF 第一闸为 **owner principal**（[0010](0010-site-principal.md)：local-dev implicit 或公网 session）；访客 403。网易 Cookie 仍是第二闸。

### 5. BGM 播放面（站点级，非阅读三分区）

- 全局底栏播放器：队列、播放/暂停、下一首；与终端并存。
- 状态：当前 slug / 曲目索引 / 音量；可 sessionStorage，不要求 discovery 索引。
- UI 可借 Mineradio 播放器逻辑，但不引入 3D 歌单架等产品面。

### 6. 与 0008 边界

- 不把歌单写进 `resources`；不在 `resource-platforms` 注册网易云 iframe。
- resources 的 `resourceType: audio` + `audio` 字段仍仅用于 **自托管解读单曲**。

## Consequences

- 新依赖：`NeteaseCloudMusicApi`（或等价）仅服务端引用。
- 终端将增 `music` 子命令（import / play / …），注册方式遵循 [0002](0002-command-registry.md)：`CommandSpec.argComplete: "music"`，Tab 候选由 `musicArgCandidates`（与 `parseMusicArgs` 同源）派生；歌名/歌单名运行时补全另议。
- 122 首歌单 ≈ 一条 yaml + 流式播放；内存仅缓冲当前曲。
- 非官方 API / 版权 / Cookie 过期：个人 local-dev 可接受；公网部署前须评估并加闸门。

## Rejected

- 122 首 mp3 进 `content/` 或 `public/` 作为默认方案。
- 网易云 Web iframe 嵌入档案阅读面。
- 与 GitHub 外源、resources discovery `kind` 扩展混在同一 PR。
- 公网首期暴露无鉴权 `/api/music/*` 代理（BFF 须 owner；[0010](0010-site-principal.md)）。
- 把站点做成完整网易云替代；终端内百首点选作为主路径。
- **冷库管理页（原落地序 C）**：与终端 + 盘内 yaml 平行，主人侧低频维护不值得单开 UI。

## 修订（2026-08-12 · 热队列多列表播放器）

产品边界：**冷库连网易 + 少量热队列**（非替代网易云）。重心是**多全量热列表切换**，不做「限量重建小列表 / load 前 N」。

| 面 | 职责 |
|----|------|
| 终端 `music ls` | 歌单概览 |
| 底栏播放器 | 贴终端下（同宽挂载，保留分界+条身渐变）；左：曲名/艺人，其下横排播控；中右三行歌词窗；右「列表」；**歌单名在条外注释条** + 旁箭头 picker；曲目列表在条下展开 |
| `music show` / `hide` | **纯显示开关**（H1：藏整块 UI，声音可续）；show 有会话则展开当前列表，无会话则装默认第一份（按名排序） |
| 切歌单（P2） | 只换**浏览框**（歌单名/曲目列表）；**不打断**当前曲目会话（不清 src、不暂停）；点曲目才切 now |
| `music pause` / `music play` | pause 只暂停；无参 `play`（或 `resume`）恢复本终端曾有过的 now；无会话则提示没有 |
| 冷库维护 | **不做**单独管理页；`music sync` / `import` + 直接改/删 `content/music/playlists/*.yaml` 即可 |

### 落地序（动态调整）

| 序 | 内容 | 状态 |
|----|------|------|
| **A′** | 布局（条下列表）+ show/hide 显示开关 + 默认首列表 | 本刀 |
| **A″** | 中置歌单名 + 旁箭头 picker；右「列表」；描边钮；挂载分界 | 本刀 |
| **A‴** | 切歌单命令与按钮对齐 | 本刀 |
| **A⁺** | 账号歌单目录同步 + 按需载入 tracks | 已做 |
| **B** | 播放会话引擎（停干净 / 预取） | 已做 |
| ~~**C**~~ | ~~冷库管理页~~ | **否决**（见下） |

### 否决：冷库管理页（原 C）

主人侧维护已够用，不再单开管理 UI：

- 目录：`music sync`（启动 + 定时 + 手动）
- 全量导入：`music import` / BFF import
- 删歌单：直接删 `content/music/playlists/<id>.yaml`（sync 只 prune 空 stub，已 hydrate 的须手删——可接受）
- Cookie：写 `.netease-cookie` / login API（须站点 owner；local-dev 为 implicit owner）

再做管理页会与「终端 + 盘内 yaml」平行，收益低；真要图形化再议，不占路线图。

### B · 播放会话引擎（边界）

代码：`lib/music/playback-session.ts`（纯引擎，可测）；接线：`ArchiveTerminal` + `BgmBar`。

| 项 | 决策 |
|----|------|
| 形状 | 纯引擎 + 薄 React 接线（对齐 [0004](0004-reading-session.md) 风格）；不把取址逻辑堆在组件闭包 |
| 停干净 | `beginJump()` 抬**世代令牌**并 `Abort` 进行中的 song/url；清 `src` 时 pause + `load()` |
| 预取 | 仅预取**下一首**的 `/api/music/song/url` 进内存缓存；**不**第二 `<audio>`、不预下整段媒体 |
| 缓存 | `songId → { proxyUrl, fetchedAt }`；TTL **10 分钟**；`<audio>` error → `invalidate` + `bypassCache` 重取 |
| 歌词 | 同世代：`playGeneration` + `AbortController`，切歌作废旧 lyric 请求 |
| 本刀不做 | sessionStorage 恢复；上一首预取；隐藏 Audio 热身 |

曾否决 / 搁置：`--hide` 旗标（改用 `music hide`）；终端百首点选主路径；自动下载晋级；窗口化重建小列表。

切歌单命令（A‴）：

- `music playlist next` / `prev`（别名 `pl`）
- `music playlist <名|id>` 或 `music playlist use <名|id>`
- 行为与底栏歌单 picker 相同（P2：只换浏览框，不打断 now）；UI **不提供** `‹ ›` 切单键

播控命令：

- `music pause`：暂停当前 now（无会话 → 提示没有）
- `music play`：无参则恢复 now；`music play <歌单|歌名>` 唯一歌单优先，否则跨单曲名扫描首命中并打开该歌单
- `music resume`：同无参 `play`
- `music lyric [歌名]`：打印当前曲或指定歌曲全部歌词（无播放且无参 →「没有」）
- `music shuffle [on|off]`：随机播放（底栏「随」一键同步同一状态）
- `music stop`：清空 now + src（不可再无参恢复）

播放顺序：默认顺序环播；`shuffle` 开时 next/ended/不可播跳过均抽另一首。曲名扫描：`lib/music/track-resolve.ts`（play / lyric 共用）。

歌单目录同步（A⁺）：

- 启动 + 每 30 分钟：`POST /api/music/playlists/sync`（已登录时）
- 终端：`music sync` 手动触发
- 写入盘内 stub（`trackCount` + 空 `tracks`）；已全量 import 的 yaml **保留 tracks**
- 展开列表 / 点播：`GET /api/music/playlist/tracks?playlistId=` 按需载入并缓存

## 落地顺序（checkpoint 建议）

1. ADR 0009 + URL 解析 + yaml 类型
2. Cookie 存储 + login/status API
3. playlist/import → yaml
4. song/url + audio 代理
5. 终端 `music` 命令
6. BGM 底栏 UI
7. **A′ / A″**：播放器布局 + show/hide + 多列表切单 UI（本刀）
8. **A‴**：切歌单命令
9. **B**：播放会话引擎（世代 / Abort / 下一首 URL 预取 / TTL 缓存）— 已做
10. ~~**C**：冷库管理页~~ — **否决**（终端 + yaml 维护足够）

## 修订（2026-08-15 · SitePrincipal）

BFF 第一闸改为 [0010](0010-site-principal.md) owner principal（不再用 `NODE_ENV !== "production"` 当「是主人」）。网易 Cookie 仍为第二闸。公网访客流式仍关，直到日后本地缓存轨（0011）。
