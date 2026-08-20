# cylf.me 部署短 runbook

> 原则：[`adr/0007`](adr/0007-security-deployment-posture.md)、[`adr/0010`](adr/0010-site-principal.md)、[`adr/0018`](adr/0018-content-visibility-and-sync.md)。契约细节不复制，只列上线要带的 env 与口令。  
> **上机前**：按 [`20-部署前自评清单.md`](20-部署前自评清单.md) 逐阶段勾选（本机模拟 production 必做）。

## 档案正文（不经 Git）

`content/**/*.md`、`person.json`、`timeline.md` **不进公开 Git**（[0018](adr/0018-content-visibility-and-sync.md)）。上机用**自建同步**把本机 **public** 子集推到部署机 `content/`：

```text
publish 白名单（ADR 0019 不变量）=
  content/person.json
  content/timeline.md
  content/projects/**
  content/thoughts/**
  content/resources/**
# 绝不包含 content/private/**
```

可测：`lib/archive/publish-paths.ts` → `selectPublishPaths`。读侧过滤见 [0019](adr/0019-capability-zone-permission.md)。歌单策展 `content/music/playlists/*.yaml` 仍随代码仓；曲目与音频仍同步整个 `data/music/`（下节）。

备份以**本机**为准；服务器不做对等完整内容备份义务。

## 环境变量

在生产环境设置（勿提交 Git）：

- `ARCHIVE_OWNER_PASSWORD_HASH` — 本机 `npm run owner:password` 生成后拷哈希
- `ARCHIVE_SESSION_SECRET` — 随机 32+ 字节（脚本会在 `.env.local` 补一个，生产请单独生成）
- `ARCHIVE_WRITE_TOKENS` — `npm run token:generate` 的哈希 JSON（Agent 写）
- `ARCHIVE_PUBLIC_ORIGIN` — 如 `https://cylf.me`（写 API CORS）
- 可选 `ARCHIVE_UI_WRITE=false` — 事故关死终端 edit，即使已 login

`NODE_ENV=production`。不要把主人口令或写 token 明文放进仓库 / 前端。

## 本地曲库（访客可播）

同步仓根 `data/music/`（`audio/` + `lyric/` + `playlists/`，gitignore）到部署机。无此目录时访客 `music ls` 为空，只能外链。详见 [`adr/0011`](adr/0011-music-local-cache-public.md) 与 [`adr/0014`](adr/0014-playlist-curation-vs-sync.md)。

## 网易云 BFF

仓根 `.netease-cookie`（gitignore）须在**部署机**上且含 `MUSIC_U`。站点 `login` 不等于网易登录。无此文件时 owner 流式仍 401。

## 上线冒烟

1. 访客：`help` 无 `edit`；`open`/`cat` 正常
2. `login` → `edit` 可保存；`logout` 后不可
3. `ARCHIVE_WRITE_TOKEN=… npm run smoke:write-api`（对生产 URL 时改脚本 host）
4. 链 [`10`](10-agent-写API验收.md) / [`11`](11-终端edit手测清单.md) / [`12`](12-站点身份手测.md)
5. **开门验收**（docs/19 §4.9）：陌生浏览器 + 手机真机走完「进站 → `help` → `open thoughts/digital-archive-entry` → 读完 → 听见（若有本地曲库）」
6. 部署前本地：`node scripts/check-deploy-readiness.mjs`（env 需在部署机 export）
7. Agent 写回实验：`ARCHIVE_WRITE_TOKEN=… node scripts/agent-write-thought.mjs`（站外 PUT；见 docs/19 §4.8）

## Token / 口令轮换

- 写 token：再跑 `token:generate`，旧哈希可从 `ARCHIVE_WRITE_TOKENS` JSON 删掉
- 口令：再跑 `owner:password`，重启进程；已发 session 至多 7 天过期，或改 `ARCHIVE_SESSION_SECRET` 立刻作废全部 cookie
