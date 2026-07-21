"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  applyPaperGrain,
  applyTypeScale,
  PAPER_GRAINS,
  readStoredPaperGrain,
  readStoredTypeScale,
  TYPE_SCALES,
  type PaperGrain,
  type TypeScale,
} from "@/lib/archive/lab-prefs";
import { MarkdownProse } from "@/lib/archive/markdown-prose";
import {
  applyWorkspacePalette,
  PRODUCTION_PALETTES,
  readStoredPalette,
  readTerminalToneSwatches,
  TERMINAL_TONE_KEYS,
  type TerminalToneKey,
  type WorkspacePalette,
} from "@/lib/archive/palette";

const palettes: {
  id: WorkspacePalette;
  name: string;
  nameZh: string;
  status: "production" | "lab";
  description: string;
  tokens: { label: string; value: string }[];
}[] = [
  {
    id: "cool-atelier",
    name: "Cool Atelier",
    nameZh: "冷灰阅读室",
    status: "production",
    description:
      "生产默认。机构阅览室气质：冷灰外区、深壳终端、唯一蓝灰强调。",
    tokens: [
      { label: "workspace", value: "#e2e7ec" },
      { label: "paper", value: "#f3f5f8" },
      { label: "accent", value: "#4a7a9b" },
      { label: "shell", value: "#0a0c10" },
    ],
  },
  {
    id: "warm-folio",
    name: "Warm Folio",
    nameZh: "暖纸档案",
    status: "lab",
    description:
      "试验：暖石纸面，强调改为墨褐（避开赤陶指纹），接近实体档案抽屉。",
    tokens: [
      { label: "workspace", value: "#e4ddd2" },
      { label: "paper", value: "#f4eee4" },
      { label: "accent", value: "#6f5644" },
      { label: "shell", value: "#0c0b09" },
    ],
  },
  {
    id: "ledger-bright",
    name: "Ledger Bright",
    nameZh: "高对比纸面",
    status: "lab",
    description: "试验：近白纸 + 近黑壳，翠绿强调，可读性优先。",
    tokens: [
      { label: "workspace", value: "#ececea" },
      { label: "paper", value: "#ffffff" },
      { label: "accent", value: "#146b4a" },
      { label: "shell", value: "#060606" },
    ],
  },
  {
    id: "ink-drawer",
    name: "Ink Drawer",
    nameZh: "墨色抽屉",
    status: "lab",
    description: "试验：更深暖底与墨色强调，比 warm-folio 更「档案柜」少「奶油纸」。",
    tokens: [
      { label: "workspace", value: "#d9d3c8" },
      { label: "paper", value: "#f1ebe1" },
      { label: "accent", value: "#4e4338" },
      { label: "shell", value: "#0d0b09" },
    ],
  },
  {
    id: "mist-atelier",
    name: "Mist Atelier",
    nameZh: "薄雾工作室",
    status: "lab",
    description: "试验：更冷更疏的阅读室变体，纸面更亮、对比略软。",
    tokens: [
      { label: "workspace", value: "#e6ebf0" },
      { label: "paper", value: "#f6f8fa" },
      { label: "accent", value: "#5a849e" },
      { label: "shell", value: "#0b0e12" },
    ],
  },
];

const SAMPLE_PROSE = `# 纸面样张

访客打开档案时，像在阅览室摊开一份文件。终端仍是探索器，不是被页面装饰挤掉的工具栏。

## 混排与强调

拉丁与中文同页：*Personal Archive* 与 **个人档案系统**。行内代码如 \`open projects/personal_archive\`，链接见 [cylf.me](https://cylf.me)。

> Dual Phase 不可破：浅色外区衬深色终端；阅读面是纸，不是第二块黑壳。

### 列表

1. 先读完一篇
2. 再决定是否换色板
3. 动效只服务开合

---

\`\`\`bash
visitor@archive:~$ open thoughts/archive-system
\`\`\`
`;

const grainLabels: Record<PaperGrain, string> = {
  soft: "轻网格",
  medium: "默认",
  strong: "密网格",
};

const scaleLabels: Record<TypeScale, string> = {
  compact: "紧凑",
  reading: "阅读（默认）",
  airy: "疏朗",
};

