# ADR 0021: 档案权威在服务器 + 本机只上传

- **Status**: Accepted（政策）；运维控制台与 `selectPublishPaths` **尚未**按本文改行为
- **Date**: 2026-08-30
- **Supersedes**: [0018](0018-content-visibility-and-sync.md) Decision §2 同步列、§3、§4、§7 运维句；[0019](0019-capability-zone-permission.md)「Publish 不变量」（`published` 永不含 `private/**`）
- **Related**: [0010](0010-site-principal.md) / [0022](0022-owner-credential-tiers.md)（网页凭证分层）；[0011](0011-music-local-cache-public.md) / [0014](0014-playlist-curation-vs-sync.md)（曲库）；部署 [`13`](../13-cylf.me-部署.md) / [`22`](../22-上线后方向.md) §4
- **Does not change**: 正文仍不进公开 Git（0018 §1）；zone 路径与读侧裁剪内核（0019 能力格）；策展 slim yaml 仍跟踪（0014）

## Context

- 0018 以**本机**为编辑真相，private **默认不上 VPS**；拉回是例外；备份以本机工作区为准。
- 上线后实际用法是多入口写（本机盘、生产 `login`+`edit`、Agent Bearer），访客看到的是 **VPS 盘**。本机当镜像会与 `rsync --delete`、清空工作区冲突，且 private 不上盘则设备间无法用同一套读闸看私文。
- 网页隐私靠 [0019](0019-capability-zone-permission.md) 裁剪，不靠「文件不在服务器」。VPS/SSH/主机商可见盘，与常见自建站点相同，已接受。

## Decision

### 1. 权威

| 层 | 权威 | 本机 |
|----|------|------|
| **代码** | Git | 工作副本 |
| **档案正文**（含 `person.json` / `timeline.md` / `content/private/`） | **生产机 `content/`** | 编辑器之一：写完 **上传所列文件**；不是完整镜像 |

- **不**把本机工作区当库，也 **不**做「拉取远程全部再对齐本地」。
- **删除、改名、覆盖已有篇**：在服务器上做（网页/Agent/将来的设备凭证），不用空本机去「同步删除」。
- 禁止默认 SSH 上手粘正文；入口仍是本机控制台或已鉴权写面。

### 2. private 与 Git

- `content/private/` **映射到服务器同一路径**，与 public 同一棵 `content/` 树。
- **禁止**把正文（含 private）推进公开 Git。隐私对访客 = 0019 读闸；对托管环境 = 信任 VPS。
- 仓内核目标白名单（落地后）：`person.json` / `timeline.md` / `projects|thoughts|resources/**` / **`private/` 下同组 `/**`**。仍排除 `content/music/playlists`（跟代码走）与 `..` 逃逸。
- **现行代码** `selectPublishPaths` 与 `D:\VPS\my_web` 控制台仍 **排除 private** 且推送带 `rsync --delete`。在控制台改为「只上传、不以残树删除远程」之前，**禁止**按新习惯清空本机再推，也 **禁止**把 private 塞进现有 `--delete` 镜像。

### 3. 备份

- 工作区可空；**备份不是**本机 `content/` 碰巧还在。
- 允许从服务器打包装到本机/云盘。密文可以，但解密密钥须 **主人另持一份**（密码管理器 / age 等）。否决「只有服务器能解」——否则 VPS 与密钥同毁则备份无用。
- 不要求 VPS 做与工作区对等的「第二套产品化备份」；主人有离线包即可。

### 4. 曲库（与正文分轨）

- **本机不改曲库、改了也不上传。** 歌单曲目落盘、`music download` / sync 在 **远程** 由主人会话做。
- 取消「从 Windows 推送 `data/music/`」作为默认工作流（控制台菜单应去掉或标废弃）。
- 0014 **不变**：策展 slim yaml 仍可随代码 Git 发版。不把策展也改成「只在 VPS、离开 Git」（0014 Rejected A 仍成立，除非另开 ADR）。
- 本机 `npm run dev` 可以没有曲库。

## Consequences

- 新鲜 clone 仍无正文；本地开发要么上传前自备草稿，要么接受空档案（不以拉全量为日常）。
- 控制台落地刀：状态应对账远程（含 private）；推送 = 上传本机现有文件、**无**残树 `--delete`；删除只通过服务器写面；备份从远程打包。
- 评论文档里「档案以本机为真相」作废；UGC 仍独立存储（[`22`](../22-上线后方向.md) §1）。

## Rejected

- 本机为编辑真相 + 拉回例外（0018 旧 §3）
- private 默认不上 VPS 当作唯一隐私手段
- 用本机子集 `rsync --delete` 冒充全量镜像
- 日常「拉远程全部到本机」
- 备份密钥只存在服务器上
- 曲库与正文同一条本机推送链

## 与既有 ADR

- **0018 §1**：离仓政策保留。
- **0019**：zone / 裁剪 / member 语义保留；Publish 不变量按本文改目标，代码未跟上前以控制台旧行为为准。
- **0011**：访客仍只播 **服务器上** 已落盘媒体；来源改为远程自管，不是本机 rsync。
