# xterm.js 终端表面评估

> 日期：2026-07-14  
> 结论：**值得采用，但不要现在立刻替换整页输入模型；作为 B 层下一阶段接入。**

---

## 1. 我们要解决什么

当前终端是：

- React 自己画的输出列表 + `<input>` 输入行
- 已有：prompt 随 cwd、Tab 补全、条目短延迟、阅读面板分流

缺的是「真终端表面」：

| 能力 | 现状 | xterm.js |
|------|------|----------|
| scrollback（向上翻历史缓冲） | 普通 div 滚动 | 原生缓冲与选择复制 |
| ANSI / 彩色控制序列 | 自研 tone class | 标准解析 |
| streaming output（流式写入） | 条目 setTimeout 模拟 | `term.write()` 天然适合 |
| 多行 / 进行中任务输出 | 弱 | 强 |
| 未来 AI 连续跑命令 | 需自建 | 表面层已具备 |

运行时仍走 Archive command engine，**不接真 Linux / PTY**。  
xterm 只做 **Surface**；命令解析、VFS、`open`→阅读面板仍是自有 runtime。

---

## 2. 适配性（与设想）

| 设想 | 是否匹配 |
|------|----------|
| 档案站，不是云 IDE | 匹配：可只启用最小 addon |
| 日后脚本化 / AI 批量命令 | 匹配：流式 `write` + 本地 runtime |
| Next.js App Router | 可做：必须 **client-only**（`dynamic(..., { ssr: false })` 或 `useEffect` 内 `import()`） |
| 中文 UI / 阅读面板双层 | 匹配：xterm 只替换终端壳内部，外区与 ReadingPanel 不动 |

包名以现行 scoped 为准：`@xterm/xterm`，常用 `@xterm/addon-fit`（随容器改 cols/rows）。

---

## 3. 成本与风险

**成本**

- 输入模型要从「受控 input」改为「xterm onData → 行缓冲 → Enter 提交」；Tab 补全需接到 xterm 键位，而不是 `input.onKeyDown`。
- 现有 `TerminalEntry` 渲染要改为写入 xterm（或混合：历史用 xterm，阅读面板仍外置）。
- 样式要跟 Dual Phase 黑壳对齐（主题配色、字号、padding）。
- SSR：addon-fit 等曾有 `self is not defined`，务必禁止服务端执行 xterm 代码。

**风险**

- 过早接入会打乱刚稳定的双层布局与 Tab 补全。
- 把 xterm 当成「整站唯一 UI」会削弱档案阅读感——**禁止**用 xterm 渲染 Markdown 正文。

---

## 4. 建议决策

| 选项 | 建议 |
|------|------|
| A. 现在整页换成 xterm | **否** |
| B. 下一阶段：终端输出区 + 输入改 xterm，阅读面板保持 | **是（推荐）** |
| C. 永远不接，自研到底 | 仅当确定不做流式/AI 命令时 |

**推荐接入顺序（B）**

1. 保持 ReadingPanel / 工作区外区不动  
2. 用 xterm 替换 `terminal-shell` 内的输出+输入  
3. 把 `runCommand` 的 lines 转成写入文本（可先无 ANSI，再加 tone→ANSI）  
4. 将 Tab 补全接到 xterm 的 Tab 键（复用 `lib/archive/complete.ts`）  
5. 再考虑 streaming（AI/脚本）  

---

## 5. 验收口径（将来接入时）

- 访客仍用中文 help / Tab  
- `open` 仍打开外区阅读面板，不在 xterm 里刷长文  
- `prefers-reduced-motion` 下不依赖 xterm 动画  
- 无 SSR 报错  

---

## 6. 相关关键词（实操）

- `@xterm/xterm` / `@xterm/addon-fit`
- `term.write` / `onData` / scrollback
- Next.js `dynamic(..., { ssr: false })`
- Surface vs Runtime（表面 vs 命令引擎）
- ANSI escape（可选增强，非第一天必做）