export function PaletteLab() {
  const [active, setActive] = useState<WorkspacePalette>("cool-atelier");
  const [grain, setGrain] = useState<PaperGrain>("medium");
  const [scale, setScale] = useState<TypeScale>("reading");
  const [tones, setTones] = useState<Record<TerminalToneKey, string> | null>(
    null,
  );

  function refreshTones() {
    setTones(readTerminalToneSwatches());
  }

  useEffect(() => {
    const initial = readStoredPalette() ?? "cool-atelier";
    const initialGrain = readStoredPaperGrain() ?? "medium";
    const initialScale = readStoredTypeScale() ?? "reading";
    // 试验偏好只能在客户端读；挂载后同步，避免 SSR 水合分叉
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage bootstrap
    setActive(initial);
    setGrain(initialGrain);
    setScale(initialScale);
    applyWorkspacePalette(initial);
    applyPaperGrain(initialGrain);
    applyTypeScale(initialScale);
    refreshTones();
  }, []);

  function selectPalette(id: WorkspacePalette) {
    setActive(id);
    applyWorkspacePalette(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => refreshTones());
    });
  }

  function selectGrain(next: PaperGrain) {
    setGrain(next);
    applyPaperGrain(next);
  }

  function selectScale(next: TypeScale) {
    setScale(next);
    applyTypeScale(next);
  }

  return (
    <main className="palette-lab">
      <section className="palette-lab__stage">
        <Link href="/" className="palette-lab__back">
          返回终端
        </Link>

        <header className="palette-lab__intro">
          <p className="palette-lab__eyebrow">Theme lab · 试验台</p>
          <h1 className="palette-lab__title">工作区色板与纸面试验</h1>
          <p className="palette-lab__lead">
            生产默认只有{" "}
            <code className="palette-lab__code">cool-atelier</code>
            。其余方向、网格密度与字号阶梯写在 localStorage，立刻作用于本页与返回首页后的档案壳（含
            xterm）。此处用于比较，不开放字体超市。
          </p>
          <p className="palette-lab__meta">
            当前色板 <strong>{active}</strong>
            {PRODUCTION_PALETTES.includes(active) ? " · 生产" : " · lab"}
            {" · "}
            网格 {grainLabels[grain]}
            {" · "}
            字号 {scaleLabels[scale]}
          </p>
        </header>

        <section className="palette-lab__controls" aria-label="试验控件">
          <div className="palette-lab__control">
            <h2 className="palette-lab__control-title">纸面网格</h2>
            <div className="palette-lab__chips">
              {PAPER_GRAINS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`palette-lab__chip${grain === item ? " is-active" : ""}`}
                  aria-pressed={grain === item}
                  onClick={() => selectGrain(item)}
                >
                  {grainLabels[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="palette-lab__control">
            <h2 className="palette-lab__control-title">字号阶梯</h2>
            <div className="palette-lab__chips">
              {TYPE_SCALES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`palette-lab__chip${scale === item ? " is-active" : ""}`}
                  aria-pressed={scale === item}
                  onClick={() => selectScale(item)}
                >
                  {scaleLabels[item]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {tones ? (
          <section className="palette-lab__tones">
            <h2 className="palette-lab__section-title">
              Terminal tones（`--tone-*` → xterm）
            </h2>
            <p className="palette-lab__section-note">
              随色板切换实时取色；首页终端真彩与 16 色都从这组变量来。
            </p>
            <ul className="palette-lab__tone-grid">
              {TERMINAL_TONE_KEYS.map((key) => (
                <li key={key} className="palette-lab__tone">
                  <span
                    className="palette-lab__tone-swatch"
                    style={{ background: tones[key] }}
                    aria-hidden
                  />
                  <span className="palette-lab__tone-label">{key}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="palette-lab__list" aria-label="色板列表">
          {palettes.map((palette) => {
            const isActive = palette.id === active;
            return (
              <article
                key={palette.id}
                className={`palette-lab__card${isActive ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="palette-lab__card-hit"
                  onClick={() => selectPalette(palette.id)}
                  aria-pressed={isActive}
                >
                  <div
                    className="palette-lab__card-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${palette.tokens[0]?.value} 0%, ${palette.tokens[3]?.value} 48%, ${palette.tokens[1]?.value} 100%)`,
                    }}
                  />
                  <div className="palette-lab__card-body">
                    <div className="palette-lab__card-head">
                      <h2 className="palette-lab__card-title">{palette.nameZh}</h2>
                      <span className="palette-lab__badge">
                        {palette.status === "production" ? "生产" : "lab"}
                      </span>
                    </div>
                    <p className="palette-lab__card-sub">
                      {palette.name} · {palette.id}
                    </p>
                    <p className="palette-lab__card-desc">{palette.description}</p>
                    <dl className="palette-lab__token-row">
                      {palette.tokens.map((token) => (
                        <div key={token.label}>
                          <dt>{token.label}</dt>
                          <dd>
                            <span
                              className="palette-lab__token-dot"
                              style={{ background: token.value }}
                              aria-hidden
                            />
                            <span>{token.value}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </button>
              </article>
            );
          })}
        </section>

        <section className="palette-lab__paper" aria-label="纸面样张">
          <div className="palette-lab__paper-chrome">
            <p className="palette-lab__eyebrow">档案阅读 · 样张</p>
            <h2 className="palette-lab__paper-title">中文衬线与 prose 层级</h2>
            <p className="palette-lab__paper-path">lab/prose-sample</p>
          </div>
          <div className="palette-lab__paper-body">
            <p className="palette-lab__paper-summary">
              用当前色板与字号直接预览阅读面板排版；与首页 `open` 打开后的纸面同一套 CSS。
            </p>
            <MarkdownProse body={SAMPLE_PROSE} />
          </div>
        </section>
      </section>
    </main>
  );
}
