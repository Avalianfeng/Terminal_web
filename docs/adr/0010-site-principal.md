# ADR 0010: 站点主语 SitePrincipal（visitor / owner）

- **Status**: Accepted
- **Date**: 2026-08-15
- **Code**: `lib/archive/site-principal.ts`；`owner-session.ts`；`owner-password.ts`；`app/api/auth/*`；`lib/music/bff-gate.ts`；`lib/archive/actions.ts`；`command-registry.ts`
- **Contract**: [`0007`](0007-security-deployment-posture.md)（公网写面）；[`0005`](0005-unified-write-entry.md)（Actions 无 Bearer）；[`0009`](0009-music-layer-netease-bff.md)（BFF 第二闸仍是网易 Cookie）；HTTP Agent 写仍 [`08`](../08-发现层对象模型.md) §5.7 Bearer

## Context

站点曾用 **部署姿态**（`NODE_ENV` / local-dev）代理「是不是主人」：本机 `edit` 无鉴权、音乐 BFF 仅非 production。公网没有网页主语，无法区分访客与主人。发现层 `DocumentRef` 是**文档**身份，不是浏览器会话。Agent 写 token 也不该贴进页面。

需要单一 **SitePrincipal**，同时闸住：公网 `edit` / Server Actions、音乐 BFF（流式 / import / sync / 网易 Cookie 写入）。

## Decision

### 1. 角色

网页只有 **`visitor` | `owner`**。无注册、无第三人账号。

Agent 写 API 继续 **Bearer + scope**，不进入 session，也不在浏览器里粘贴写 token。

### 2. 解析顺序

1. 有效 `archive_owner` session cookie → `owner`（`via: "session"`）
2. 否则若 `NODE_ENV !== "production"`（local-dev）→ `owner`（`via: "implicit-local-dev"`）
3. 否则 → `visitor`（`via: "none"`）

派生：

- `uiWrite`：owner，且未设事故闸 `ARCHIVE_UI_WRITE=false`
- `musicBff`：owner（替换 `isMusicBffEnabled()` 的 `NODE_ENV` 判断）

网易 `MUSIC_U`（`.netease-cookie`）仍是 BFF **第二闸**。站点 login ≠ 网易 login。Cookie 不下发浏览器。

### 3. 凭证

- 口令：`scrypt` 哈希存 `ARCHIVE_OWNER_PASSWORD_HASH`（`npm run owner:password`）。编码为 `scrypt:N:r:p:salt:key`，**不用 `$`**，以免 Next 加载 `.env` 时把 `$16384` 当变量展开
- 会话：HMAC-SHA256 签 `v1.payload.sig`，密钥 `ARCHIVE_SESSION_SECRET`
- Cookie：`archive_owner`；httpOnly；`SameSite=Lax`；`Path=/`；TTL 7 天；仅 production 设 `Secure`
- 生产未配口令或 secret：login 失败 → 全站 visitor（安全默认）
- local-dev 无 secret 时可用内置开发密钥（因已是 implicit owner）
- 登录限流：进程内按 IP（约 5 次 / 15 分钟）

终端：`login` 无参进入掩码提示，**禁止** `login <口令>`（会进 commandHistory）。`login` / `logout` 注册但 **help 与 Tab 不列出**（`CommandSpec.secret`）。

### 4. UI 写

Server Actions **仍无 Bearer**（0005），但必须 `requireOwner`（含 `uiWrite`）。访客直调 Action 硬拒。`edit` 对 visitor 不进 help/Tab；手打则提示需要主人会话，**不在 help 里教 `login`**。

### 5. 音乐 BFF

`/api/music/*` 中原先 `isMusicBffEnabled()` 的路由改为 `requireOwnerPrincipal`。yaml 歌单经 SSR 仍可给访客看元数据。公网访客点播网易流仍 403，直到日后本地 mp3 轨（ADR 0011）。

## Consequences

- 公网主人可 `edit`、可开 BFF（部署机须有 `.netease-cookie`）。
- local-dev 行为与 0005 一致：不必 login。
- 发现层 `capabilities.write: true` 仍只声明 Agent HTTP 写，不是浏览器 session。

## Rejected

- 独立 `/login` 页、OAuth、Passkey、多账号
- 把 `ARCHIVE_WRITE_TOKEN` 贴进浏览器当登录
- 用 session 替代 Agent Bearer
- 把网易 Cookie 下发浏览器
- 仅靠「help 不写 edit」而不硬拒 Actions

## 与既有 ADR

- **0005**：Actions 无 Bearer **仍然成立**；公网靠本 ADR 的 owner 会话，而非给 Actions 加 Bearer。
- **0007**：公网 UI 写不再「必须关死」；改为 owner session。`ARCHIVE_UI_WRITE=false` 降为可选事故闸。href 白名单与写 CORS 仍属 0007 落地项。
- **0009**：BFF 第一闸从 `NODE_ENV` 改为 owner principal。
- **0002**：`secret` / `requiresOwner` 为 CommandSpec 字段。
