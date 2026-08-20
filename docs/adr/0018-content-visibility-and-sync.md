# ADR 0018: 档案正文离公开 Git + 可见性 / 同步模型

- **Status**: Accepted（政策与仓布局）；读侧可见性过滤见 **[0019](0019-capability-zone-permission.md)**（本 ADR §2 / §6 读侧设想由 0019 supersede）
- **Date**: 2026-08-20
- **Related**: [0007](0007-security-deployment-posture.md)（写面分轨）；[0010](0010-site-principal.md)（visitor|owner）；[0014](0014-playlist-curation-vs-sync.md)（策展仍进 Git）；[0011](0011-music-local-cache-public.md)（`data/music/` 已离仓范式）；[0019](0019-capability-zone-permission.md)（能力格 + zone）；契约读面 [`08`](../08-发现层对象模型.md)；部署 [`13`](../13-cylf.me-部署.md) / [`20`](../20-部署前自评清单.md)

## Context

- 公开 GitHub 仓与「档案正文可能含隐私」冲突：正文进公开 remote = 全文公开；整仓改 private 又与**代码开放**目标矛盾。
- 音乐层已示范「大体量 / 敏感面离 Git、部署自建同步」（0011 / 0014）。正文应推广同一心智，而不是继续用 `git pull` 当内容发版通道。
- 写面已有 visitor|owner（网页）与 Bearer+scope（Agent）；**读面**尚无可见性过滤——盘上有的文档，访客与公开读 API 都能见。
- 主人默认在本机编辑；公网实例允许**永不回同步本机**的服务器侧内容——需要原则，路径细节后置。

## Decision

### 1. 公开 Git 里留什么

| 进公开 Git | 不进公开 Git（本机盘保留，gitignore） |
|------------|--------------------------------------|
| 代码、`docs/`、ADR、工程配置 | `content/**/*.md` |
| `content/music/playlists/*.yaml`（策展 slim，0014） | `content/person.json` |
| `content/music/playlists/_schema.example.yaml` | `content/timeline.md` |
| 测试 fixture（tmp，不依赖真实正文） | 将来的 private 区全文 |

**不变量**：运行时仍读仓根（或挂载）下的 `content/`；DocumentRef / VFS / `content-write.ts` **身份模型不变**。变的是**版本控制与发布通道**，不是档案身份。

### 2. 可见性两档（现行产品意图）

| 档 | 含义 | 同步 | 网页读（现行） |
|----|------|------|----------------|
| **public** | 可无负担地上公网 | 自建发布进 VPS `content/` | 任何人可访问 |
| **private** | 本机管理；**默认不上传** | 不与 public 混推 | 不上盘则访客不可见 |

- **区分手段**：用**高于 frontmatter 的结构元素**（目录区 / 挂载根 / 发布清单等），**不用** `visibility:` frontmatter 当权威。具体盘布局另刀落地；本 ADR 只锁「非 frontmatter」。
- **两处隐私视为同一语义（现行拍板）**：本机 private ↔ 同步策略上的「完全隐私」；不做「本机私有但可上传、与服务器私有不同步」两套对立模型。服务器上可另有**永不回同步本机**的私文——原则见 §4，路径后置。

### 3. 同步与备份

1. **public 上线**：自建同步（rsync / 脚本 / 等价），**不**经 Git 跟踪正文、**不**以 GitHub 为正文中转。
2. **private**：可与 public 共用本机管理工具（同一套目录纪律与脚本入口），但发布路径**不得**混入 public 推送集；禁止「SSH 上服务器再手粘」作为默认工作流——本机侧应能完成管理。
3. **备份**：本机与服务器内容高度同步时，**以本机备份为准**（服务器容量有限）。服务器不做第二套完整内容备份义务。
4. **代码发版**仍可 `git pull` / CI；与正文发布**分轨**。

### 4. 服务器侧私文（原则 · 路径未定）

