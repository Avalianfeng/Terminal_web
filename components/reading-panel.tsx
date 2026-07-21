"use client";

import {
  KeyboardEvent,
  TransitionEvent,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { zhCN } from "@/lib/archive/i18n";
import { MarkdownProse } from "@/lib/archive/markdown-prose";
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
  return <MarkdownProse body={document.body} />;
}

function TimelineBody({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="reading-panel__timeline">
      {entries.map((item) => (
        <section
          key={`${item.date}-${item.title}`}
          className="reading-panel__timeline-item"
        >
          <time className="reading-panel__timeline-date">{item.date}</time>
          <div>
            <h3 className="reading-panel__timeline-title">{item.title}</h3>
            <p className="reading-panel__timeline-body">{item.body}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * 主阅读槽：文档流在终端下方。
 * Phase 1：展开/收起开合；换文 demote 见 ReadingDemoteGhost（docs/04 Phase 2b）。
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
        <div className="reading-panel__chrome-text">
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
              <p className="reading-panel__status">{surface.document.status}</p>
            ) : null}
            {surface.document.summary ? (
              <p className="reading-panel__summary">{surface.document.summary}</p>
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
