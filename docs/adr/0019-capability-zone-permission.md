# ADR 0019: 能力格权限 + `content/private/` zone

- **Status**: Accepted
- **Date**: 2026-08-20
- **Related**: [0018](0018-content-visibility-and-sync.md)（离仓 / publish 政策；本 ADR supersede 其 §2 档位表与 §6 Agent 读候选）；[0010](0010-site-principal.md)（visitor|owner 会话）；[0007](0007-security-deployment-posture.md)（写面分轨）；契约 [`08`](../08-发现层对象模型.md)；底稿消化 [`21`](../21-内容操作面一览.md)

## Context

- 0018 将正文离公开 Git，并设想 public/private 与读侧过滤，但未定运行时模型。
- 三维矩阵 `Principal × Visibility × Action` 适合审计，不适合驱动代码。
- 需要：路径派生可达性、Action 只分 read/write、Agent 与网页同构、不可达对象对访问者「不存在」。

## Decision

### 正式原则

> **Visibility / zone 只决定对象是否可达；Action capability 决定对可达对象能执行什么。不可达对象在当前 Principal 的视角中不存在（404 / 省略，永不 403「知道存在但拒绝」）。**

### 能力格

```text
public < member < owner
WRITE ⊃ READ
```

| Actor | Grant |
|-------|-------|
| visitor / anonymous-agent | `{ level: public, write: false }` |
| member | `{ level: member, write: false }`（**语义已锁定**；登录入口另 ADR） |
| owner / owner-agent | `{ level: owner, write: true }` |

Agent 不是第四套权限体系，只是同一 Grant 的机器载体。

### Zone（路径派生，非 frontmatter）

```text
content/
├── projects|thoughts|resources/   → zone public
└── private/
    └── projects|thoughts|resources/  → zone private（最低可达 = member）
```

- localKey：`thoughts/foo` 或 `private/thoughts/foo`
- `DocumentRef.zone` 仅由路径解析得到，禁止与 localKey 双重真相
- `person.json` / `timeline.md`：**旁路**，天生 public，不进 zone ACL

### Action

- read：discover / open / read_body / search / find / list_dir / tree；旁路 read_person / read_timeline
- write：create / replace / patch / delete_doc / mkdir / rmdir

判定：`grant.level >= zoneMinLevel(zone) && (read || grant.write)`。

### HTTP / 快照

- `permission.ts`：无 HTTP
- `resolveApiGrant(request)`：有效 Bearer → owner-agent（**读全开**；token scope **只约束写**）；否则 cookie / local-dev / visitor
- `getArchiveSnapshotFor(grant)` 裁剪；不可达文档与 `/private` 不进入投影
- 非 visitor 读响应：`Vary: Authorization, Cookie` + `Cache-Control: private, no-store`（无 `ACAO: *`）

### Publish 不变量

```text
∀ path ∈ publishedFiles: path ∉ content/private/**
```

白名单：`person.json` / `timeline.md` / `projects|thoughts|resources/**`。可测函数：`selectPublishPaths`。

## Consequences

- 新鲜 clone / CI：fixture；本机可建 `content/private/`
- visitor 网页与公开 GET 不见私文；owner / Bearer 读见全部
- member 登录未实现，但裁剪逻辑已支持
- 改可见性 = 跨 zone 移动（本刀无终端 `mv`）

## Rejected

- frontmatter `visibility` 作安全权威
- 平级 `content-private/` 根（类别与 zone 混命名空间）
- Bearer scope 同时收窄读
- 不可达返回 403
- `member/` 第三盘区路径（无产品故事前不做）

## 与 0018

- **保留**：正文离公开 Git、策展 yaml 仍跟踪、备份以本机为准、服务器私文原则
- **取代**：§2 两档产品表作为读侧权威；§6 Agent 读候选 → 采用「写 token = owner-agent 读全开」
