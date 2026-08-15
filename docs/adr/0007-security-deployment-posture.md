# ADR 0007: 安全与部署姿态（写面分轨）

- **Status**: Accepted
- **Date**: 2026-08-12
- **Revised**: 2026-08-15（公网 UI 写改认 [0010](0010-site-principal.md) owner session；`ARCHIVE_UI_WRITE` 降为事故闸）
- **Supersedes**: 无（**收窄** [0005](0005-unified-write-entry.md) 第 3 条「Actions 无 Bearer」的适用语境，见下文 §与 0005 的关系）
- **Code**（落地时）：`lib/archive/actions.ts`；`lib/archive/command-registry.ts`；`lib/archive/markdown-prose.tsx`；`lib/archive/api-http.ts`；部署 env / runbook（见 [`09`](../09-v1.x-后续工作.md) §3.4）
- **Contract**: [`06`](../06-v1.0-路线纲要.md) §3.2 / AI 入口原则；[`08`](../08-发现层对象模型.md) §5.7 / §5.8；清单 [`09`](../09-v1.x-后续工作.md) §3.4

## Context

- 2026-08-12 安全审计（HEAD `531a6fc`）：HTTP Bearer 写路径设计较稳；**公网部署**下终端 `edit` / Server Actions 无鉴权可写删，与 [`06`](../06-v1.0-路线纲要.md)「访客只读；写必须鉴权」及 [`09`](../09-v1.x-后续工作.md) §4「禁止无鉴权可写」冲突。
- [0005](0005-unified-write-entry.md) 当时选定 Actions **无 Bearer**，语义为**本机主人开发面**；产品尚未公网上线，当前仅本地 `dev`。
- 需要一条**不随功能堆叠而漂移**的规则：新功能加写能力时走哪条轨、何时必须加固，避免「HTTP 已鉴权、UI 又开旁路」再现。

## Decision（原则 — 加功能前必读）

### 1. 部署姿态（Posture）

| 姿态 | 含义 | 访客 | 人写（`edit` / Actions） | Agent 写（HTTP） |
|------|------|------|---------------------------|------------------|
| **local-dev** | 本机 `npm run dev`、未对公网暴露 | 通常无真实访客 | **允许**无 Bearer（0005 原意） | Bearer + scope（与生产相同） |
| **public-production** | cylf.me 或任意公网实例 | 未登录只读 | **禁止**无鉴权写；须 [0010](0010-site-principal.md) owner session（或事故闸关死） | Bearer + scope（必须） |

**不变量**：无论姿态，**盘路径只经 `content-write.ts` 拼接**；身份只经 **DocumentRef**（[0001](0001-document-ref.md)）。

### 2. 写面双轨（不变）

1. **HTTP**（`PUT` / `PATCH` / `DELETE /api/v1/items`）：**始终** Bearer + scope + 可选 `If-Match`；所有姿态一致。  
2. **UI**（终端 `edit` → Server Actions → 同一写内核）：**local-dev 默认可用**（implicit owner，[0010](0010-site-principal.md)）；public-production **必须** owner session（或 `ARCHIVE_UI_WRITE=false` 事故关死），不得依赖「访客不知道命令」。

### 3. 新功能纪律（防矛盾）

加任何**改盘 / 改索引可见性**的能力前，自问并满足：

| # | 纪律 | 违反示例 |
|---|------|----------|
| A | 写操作只调用 `content-write.ts` 四操作，参数含 `DocumentRef` | 新 Server Action 直接 `fs.writeFile` |
| B | 不新增**绕过 HTTP 鉴权**的公网写入口 | 新「快捷保存」Action 无闸门 |
| C | 新终端写命令与 `edit` **共用同一 UI 写闸门**（`command-registry` 条件注册 + Actions 硬拒） | 只藏 `help` 仍可调 Action |
| D | 公网只读内容若含用户可控 HTML/Markdown，遵守 **href 协议白名单**（§4） | 任意 `javascript:` 链接触发 |
| E | 结构取舍变更是 **新开 ADR**，不悄悄改 0005/0007 语义 | 在聊天里说「暂时无鉴权方便」 |

### 4. 内容呈现（Markdown）

- **local-dev**：可维持现状，便于编辑预览。  
- **public-production 上线闸门**：`markdown-prose` 的 `href` 仅允许 `http:`、`https:`、`mailto:` 与站内相对路径；拒绝 `javascript:`、`data:`、协议相对 `//…` 等。  
- 本刀**不**引入完整 HTML sanitizer；若未来要嵌 raw HTML，须另开 ADR。

### 5. CORS（`api-http`）

- **读 API**：`Access-Control-Allow-Origin: *` 可接受（公开读产品设计）。  
- **写 API**：public-production **收紧**——读写分策略或白名单 Origin；Bearer 不在 Cookie，CORS 不能替代鉴权，但应减少「持 token 的浏览器任意源代发」面。  
- **local-dev**：可保持宽松，不挡开发。

