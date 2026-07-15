"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import { zhCN } from "@/lib/archive/i18n";
import type { ArchiveDocument, ReadingSurface, TimelineEntry } from "@/lib/archive/types";

type ReadingPanelProps = {
  surface: ReadingSurface;
  onClose: () => void;
};

function MarkdownBody({ document }: { document: ArchiveDocument }) {
  const lines = document.body.split("\n");

  return (
    <div className="space-y-4 text-[15px] leading-7 text-[color:var(--archive-paper-ink)]/85">
      {lines.map((line, index) => {
        if (line.startsWith("# ")) {
          return (
            <h3
              key={`${line}-${index}`}
              className="pt-3 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--archive-paper-ink)]"
            >
              {line.replace(/^#\s+/, "")}
            </h3>
          );
        }

        if (line.startsWith("## ")) {
          return (
            <h4
              key={`${line}-${index}`}
              className="pt-4 text-lg font-semibold tracking-[-0.02em] text-[color:var(--archive-paper-ink)]"
            >
              {line.replace(/^##\s+/, "")}
            </h4>
          );
        }

        if (line.startsWith("- ")) {
          return (
            <p key={`${line}-${index}`} className="pl-4 text-[color:var(--archive-paper-ink)]/80">
              <span className="mr-2 text-[color:var(--archive-muted)]">-</span>
              {line.replace(/^-\s+/, "")}
            </p>
          );
        }

        if (!line.trim()) {
          return <div key={`space-${index}`} className="h-2" />;
        }

        return <p key={`${line}-${index}`}>{line}</p>;
      })}
    </div>
  );
}

function TimelineBody({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="space-y-7">
      {entries.map((item) => (
        <section
          key={`${item.date}-${item.title}`}
          className="grid gap-2 border-t border-[color:var(--archive-line)] pt-5 md:grid-cols-[9rem_1fr]"
        >
          <time className="text-sm text-[color:var(--archive-muted)]">{item.date}</time>
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--archive-paper-ink)]">
              {item.title}
            </h3>
            <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-[color:var(--archive-paper-ink)]/80">
              {item.body}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * C0 阅读表面：layout=floating。
 * 关键词：Containment（明确窗框）/ Elevation（相对外区抬升）/ Focal point（打开时可读，关后焦点回终端）。
 */
export function ReadingPanel({ surface, onClose }: ReadingPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, [surface]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title =
    surface.kind === "document" ? surface.document.title : zhCN.labels.timeline;
  const metaType =
    surface.kind === "document" ? zhCN.reading.typeDocument : zhCN.reading.typeTimeline;
  const path =
    surface.kind === "document" ? surface.document.path : "/timeline";

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <aside
      className="reading-panel"
      data-layout="floating"
      role="dialog"
      aria-modal="false"
      aria-label={zhCN.reading.panelLabel}
      onKeyDown={onPanelKeyDown}
    >
      <header className="reading-panel__chrome">
        <div className="min-w-0">
          <p className="reading-panel__eyebrow">
            {zhCN.reading.panelLabel} · {metaType}
          </p>
          <h2 className="reading-panel__title">{title}</h2>
          <p className="reading-panel__path">{path}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="reading-panel__close"
          onClick={onClose}
          aria-label={zhCN.reading.close}
          title={zhCN.reading.closeHint}
        >
          ×
        </button>
      </header>

      <div className="reading-panel__body">
        {surface.kind === "document" ? (
          <>
            {surface.document.status ? (
              <p className="mb-5 w-fit rounded border border-[color:var(--archive-line)] px-2.5 py-1 text-xs text-[color:var(--archive-muted)]">
                {surface.document.status}
              </p>
            ) : null}
            {surface.document.summary ? (
              <p className="mb-8 max-w-[62ch] text-base leading-7 text-[color:var(--archive-paper-ink)]/80">
                {surface.document.summary}
              </p>
            ) : null}
            <MarkdownBody document={surface.document} />
          </>
        ) : (
          <TimelineBody entries={surface.entries} />
        )}
      </div>
    </aside>
  );
}
