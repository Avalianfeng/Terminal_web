# 嵌套 DocumentRef 手测（方案 A）

> **角色**：主人统一验收清单。实现过程中由 Agent 补全条目；**真实验证由主人执行**。  
> **对应**：[ADR 0013](adr/0013-document-ref-multi-segment.md)（身份/盘布局/双身份节点/mkdir-rmdir 语义）；`docs/16` §3.2 方案 A。  
> **状态**：实现完成 + 边界收口（2026-08-17 提交 `c304c29`–`f6e6f95`）；**待主人按本清单验收**。终端「不追求完整 shell 行为」的边界裁决见 [`18`](18-终端真实性评估.md) §6（`cd -` / `~` / watch / 文案 sweep 一律不做）。

## 前置

- [ ] 本地 `npm run dev` 可起
- [ ] 本机 owner（local-dev）或已 `login`
- [ ] `npm run test:document-ref && npm run test:vfs && npm run test:discovery && npm run test:command-registry && npm run test:complete` 全绿

## 身份与读写

- [ ] `edit projects/my_web/log`（不存在）→ 进入新建；保存后 `content/projects/my_web/log.md` 出现（父目录自动创建）
- [ ] 多段 `open projects/my_web/log` 打开该文；`open /projects/my_web/log` 同效
- [ ] 编辑已有多段文档：`edit thoughts/foo/bar` → 读原文 → 保存 → hash 更新
- [ ] 删除多段文档：面板删除 → 盘上文件消失、索引消失；父目录**仍在**（rmdir 才删目录）
- [ ] 扁平旧路径仍可用（兼容）：`edit projects/<已有>` / `open <旧 slug>` / HTTP 旧 localKey 全部照旧
- [ ] 合法但未建的多段路径 → 进入新建（父目录递归创建）
- [ ] 非法段被拒：`edit projects/Bad/x`、`projects/a//b`、`projects/a/b/` → `invalidPath` 提示，不写盘

## mkdir / rmdir

- [ ] `mkdir projects/my_web` → 建 `content/projects/my_web/`；**`ls`/`tree` 立即出现 `my_web/`（空目录可见）**；重复执行 → 提示已存在（no-op）
- [ ] `mkdir projects/a/b/c`（父不存在）→ 递归创建
- [ ] `mkdir projects/Bad` → 拒绝（段白名单）
- [ ] **组前缀绝对语义**：`cd /projects` 后 `mkdir projects/foo` 建的是 `/projects/foo`（不是 `/projects/projects/foo`）
- [ ] `rmdir projects/my_web`（空）→ 删除成功，**终端立即消失**
- [ ] `rmdir projects/my_web`（内有 `log.md`）→ 拒绝，点名非空原因
- [ ] visitor 看不到 `mkdir`/`rmdir` 的 help 与 Tab；手打也硬拒（need owner）
- [ ] `cd /projects/my_web` 后 `mkdir notes` 相对路径生效；空目录可 `cd` 进入、`open` 提示空

## VFS / 终端

- [ ] `cd /projects/my_web`、`ls` 显示子文档；`ls /projects` 显示 `my_web/`（目录带 `/`）
- [ ] `tree /projects/my_web` 显示入口篇 + 子文档层级
- [ ] 双身份节点：`content/projects/my_web.md`（入口篇）+ `content/projects/my_web/log.md` 并存时——`open /projects/my_web` 打开入口篇；`ls /projects/my_web` 列出子文档；`cd /projects/my_web` 进入
- [ ] `find my_web` 能命中嵌套路径；`open *` 在当前目录批量打开直接子文档
- [ ] `cat /projects/my_web/log` 终端查看嵌套文档正文
- [ ] Tab 补全：`open projects/my_web/<Tab>`、`cd projects/my_web/<Tab>`、`cat projects/my_web/<Tab>` 正确下钻
- [ ] `search` 命中嵌套文档（正文/标题/tag/slug/localKey）
- [ ] **多级目录链**：`mkdir projects/a/b/c` → `tree` 显示 `a/→b/→c/` 嵌套（不是三个兄弟节点）；`cd /projects/a/b/c` 可进入、`ls` 为空
- [ ] `cd ~` 从任意目录回根；`mkdir ~/projects/foo` 与 `open ~/projects/...` 同效
- [ ] 带 `.md` 尾缀：`open projects/my_web/log.md`、`cat /projects/my_web/log.md`、`edit projects/my_web/log.md` 与不带尾缀同效
- [ ] `tree` 根显示 `/`（不是 `//`）
- [ ] `open` 未保存的嵌套文档（父目录存在、文档未落盘）→ 提示「尚未落盘」
- [ ] **嵌套 cwd 下组前缀 = 绝对语义**：`cd /projects` 后 `open projects/my_web/log`、`cat projects/my_web/log`、`cd projects/my_web`、`ls projects/my_web` 均指向 `/projects/…`（不拼接 cwd）
- [ ] `open` 缺失路径报「路径不存在: …」（与 `cd`/`cat` 同口径），不再报「无法打开」
- [ ] `edit <纯目录>`（无入口篇）→ 打开该目录入口篇的**新建**编辑器；`edit /projects` 仍拒绝
- [ ] 编辑面板打开**新建**文档后直接关闭（不保存）→ 终端输出「未保存，未写入磁盘: <路径>」

## 发现层 HTTP

- [ ] `GET /api/v1/items?source=local&localKey=projects/my_web/log` → 详情含正文 + hash
- [ ] `GET /api/v1/items` 索引含嵌套条目（localKey 多段）
- [ ] `PUT /api/v1/items?source=local&localKey=thoughts/foo/bar`（Bearer + scope `thoughts/*`）→ 201；`If-Match` 冲突 409
- [ ] `PATCH` / `DELETE` 多段 localKey 同效；`DELETE` 后父目录仍在
- [ ] scope 前缀语义：`thoughts/*` 可写 `thoughts/foo/bar`，不可写 `projects/x`
- [ ] 非法多段 localKey → 400（`bad_request`）

## 明确不做（本清单不测）

- 内容同步 push/pull 工具
- 对话公开展示
- 加厚正文 / 系统自构造
- 终端完整 shell 行为：`cd -`、`~` 展开、文件监听（watch）、POSIX 全量错误文案（裁决见 [`18`](18-终端真实性评估.md) §6）
- 目录/文件管理增强：`mv` / `cp` / `rename` / 非空递归删除——改名用「编辑新路径 + 删除旧文档」，删目录树用「先删文档再 rmdir」
