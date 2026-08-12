# ADR 0008: resources ContentGroup 与外部收藏呈现

- **Status**: Accepted
- **Date**: 2026-08-12
- **Code**: …；`lib/archive/resource-platforms.ts`；`lib/archive/resource-present.ts`；`lib/archive/resource-reading.tsx`
- **Contract**: [`08`](../08-发现层对象模型.md)（首版仍 `kind: document`）；[`0001`](0001-document-ref.md)（扩展 ContentGroup）；[`0007`](0007-security-deployment-posture.md) §3 纪律 A–E

## Context

- 需要在档案中收纳外部链接（文章、视频等）并附本地解读；与 §2.2 GitHub 外源（远端正文权威）不同，此处**盘内 markdown 为权威**，`url` 为引用。
- 产品分阶段：文章 MVP（链 + 笔记）→ 视频 embed → 其他平台；不宜与 §2.3 discovery `video`/`music` kind 或播放器产品化混开。
- 阅读面需预留扩展点，避免每种 `resourceType` 重写 `reading-panel`。

## Decision

### 1. 存储与身份

- 新增 **ContentGroup** `resources` → `content/resources/<slug>.md`。
- 身份仍 **DocumentRef**（[0001](0001-document-ref.md)）；discovery 仍 `source: local`、`kind: document`、`localKey: resources/<slug>`。
- **不写**新 discovery `kind`；不 mirror 外站正文。

### 2. Frontmatter 契约（resources 组）

| 字段 | 必填 | 说明 |
|------|------|------|
| `url` | 是 | 原文 / 原站链接（`http`/`https`） |
| `resourceType` | 是 | `article` \| `video` \| `audio` \| `link` |
| `platform` | 否 | 可自动推断；用于 embed 策略 |
| `embed` | 否 | 显式覆盖默认 embed 策略 |
| `audio` | audio 类型可选 | 自托管 mp3 路径，须 `/resources/audio/…` |
| `title` / `summary` / `status` / `tags` | 与现有 document 相同 | |

正文 markdown = 用户笔记 / 摘要 / 字幕式段落。

### 3. ArchiveDocument 显式字段

- `parseDocument` 将 `url`、`resourceType`（及可选 `platform`、`embed`、`audio`→`audioSrc`）写入 **ArchiveDocument**。
- `projects` / `thoughts` 无上述字段（undefined）；仅 `ref.group === "resources"` 时使用。

### 4. 阅读面三区（固定壳）

```text
ResourceReadingLayout
├── header   — 外链、类型、platform 元数据
├── media    — 按 resourceType + embed 策略（article MVP 为空）
└── notes    — MarkdownProse(body)
```

- 新 `resourceType` 或平台只增 **platform 注册表项** 或 **文案表**，不改布局与 storage。
- 文章默认不 embed 全文；视频阶段在 media 区加 iframe（流量走平台 CDN）。

### 5. 平台注册表与呈现策略

```text
resource-platforms.ts   — PlatformSpec[]：host 匹配 + buildEmbedUrl（YouTube / Bilibili …）
resource-present.ts     — shouldEmbed / resolveEmbed / header 外链文案（按 resourceType）
resource-reading.tsx    — 三区壳 + 通用 iframe（不 per-platform 分支）
```

- **embed 默认**：`resourceType === video` 且 `platform` 在注册表内；`embed: "true"|"false"` 显式覆盖。
- **文案默认**：`article→阅读原文`、`video→观看原视频`、`audio→收听原音频`、`link→打开原链接`。
- **增平台**：注册表加一项 + 单测 + 可选样本 md；**不**改 `ArchiveDocument`、discovery、阅读面布局。
- **暂不支持 embed** 的平台（如抖音、网易云）：仍可有 `platform` 与外链；`embed` 保持 false 或缺省。

### 6. 音频策略（自托管，非站外 embed）

- **不选**全站背景音乐 / 站外音乐 iframe（网易云等常需登录，embed 不稳定）。
- **选定**普通内容分享：`resourceType: audio` + frontmatter **`audio`**（映射 `ArchiveDocument.audioSrc`）指向 `public/resources/audio/*.mp3`；**`url`** 仍为原站出处链接；正文 markdown = 歌词 / 解读。
- media 区用 HTML5 `<audio controls>`（`resource-media.ts`），路径白名单 `/resources/audio/`。
- 文件体积：个人档案可接受数 MB 级 mp3 进仓或 deploy 包；大库/无损另议。

### 7. 与相邻 ADR 边界

- **§2.2 外源（github）**：不同数据模型与失败模型；可复用 URL 规范化 / embed 组件，不合并 ContentGroup。
- **§2.3 kind（image/music/video）**：自托管或非 markdown 条目时再开；本 ADR 不枚举 discovery kind。
- **0007**：写仍只经 `content-write.ts`；`edit` 与 HTTP 写共用闸门。

## Consequences

- VFS 增 `/resources`；终端增 `resources` 列表命令；索引含 resources 文档。
- 公网 href 白名单（0007 闸门）适用于笔记内链与 header 外链。
- header 外链文案按 **resourceType** 映射（`resource-present.ts`：文章/视频/音频/链接），非一律「阅读原文」。
- **平台注册表**（`resource-platforms.ts`）：YouTube + Bilibili iframe；新增平台只增 `PlatformSpec` 一项 + 单测，UI 与 storage 不变。
- 默认 embed：`resourceType: video` + 已注册 `platform`；`embed: "false"` 关闭；流量走各平台 CDN。
- 已知限制：B 站 `b23.tv` 短链无稳定 BV/av，需完整 video URL；抖音等待定策略（可先 `embed: false` + 外链）。
- 音频：站外平台不 embed；自托管 mp3 + 歌词见 §6。

## Rejected

- 每种类型单独 ContentGroup。
- 首版开放 discovery `video`/`music` available 枚举。
- 文章 iframe 镜像全文。
- 站外音乐 iframe / 全站背景音乐（与 resources 三分区模型分离；平台登录墙）。
- 与 GitHub 外源同 PR / 同 ADR 实现线。