- 允许 VPS 上存在**永不强制回同步本机**的内容（例如仅在服务器上 `edit` / Agent 写的草稿）。
- 此类内容在网页上须 **owner 可读**（访客不可见）——依赖将来的读侧闸；**当前未实现**。
- 与本机 private **语义对齐**（都是非 public）；物理是否同树、如何防误 publish，落地刀再定。
- **禁止**把服务器私文推进公开 Git。

### 5. 网页主语扩展（Planned · 暂不开启）

现行：[0010](0010-site-principal.md) 仅 `visitor` | `owner`。

设想第三档（**不实现**，仅存档）：

| 角色 | 读 public | 读 private / 服务器私文 | 写 |
|------|-----------|-------------------------|----|
| visitor | ✓ | ✗ | ✗ |
| **member**（有权限用户） | ✓ | ✓（约束集） | ✗（默认） |
| owner | ✓ | ✓ | ✓（另受 UI 写闸） |

- member ≈ 「可读非公开信息、默认不可写」。
- 登录、邀请、会话形态、与 owner 口令的关系：**未设计**；开启前须新 ADR。

### 6. Agent 权限（倾向写入 · 未实现）

**倾向**：Agent 读路径与网页可见性**同构**——非公开正文不对「仅有公开读能力」的调用方暴露。

候选形状（择一或组合，落地前再拍板）：

| 候选 | 做法 | 备注 |
|------|------|------|
| **A. 双哈希** | 两套 Bearer：例如 `write+read-all` 与 `read-public-only`（或 `read-private`） | 与「两份权限不同的 hash」同向 |
| **B. 抬升现写 token + 新读 token** | 现有写 token 视为主人授意 → 可读可写（含非 public）；另建 **只读、范围约束** 的 token，给「别人的 Agent」或受限集成 | 与网页 member 同构 |
| **C. 暂简化** | 凡持有效写 token 即主人侧 → 全读；公开读 API 仍只见 public 盘上子集 | 实现成本最低；member/外站 Agent 出现前可接受 |

**现行代码**：Bearer 只管写；公开 GET 无可见性过滤。§5 / §6 开启前，**物理隔离**（private 不上 VPS）是唯一可靠隐私手段。

### 7. 本刀已做 / 明确不做

**已做（随本 ADR）**

- 政策：正文离公开 Git；策展 yaml + schema 仍跟踪。
- `.gitignore` + `git rm --cached` 解除正文跟踪（盘上文件保留）。
- 文档链入；`content` 相关测试不依赖公开仓内正文。

**明确不做（本 ADR）**

- 读侧 snapshot / discovery / API 按可见性过滤
- member 会话、邀请流
- Agent 第二类只读 token
- publish 脚本定稿与盘区最终命名
- 改写 Git 历史抹掉曾公开过的正文（若曾 push 敏感文，另做历史清理；非本刀）

## Consequences

- 新鲜 clone **无** `person.json` / 正文 → 本机开发依赖主人自有 `content/` 或 publish 回来的副本；CI 用 fixture。
- 部署清单：正文走 publish/rsync，与 `data/music/` 并列；不再写「content 靠 git pull 发版」为默认。
- 公开仓可继续 public；隐私靠离仓 + 不上传，不靠整仓 private。
- 0014 策展 yaml 仍版本化——「哪些歌单公开」的意图可审；曲目仍在 `data/`。

## Rejected

- 整仓改 GitHub private 以保护正文
- 正文继续进公开 remote + 靠「访客不知道路径」保密
- 用 frontmatter `visibility` 作为可见性权威
- 本机 private 与服务器私文做成两套对立、互不同步的产品语义（现行视为同一「非 public」）
- 默认以 SSH 登服务器手改作为 private/public 管理工作流
- 服务器承担与本机对等的完整内容备份义务

## 与既有 ADR

- **0007 / 0010**：写闸不变；本 ADR 扩展的是**读面与发布面**设想。
- **0014**：策展仍进 Git，与「正文离仓」兼容；不把 playlist slim 再迁出。
- **0011**：`data/music/` 范式不变；public 正文同步可类比其 rsync 纪律。