### 6. 发现层 `capabilities.write: true`

- **有意暴露**写能力给 Agent；不是漏洞。公网仍靠 Bearer，不靠隐藏 capability 位。

### 7. Session 化 UI 写（[`0010`](0010-site-principal.md)）

- 单主人口令 + httpOnly cookie 已落地（visitor / owner）。**不**替代 HTTP Bearer；不引入多人 RBAC / 审计（仍见 [`09`](../09-v1.x-后续工作.md) §3.3）。  
- 可选事故闸：`ARCHIVE_UI_WRITE=false` 时即使 owner 也关 UI 写。

## 路线图（当前仅 local-dev）

### 现在立刻可做（简单 · 不挡功能开发）

> 以**文档与原则**为主；代码保持 local-dev 可用 `edit`。

| 项 | 动作 | 状态 |
|----|------|------|
| P0 | 本 ADR（0007）落盘 | 本文件 |
| P0 | [`adr/README`](README.md)、[`00`](../00-文档入口.md)、[`06`](../06-v1.0-路线纲要.md)、[`09`](../09-v1.x-后续工作.md) 链入 | 随本 ADR 提交 |
| P0 | [0005](0005-unified-write-entry.md) 增加「适用语境」交叉引用 | 随本 ADR 提交 |
| P1 | [`CONTEXT.md`](../../CONTEXT.md) 增加 `DeploymentPosture` / `UiWriteGate` 词条 | 随本 ADR 提交 |
| 可选 | 新功能 PR 自检：是否触犯 §3 纪律 A–E | 流程习惯，无代码 |

**刻意不在此刻做**：公网 env 闸门实现、CORS 收紧、href 白名单——无公网部署时不改行为，避免本地 `edit` 回归成本。

### 首次公网部署前（上线闸门 · 统一收口）

> 合成一次「部署姿态落地」PR 即可；不必等功能齐全。顺序建议：

1. **UI 写闸门** = [0010](0010-site-principal.md) owner principal（local-dev implicit；公网须 session）  
   - `command-registry`：visitor 的 help/Tab 不列 `edit`。  
   - `actions.ts`：`getDocumentRaw` / `putDocumentRaw` / `removeDocument` 入口硬拒 visitor。  
   - 可选 `ARCHIVE_UI_WRITE=false` 事故关死。  
   - [`11`](../11-终端edit手测清单.md) / [`12`](../12-站点身份手测.md)。
2. **Markdown `href` 协议白名单**（`markdown-prose.tsx`）。
3. **写 API CORS** 收紧（`api-http.ts`）。
4. **cylf.me 短 runbook**（[`09`](../09-v1.x-后续工作.md) §3.2）：env 清单、token 轮换、`ARCHIVE_UI_WRITE=false`、冒烟口令链到 [`10`](../10-agent-写API验收.md)。

**过关信号**：公网实例上访客终端无 `edit`；直接 POST Server Action 失败；owner `login` 后可 edit；`smoke:write-api` 仍全绿；手测 `open`/`cat` 只读正常。

### 上线后 / 有刚需再做（[`09`](../09-v1.x-后续工作.md) §3.3）

- 多人协作、细粒度 scope、审计日志、session 化 UI 写、webhook 等。  
- **不**用「等大版本安全专项」拖延 §上线闸门三项。

## Consequences

- local-dev 继续享受无 Bearer 的 `edit`（与 0005 开发体验一致）。  
- 公网威胁模型与 [`06`](../06-v1.0-路线纲要.md) / [`09`](../09-v1.x-后续工作.md) §4 对齐，不靠事后 runbook 口头约束。  
- 新功能有明确检查表（§3），减少「又开一个无鉴权写口」。

## Rejected

- **现在**就把 local-dev 的 `edit` 关掉或给 Actions 上 Bearer（无必要；0010 已用 principal）。  
- 删掉 `edit` / Actions 代码，只留 HTTP（损失本机主人面，与 0005 目标冲突）。  
- 把安全原则只写在 [`09`](../09-v1.x-后续工作.md) 或审计聊天记录里，而不进 ADR（无法约束结构变更）。  
- public-production 仅靠「不在 help 里写 `edit`」、Actions 不校验（可被直接调用）。

## 与 0005 的关系

- 0005 的 Decision 第 3 条 **仍然成立**，但**仅适用于 local-dev 姿态**。  
- 0005 Rejected「Actions 模仿 HTTP 引入 Bearer」在 **public-production** 下由 **关 UI 写** 满足「禁止无鉴权可写」，**不要求**本刀给 Actions 加 Bearer。  
- 若未来 public-production 要换鉴权方式（OAuth / Passkey），须 **新开 ADR**（`Supersedes: 0010`），不得悄悄恢复无鉴权 Actions。
