# ADR 0012: 终端 CLI 输出契约（排放）

- **Status**: Accepted
- **Date**: 2026-08-15
- **Commit**: （文档刀；排放代码未落地）
- **Code**（计划）: `lib/archive/cli-emit.ts`；`lib/music/music-command.ts`（music 子命令 usage 表）；`components/archive-xterm.tsx`（`\r` status/progress）；`components/archive-terminal.tsx`（喂入 bytes/事件）
- **Glossary**: `CONTEXT.md` → CliEmit
- **Related**: [0002](0002-command-registry.md)（命令名 / help / Tab **发现**）；本 ADR 管 **排放**（命令跑完后 xterm 写什么）

## Context

终端输出目前有三条并行写入路径，handler 自行拼标点：

1. **`lib/archive/i18n.ts`** — 扁平中文字符串；handler 用 `+` / `：` 拼接。
2. **`lib/archive/commands.ts`** — 同步 `CommandResult.entries`。
3. **`components/archive-terminal.tsx`** — 异步 `extra[]`（音乐播放、切歌单等）。

由此产生的真实缺陷（2026-08-15 主人会话）：

- `music playlist next` 打印 `已切换浏览歌单（当前曲未打断）：` 后**无歌单名** — `commands.ts` 写了冒号，UI `switchPlaylist` 未追加对象名。
- `music playlist` 无参时 dump 整页 `music` help — 违反 0002「usage 不应是 20 条 `usagePlay` 散落在 i18n」。
- `archive-xterm.tsx` 的 `ynConfirm` 把 `y` 粘在提示行末尾。
- 无 progress 通道；download 只有 `正在下载…` 然后 `已写入本地曲库（1）`，无百分比、无文件名。
- 音乐域 chatty（多行状态 + 中文客服腔）；档案命令（`ls`/`pwd` + `invalidPath` did-you-mean）更接近 POSIX，应作为泛化样板而非两套风格。

**0002 CommandSpec** 解决「命令是否存在、help 表从哪来、Tab 补什么」；**不**规定成功/失败/进度行长什么样。本 ADR 补排放契约。

## Decision

### 原则

1. **四类体裁**：`usage` | `result` | `error` | `status`（`status` 可用 `\r` 覆写单行）。禁止把 `正在…` 永久留在 scrollback。短操作：仅 `result`。长操作：`status` → 完成时换行 + `result`（`status` 行被擦除）。
2. **成功必须点名对象**。禁止空冒号行（`…：` 后无内容）。瞬时成功可静默（如 `cp`）；凡操作有明确对象，结果行须含其名。
3. **错误**：`prog: message` + 可选 hint 行。回显用户操作数（引号包裹）。hint = **下一条可执行命令**，不是散文说明。
4. **缺参** → 该**子命令**的 usage，不是父命令百科。`music` / `music help` = 由表派生的完整命令表（0002）；散落的 `usage*` 不得再进 i18n。
5. **确认** 仅 tty：`[y/N]` 默认 N；回答与 prompt **视觉分离**；Ctrl+C 中止队列。
6. **进度** 是 status 的一种：单行 `\r` 重绘；结束时 `\n` + result。wget/curl 式短条（名 + % + 条），非 GUI。**本 ADR 只定形状，不实现。** 形状例（覆写中的一行）：

```text
爱情.mp3  45% [=====>    ]
```

7. **槽位消息**；handler 不得自行粘标点。`zhCN` 仍是中文 phrase book，经 `format(id, slots)` 出句。`commands.ts` 与 `archive-terminal.tsx` **共用同一 emitter** — 消灭第二条 `musicSystem("…：")` 路径。
8. **中文词 + POSIX 骨架**（允许 `usage:` / `playing` 等短标签）。不全站英文化。禁止客服腔（「先 xxx 查看」）。**result/error 标签用短英文**（`prog`/`usage`/`playing`/`saved`/`in`/`Try`），宾语与专名保持原文/中文。

### 已有好样板（泛化，不替换 VFS）

`ls` 缺路径 → `invalidPath: …` + did-you-mean 下一命令。0012 把该模式推广到 music 与 async 路径。

### annotated 现状 → 目标

#### A. `play --song`（歌单误当艺人）

现状：

```text
$ music play --song my
正在按歌名查找…
开始播放曲目：Take My Hand · 策月帘风喜欢的音乐
```

问题：两行 chatty 状态；对象与容器混在一行。

目标：

```text
$ music play --song my
playing Take My Hand
in 策月帘风喜欢的音乐
```

（hydrate 期间可 `\r` 覆写一行 status；完成后不得留在 scrollback。）

#### B. `play --playlist` miss（无 query 回显、hint 不对）

现状：

```text
没有匹配的歌单。先 music ls 查看。
```

目标：

```text
music: no playlist matches 'my'
Try 'music ls' or 'music play --song my'.
```

#### C. 子命令缺参 dump 百科

现状：`music playlist` 打印整页 `music` help。

目标：

```text
usage: music playlist next|prev|<name>
```

#### D. 空冒号（sync/async 分裂）

现状：

```text
已切换浏览歌单（当前曲未打断）：
```

（第二行空白 — 歌单名丢失。）

目标：

```text
switched browse playlist to '本地'
```

（单行完整 result；仅失败时走 error。）

#### E. download 结果匿名

现状：

```text
已写入本地曲库（1）
```

目标：

```text
saved '阴天' (277775.mp3)
```

（长下载先 `\r` 百分比条，再换行输出上句。）

#### F. download miss — 域错误 + 标点粘连

现状：

```text
没有匹配的歌单或曲目。：爱请
```

目标：

```text
music: no track matches '爱请'
```

#### G. confirm 粘连

现状：

```text
下载「爱情 — 莫文蔚」？ [y/N]y
```

目标：

```text
下载「爱情 — 莫文蔚」？ [y/N]
y
saved '爱情' (277804.mp3)
```

### 落地形状（本刀不写码）

| 模块 | 职责 |
|------|------|
| `lib/archive/cli-emit.ts` | `usage` / `result` / `error` / `status` → `TerminalEntry[]`（tone：`usage`=muted，`result`=normal+path，`error`=error，`status`=hint） |
| message id + slots | 单测锁定格式，如 `music: no track matches '爱请'` |
| `archive-xterm.tsx` | status/progress `\r` 重绘；与 pager / `ynConfirm` 互斥 |
| `archive-terminal.tsx` | 喂入 entries/事件；download 日后接 fetch `ReadableStream` |
| `lib/music/music-command.ts` | 子命令 usage 表与 `parseMusicArgs` 并列（0002 `argComplete: music` 同源） |

## Consequences

- 加/改命令输出 = 登记 message id + slots，经 emitter 出 `entries`；禁止 handler 拼 `：`。
- 单测：`cli-emit` 格式快照；music 子命令 usage 与 0002 表一致。
- 首刀实现顺序见 [`09`](../09-v1.x-后续工作.md) §1.3：先 music（download progress + 空冒号），再可选 sweep 档案命令。
- 0002 的 `i18n.help` 进一步瘦身；业务句迁到 emitter phrase book。

## Rejected

- 全 CLI 英文化
- ncurses / rich TUI / GUI 进度组件
- 继续把所有 copy dump 进 `zhCN.music`
- **本刀**落地 emission / progress / i18n 重构（仅 ADR）
- 为「显得完整」重写 `docs/01`–`05`/`07`
