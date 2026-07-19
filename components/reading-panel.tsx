"use client";

import {
  KeyboardEvent,
  TransitionEvent,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { zhCN } from "@/lib/archive/i18n";
import {
  resolvePanelLeaveMs,
  resolveScrollBehavior,
} from "@/lib/archive/motion-spec";
import { readingSurfaceKey } from "@/lib/archive/reading-state";
import type { ArchiveDocument, ReadingSurface, TimelineEntry } from "@/lib/archive/types";

export { readingSurfaceKey };

type ReadingPanelProps = {
  surface: ReadingSurface;
  leaving?: boolean;
  onClose: () => void;
  onLeaveDone?: () => void;
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
 * 主阅读槽：文档流在终端下方。
 * Phase 1：擦除/淡入淡出开合；Phase 2 再接右侧 rail（见 docs/04）。
 */
export function ReadingPanel({
  surface,
  leaving = false,
  onClose,
  onLeaveDone,
}: ReadingPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const leaveDoneRef = useRef(onLeaveDone);
  const leaveDoneSentRef = useRef(false);
  leaveDoneRef.current = onLeaveDone;

  function signalLeaveDone() {
    if (leaveDoneSentRef.current) return;
    leaveDoneSentRef.current = true;
    leaveDoneRef.current?.();
  }

  useEffect(() => {
    if (leaving) return;
    leaveDoneSentRef.current = false;
    const el = panelRef.current;
    if (!el) return;

    // 等布局稳定后再滚：把阅读区顶到视口上方，从而把终端推上去
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({
          behavior: resolveScrollBehavior(),
          block: "start",
          inline: "nearest",
        });
        closeRef.current?.focus({ preventScroll: true });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [surface, leaving]);

  /**
   * 退场必须先钉住「展开终态」再开 transition。
   * 若同一帧里关掉 enter 动画并设收起目标，浏览器常会跳过过渡 → 看起来像没退场。
   */
  useLayoutEffect(() => {
    if (!leaving) return;
    const el = panelRef.current;
    if (!el) return;

    const leaveMs = resolvePanelLeaveMs();
    leaveDoneSentRef.current = false;

    if (leaveMs <= 0) {
      signalLeaveDone();
      return;
    }

    el.style.animation = "none";
    el.style.transition = "none";
    el.style.opacity = "1";
    el.style.transform = "scaleY(1)";
    void el.offsetWidth;

    el.style.transition = [
      `opacity ${leaveMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      `transform ${leaveMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    ].join(", ");
    el.style.opacity = "0";
    el.style.transform = "scaleY(0.04)";

    const timer = window.setTimeout(() => {
      signalLeaveDone();
    }, leaveMs + 64);

    return () => {
      window.clearTimeout(timer);
      el.style.animation = "";
      el.style.transition = "";
      el.style.opacity = "";
      el.style.transform = "";
    };
  }, [leaving]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!leaving) onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, leaving]);

  const title =
    surface.kind === "document" ? surface.document.title : zhCN.labels.timeline;
  const metaType =
    surface.kind === "document" ? zhCN.reading.typeDocument : zhCN.reading.typeTimeline;
  const path =
    surface.kind === "document" ? surface.document.path : "/timeline";

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!leaving) onClose();
    }
  }

  function onTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (event.target !== panelRef.current) return;
    if (!leaving) return;
    if (event.propertyName !== "opacity" && event.propertyName !== "transform") {
      return;
    }
    signalLeaveDone();
  }

  return (
    <aside
      ref={panelRef}
      className={`reading-panel${leaving ? " is-leaving" : " is-entering"}`}
      data-layout="main"
      data-slot="main"
      role="dialog"
      aria-modal="false"
      aria-label={zhCN.reading.panelLabel}
      onKeyDown={onPanelKeyDown}
      onTransitionEnd={onTransitionEnd}
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
          onClick={() => {
            if (!leaving) onClose();
          }}
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
