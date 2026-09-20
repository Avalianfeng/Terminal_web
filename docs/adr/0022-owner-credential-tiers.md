# ADR 0022: 主人凭证分层（口令网页 vs 设备 / Agent）

- **Status**: Accepted（运行时已落地：`owner-password` Grant、新建配额、WebAuthn `device` 步进）
- **Date**: 2026-08-30
- **Supersedes**（目标模型）：0010「公网口令 session ⇒ 完整 `uiWrite` + 读 private」；0010 Rejected 中的 **Passkey**（仅就「主人第二步设备绑定」重新打开，仍无 OAuth / 公开注册 / 多账号）
- **Related**: [0019](0019-capability-zone-permission.md)（zone；落地时须把口令会话从「owner 读全开」拆开）；[0007](0007-security-deployment-posture.md)（href）；[0021](0021-server-content-authority.md)；写 token [`08`](../08-发现层对象模型.md) §5.7
- **Does not change this knife**: Agent Bearer 行为（无过期、可读 private、scope 只管写）

## Context

- 生产 `login` 是可在线尝试的口令（scrypt + 进程内 IP 限流约 5 次 / 15 分钟），与 32 字节 Agent token 不在同一「可猜」档。
- 多入口若都给「读光 private + 改旧文」，口令成为明显短板。分层保护的是 **爆开口令之后的机密与完整性**，不是减慢爆破本身（爆破靠限流、口令熵、反代真实 IP）。
- 「只能新建不能改」不降低爆破速度；须配合 **口令会话不能读 private**。

## Decision

### 1. 目标能力（生产网页）

| 凭证 | 读 public | 读 private | 新建 public / private | 改 / 删已有 |
|------|-----------|------------|------------------------|-------------|
| 未登录 visitor | ✓ | ✗（当不存在） | ✗ | ✗ |
| **仅口令 session** | ✓ | **✗** | ✓ | **✗** |
| **设备凭证**（主人第二步） | ✓ | ✓ | ✓ | ✓ |
| **Agent Bearer**（不进浏览器） | ✓ | ✓ | 按写 scope | 按写 scope |

- 口令可 **新建** private（投进保险箱），但同一会话 **不能读** private；打开/改要设备凭证或 Agent。
- 设备凭证：优先 **绑设备**（WebAuthn / 安全密钥一类），不要再发一个可复制的「第二文件 token」当网页登录。将来薄客户端可把高权限凭证放在系统钥匙串。
- local-dev implicit owner：**仍全权**（本机不对外）。

### 2. 低权限写的资源闸（随运行时落地，可与 0010 同刀或紧随）

- 口令会话：例如 **5 分钟最多新建 10 篇**（只约束该档，不套在 Agent `*` 上，以免偷偷降全权）。
- **所有写入口**同一正文体积上限（HTTP 已有约 1MB；UI `edit` 应对齐）。
- 呈现层链接：生产走 [0007](0007-security-deployment-posture.md) `href` 协议白名单（含图片 URL 同一规则）。不另做完整 HTML sanitizer。

### 3. 现行 login 限流（记录缺口，加固可另刀）

- 已有：失败计数在 **进程内存**、按 IP、窗口 15 分钟 5 次。
- 缺口：重启清零、多进程各算各的、依赖反代钉死客户端 IP。加固（持久化/共享计数、CDN）**不**用凭证分层代替。

### 4. Agent 写 token（本 ADR 不升级实现）

- **现在**：可继续全权 `*`；保管 = 不进 Git、在 VPS env、可轮换。
- **后续方向**（有需要再开刀）：过期时间 + 轮换记录。不在本刀改 `token.ts`。

### 5. 0019 落地含义

「口令 session」走 `grantFor("owner-password")`（读不到 private；write 仅 create，含 private 投箱）。Bearer 与 WebAuthn step-up / local-dev 仍为 owner 级。终端秘密命令 `device` 登记或提升本机密钥。

## Consequences

- 手测 / `docs/12`：口令登录后不能 `open` private、不能覆盖已有篇；设备步或 Bearer 可以。
- member 邀请仍另 ADR；本分层只约束 **主人** 两档，不加第三人账号。

## Rejected

- 口令 session 能读 private（机密仍绑在可爆破口令上）
- 用「只能新建不能改」当作防爆破主手段
- 把 Agent Bearer 贴进浏览器当设备凭证
- 为配额单独开平行权限体系（它是低权限会话的资源闸）
- 本刀强制给 Agent 加过期（已记后续）

## 与既有 ADR

- **0010**：visitor / owner 主语、Cookie 形态、不把写 token 贴进页面——仍成立。变的是 **口令 owner 的 Grant 子集**。
- **0019**：公理「不可达 = 不存在」不变；口令会话对 private 即不可达。
- **0007** 纪律 A–E 仍约束新写入口。
