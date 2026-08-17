# ADR 0013: DocumentRef 多段路径（方案 A）

- **Status**: Accepted
- **Date**: 2026-08-17
- **Commit**: `c304c29`–`81137a9`（设计锁定 + 身份层 + 读路径 + VFS + 写路径/mkdir-rmdir）
- **Code**: `lib/archive/document-ref.ts`、`content-format.ts`、`content.ts`、`content-write.ts`、`vfs.ts`、`commands.ts`、`complete.ts`、`actions.ts`
- **Glossary**: `CONTEXT.md` → DocumentRef / localKey / ContentGroup
- **Related**: [0001](0001-document-ref.md)（本 ADR 加宽其 slug 语义；0001 其余决策不变）；[0010](0010-site-principal.md)（mkdir/rmdir 的 owner 闸）
- **设想**: `docs/16` §3（方案 A 已拍板 2026-08-17）

## Context

`docs/16` §3.1：项目、思想是延伸性的，却被 `0001` 的 `slug: [a-z0-9_-]+`（单段）压成单文件 stub。盘上 `content/projects/my_web/notes.md` 这种文件夹结构在 Git 上完全自然，但权威身份、VFS、写 API 都不认它——写内核当它不存在，Agent 得到 `bad_request`。

三选一已拍板（`docs/16` §3.2）：**A 加宽路径**。过渡期 C（扁平 slug + `cluster:` tag）只作权宜，**勿**在发现层认夹之前建"假目录"。

## Decision

1. **slug 加宽为组内多段相对路径**：`DocumentRef` 仍是 `{ group, slug }`；`slug` 现为一段或多段，段间以 `/` 连接，**每段**仍须 `[a-z0-9_-]+`（`projects/my_web/log`）。空段、段内含非法字符 → 构造/解析错误。`toLocalKey` / `toVfsPath` / `refsEqual` 拼接逻辑不变，自然支持多段；`group` 权威不变。

2. **盘布局 = 组内相对路径直接映射**：`content/<group>/<seg1>/…/<leaf>.md`。扁平 `content/<group>/<leaf>.md` 是"slug 恰一段"的特例——**存量 13 篇零迁移**，读/写/VFS/发现层全兼容。中间段是**真目录**；写文档时父目录自动 `mkdir -p`（`saveDocument` / `saveDocumentRaw`）；`deleteDocument` 不级联删目录（目录生命周期归 mkdir/rmdir 命令）。

3. **入口篇 + 文件夹可共存（VFS 双身份节点）**：`content/projects/my_web.md` 与 `content/projects/my_web/log.md` 可同时存在（盘上文件名 `my_web.md` 与目录名 `my_web` 本就不冲突）。VFS 中 `/projects/my_web` 是一个节点，**同时**是文档（入口篇）与目录（子文档）。身份优先级：
   - `ls` / `cd` / `tree` / `find` / Tab 补全 → **目录身份**（带 `/`，可下钻）；
   - `open` / `cat` / `edit` → **文档身份**（打开入口篇）；
   - `open <复合目录>` 批量 = 入口篇 + 直接子文档；`open <纯目录>` 批量 = 直接子文档（现状语义不变）。

4. **mkdir / rmdir 命令（owner-only）**：
   - `mkdir <路径>`：递归建父目录（`-p` 语义）；每段同 slug 白名单校验；已存在 → 成功 no-op（提示即可）；成功点名新建路径。
   - `rmdir <路径>`：只删**空目录**（无子文件、无子目录）；非空 → 报错并点名首个非空原因；删除确认从简（直接删，终端输出结果行）。删除文档仍走 `edit` 面板 / 写 API，`rmdir` 不碰文档文件。
   - 命令经 `CommandSpec` 注册（`requiresOwner: true` → visitor 的 help/Tab 不出现）；handler 内仍硬校验 `uiWrite`（0010 纪律：藏 help 不够）。副作用经 `CommandResult.fs` 通道 → server action（与 `edit` 的 server-action 通道同构）。

5. **发现层无新字段**：`localKey` 由 `toLocalKey` 拼出，多段自动成立；`fromLocalKey` / `fromVfsPath` 接受 ≥2 段。HTTP 写 API 的 scope 前缀语义（`token.ts`：`prefix/*` → `startsWith`）天然覆盖多段（`thoughts/*` 覆盖 `thoughts/foo/bar`）。索引 / 详情 / 过滤不加字段。

6. **安全边界不变**：段白名单防路径穿越；`resolveContentPath` 只接受已验证的 `DocumentRef`；不引入 cwd/磁盘绝对路径进身份模块（0001 纪律）。  
   **2026-08-17 加固（security-review 采纳）**：slug 拒绝 Windows 保留设备名（`con`/`prn`/`aux`/`nul`/`com1-9`/`lpt1-9`，防 `nul.md` 静默丢数据）；读路径递归加深度上限 + 目录 realpath 包含检查（junction 逃逸不发布、不成环）；写路径（写/读/删/建目录/删目录）统一 realpath 包含校验（穿过 junction 的目标拒绝）；盘上非法文件名容错跳过，不打挂整站快照。

## Consequences

- 读路径（`content.ts`）递归扫描三组目录，跳过隐藏项与非 `.md`。
- VFS（`vfs.ts`）目录判断从 `type === "dir"` 改为 **children 存在性**（空目录、复合节点都算目录）；`createVfs` 按 slug 分段建树。
- `complete.ts` / `commands.ts` 的目录判断同步切换；`find` / `open` / `cat` 对嵌套路径生效。
- `actions.ts` 增加 `mkdirDir` / `rmdirDir` server action（owner 闸 + 段校验）。
- 单测扩展：`test:document-ref`（多段构造/投影/解析/拒绝用例）、`test:discovery`（嵌套文档进索引/详情）、新增 `test:vfs`（分段建树、双身份节点、多段解析）、`test:command-registry`（mkdir/rmdir 注册与 owner 门）、`test:complete`（嵌套补全）。
- 手测：`docs/17-嵌套DocumentRef手测.md` 补全为统一验收清单。
- 文档同步：`CONTEXT.md`（DocumentRef / localKey 词条）、`docs/08` §3.3（localKey 定义）、`README.md`（内容结构）、`docs/00` 地图、`docs/09`（勾选落地）。

## Rejected

- **B 集合对象**（frontmatter `members: []`）：关系边比目录更重要时再议（`docs/16` §3.2 已评）。
- **C 簇约定作终态**（扁平 `my_web-notes` + `cluster:` tag）：仅过渡；`ls` 会变长、身份与磁盘不对齐。
- **`slug` 改 `segments: string[]` 数组**：改名成本高（`vfs.ts` / `commands.ts` / 组件 / 测试全改），而字符串 slug 即"组内相对路径"，段校验集中在构造/解析即可；不引入第二权威。
- **每文档一个文件夹（`<slug>/index.md` 布局）**：存量扁平文件需迁移或双布局并存，`mkdir` 语义与文档身份纠缠（建目录还是建文档？），删除/rmdir 复杂化；与"入口篇 + 延伸篇"自然升级路径冲突。
- **禁止 `foo.md` 与 `foo/` 并存**（目录/文档同名互斥）：会切断 C → A 的平滑升级（入口篇不动、延伸篇进文件夹），且盘上本无冲突。
