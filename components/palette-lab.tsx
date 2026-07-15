"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  applyWorkspacePalette,
  readStoredPalette,
  type WorkspacePalette,
} from "@/lib/archive/palette";

const palettes: {
  id: WorkspacePalette;
  name: string;
  nameZh: string;
  status: string;
  shell: string;
  surface: string;
  description: string;
  swatch: string;
  tokens: { label: string; value: string }[];
}[] = [
  {
    id: "cool-atelier",
    name: "Cool Atelier",
    nameZh: "冷灰阅读室",
    status: "default",
    shell: "Blue-gray command shell",
    surface: "Frosted archive paper",
    description:
      "Institutional and calm. The workspace reads like a reading room; the terminal stays precise and dark.",
    swatch: "from-[#e2e7ec] via-[#0a0c10] to-[#f3f5f8]",
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
    status: "experiment",
    shell: "Warm ink terminal",
    surface: "Aged folio paper",
    description:
      "Terracotta accent on warm stone. Feels closer to a physical archive drawer than software chrome.",
    swatch: "from-[#e6e0d4] via-[#0c0b09] to-[#f5f0e6]",
    tokens: [
      { label: "workspace", value: "#e6e0d4" },
      { label: "paper", value: "#f5f0e6" },
      { label: "accent", value: "#b85c38" },
      { label: "shell", value: "#0c0b09" },
    ],
  },
  {
    id: "ledger-bright",
    name: "Ledger Bright",
    nameZh: "高对比纸面",
    status: "experiment",
    shell: "Near-black ledger",
    surface: "Bright white record",
    description:
      "Sharper paper against a neutral desk. Emerald accent for paths and prompts; highest legibility.",
    swatch: "from-[#ececea] via-[#060606] to-[#ffffff]",
    tokens: [
      { label: "workspace", value: "#ececea" },
      { label: "paper", value: "#ffffff" },
      { label: "accent", value: "#146b4a" },
      { label: "shell", value: "#060606" },
    ],
  },
];

export function PaletteLab() {
  const [active, setActive] = useState<WorkspacePalette>("cool-atelier");

  useEffect(() => {
    const initial = readStoredPalette() ?? "cool-atelier";
    setActive(initial);
    applyWorkspacePalette(initial);
  }, []);

  function selectPalette(id: WorkspacePalette) {
    setActive(id);
    applyWorkspacePalette(id);
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--workspace-bg)] px-4 py-8 text-[var(--workspace-text)] md:px-8">
      <section className="mx-auto max-w-[1200px]">
        <Link
          href="/"
          className="mb-10 inline-flex rounded border border-black/12 bg-white/40 px-4 py-2 text-sm text-neutral-700 transition hover:border-black/22 hover:bg-white/70 active:translate-y-px"
        >
          back to terminal
        </Link>

        <div className="max-w-[760px]">
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.05em] md:text-5xl">
            Workspace palette lab
          </h1>
          <p className="mt-5 max-w-[62ch] text-base leading-7 text-neutral-600">
            三套 Dual Phase 方向。点击卡片会写入 localStorage，并立刻作用到本页与返回首页后的档案壳（含
            xterm 表面色）。
          </p>
          <p className="mt-3 max-w-[62ch] text-sm text-neutral-500">
            当前：<span className="font-medium text-neutral-800">{active}</span>
            。默认 <code className="text-neutral-700">cool-atelier</code>。
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {palettes.map((palette) => {
            const isActive = palette.id === active;
            return (
              <article
                key={palette.id}
                className={`overflow-hidden rounded-md border bg-white/50 transition ${
                  isActive
                    ? "border-[color:var(--archive-accent)] ring-2 ring-[color:var(--archive-accent)]/25"
                    : "border-black/10 hover:border-black/18"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectPalette(palette.id)}
                  className="block w-full text-left"
                  aria-pressed={isActive}
                >
                  <div className={`h-36 bg-gradient-to-br ${palette.swatch}`} />
                  <div className="space-y-4 p-5">
                    <div>
                      <h2 className="text-xl font-semibold tracking-[-0.03em]">
                        {palette.nameZh}
                      </h2>
                      <p className="mt-1 text-sm text-neutral-500">
                        {palette.name} · {palette.status}
                      </p>
                    </div>
                    <p className="text-sm leading-6 text-neutral-600">
                      {palette.description}
                    </p>
                    <dl className="grid grid-cols-4 gap-2 border-t border-black/8 pt-4">
                      {palette.tokens.map((token) => (
                        <div key={token.label}>
                          <dt className="text-[10px] uppercase tracking-wide text-neutral-400">
                            {token.label}
                          </dt>
                          <dd className="mt-1 flex items-center gap-1.5">
                            <span
                              className="inline-block size-3 rounded-sm border border-black/10"
                              style={{ background: token.value }}
                              aria-hidden
                            />
                            <span className="font-mono text-[10px] text-neutral-600">
                              {token.value}
                            </span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
