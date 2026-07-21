# 配色实验：Workspace Palette

> 分支：`experiment/workspace-palette`  
> 范围：仅外区工作场、阅读面板、终端壳视觉；不改命令系统 / xterm / lib/archive。

---

## 1. 三套方向

| ID | 名称 | 外区 | 阅读纸 | 终端壳 | 强调色 |
|----|------|------|--------|--------|--------|
| `cool-atelier` | 冷灰阅读室 | `#e2e7ec` 冷灰 | `#f3f5f8` 雾白 | `#0a0c10` 蓝黑 | `#4a7a9b` 钴蓝灰 |
| `warm-folio` | 暖纸档案 | `#e6e0d4` 暖石 | `#f5f0e6` 旧纸 | `#0c0b09` 墨黑 | `#b85c38` 赤陶 |
| `ledger-bright` | 高对比纸面 | `#ececea` 中性灰 | `#ffffff` 亮白 | `#060606` 近黑 | `#146b4a` 墨绿 |

**Dual Phase 不变**：浅色外区 + 深色终端壳 + 独立阅读面板浮层。

---

## 2. 默认与切换

- **本分支默认**：`cool-atelier`（`app/layout.tsx` 的 `html[data-palette]`）。
- **在线预览**：`/themes` 点击卡片可 live 切换，选择会写入 `localStorage`（键 `archive-workspace-palette`）。
- **改站点默认**：编辑 `layout.tsx` 中 `data-palette` 为上述三者之一。
- **临时调试**：DevTools 执行  
  `document.documentElement.dataset.palette = 'warm-folio'`

---

## 3. 取舍

| 方向 | 优点 | 风险 |
|------|------|------|
| cool-atelier | 与终端冷色协调；阅读室气质；accent 不抢戏 | 外区偏冷，少「人情味」 |
| warm-folio | 档案/纸本联想强；赤陶 accent 有辨识度 | 暖灰若再提亮易落入模板感 |
| ledger-bright | 正文对比最高；适合长文阅读 | 白纸+黑壳对比猛，久看需测疲劳 |

**建议**：若 v0.2 主站偏「个人档案」而非「纯工具」，可 A/B `warm-folio` 与 `cool-atelier`；若 `open` 后长文多，保留 `ledger-bright` 作阅读模式候选。

---

## 4. 实现要点

- 令牌集中在 `app/globals.css`，通过 `[data-palette="..."]` 覆盖 CSS 变量。
- 终端 tone 使用 `rgb(var(--tone-*))` 分量，随 palette 微调色相。
- 阴影按 palette 色调染色（冷蓝灰 / 暖褐 / 中性黑），避免纯黑 drop shadow。
- `readXtermThemeFromCss()` 把 `--tone-*` 映射到 xterm 16 色 ANSI；`/themes` 展示 live tone 色板，**不加字体选择器**。

---

## 5. 不做

- 再堆第四套以上皮肤当产品功能
- 访客可选字体 / 「主题超市」
