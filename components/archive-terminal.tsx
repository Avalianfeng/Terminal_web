"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveXterm, type ArchiveXtermHandle } from "@/components/archive-xterm";
import { EditorPanel, type EditorTarget } from "@/components/editor-panel";
import { ReadingDemoteGhost } from "@/components/reading-demote-ghost";
import { ReadingPanel } from "@/components/reading-panel";
import { ReadingRail } from "@/components/reading-rail";
import { completeInput } from "@/lib/archive/complete";
import { initialEntries, runCommand } from "@/lib/archive/commands";
import { zhCN } from "@/lib/archive/i18n";
import {
  motionSpec,
  resolveDemoteMs,
  resolveMotionLevel,
  resolvePanelEnterMs,
  resolvePanelLeaveMs,
  resolveScrollBehavior,
  type MotionLevel,
} from "@/lib/archive/motion-spec";
import { readingSurfaceKey } from "@/lib/archive/reading-state";
import {
  demoteDone,
  demoteGhost,
  emptyReadingSession,
  isLeaving,
  leaveDone,
  reconcileSession,
  replaceDocument,
  dismissDocument,
  dismissRail,
  requestClear,
  requestClose,
  requestPromote,
  swapSurfaces,
  type ReadingSession,
  type ReadingSessionResult,
} from "@/lib/archive/reading-session";
import { parseDocument } from "@/lib/archive/parse-document";
import { createSession, formatShellPromptTokens } from "@/lib/archive/vfs";
import { toLocalKey } from "@/lib/archive/document-ref";
import type {
  ArchiveSnapshot,
  ReadingSurface,
  TerminalSession,
} from "@/lib/archive/types";

type ArchiveTerminalProps = {
  snapshot: ArchiveSnapshot;
};

export function ArchiveTerminal({ snapshot }: ArchiveTerminalProps) {
  const router = useRouter();
  const [motionLevel, setMotionLevel] = useState<MotionLevel>(1);
  const bootEntries = useMemo(() => initialEntries(snapshot), [snapshot]);

  const [session, setSession] = useState<TerminalSession>(() => createSession());
  const [readingSession, setReadingSession] = useState<ReadingSession>(
    emptyReadingSession,
  );
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [completeCandidates, setCompleteCandidates] = useState<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const xtermRef = useRef<ArchiveXtermHandle>(null);
  const terminalShellRef = useRef<HTMLElement>(null);
  const sessionRef = useRef(session);
  const readingSessionRef = useRef(readingSession);
  const editorTargetRef = useRef<EditorTarget | null>(null);
  const fullscreenRef = useRef(fullscreen);

  // 事件回调与子组件闭包都在提交后读取这些 ref；用效果同步保证读到最新值
  useEffect(() => {
    sessionRef.current = session;
    readingSessionRef.current = readingSession;
    fullscreenRef.current = fullscreen;
  }, [session, readingSession, fullscreen]);

  /** After router.refresh(), rebind open document surfaces from the new snapshot. */
  useEffect(() => {
    const result = reconcileSession(readingSessionRef.current, snapshot);
    if (result.session === readingSessionRef.current) return;
    applySessionResult(result);
    // applySessionResult closes over motion/focus helpers; snapshot is the intentional trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref-driven apply on snapshot change only
  }, [snapshot]);

  useEffect(() => {
    // 动效级别只能客户端读取（prefers-reduced-motion）；挂载后同步，避免 SSR 水合分叉
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time client-only bootstrap
    setMotionLevel(resolveMotionLevel());
  }, []);

  useEffect(() => {
    if (completeCandidates.length === 0) return;
    xtermRef.current?.relayout();
  }, [completeCandidates.length]);

  useEffect(() => {
    xtermRef.current?.relayout();
    if (!fullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen, motionLevel]);

  /** 焦点不在 xterm 时仍可用 Esc 退出 fullscreen（阅读面板优先由自身处理 Esc） */
  useEffect(() => {
    if (!fullscreen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (readingSessionRef.current.reading.main) return;
      event.preventDefault();
      setFullscreen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  function toggleFullscreen() {
    setFullscreen((current) => !current);
  }

  function exitFullscreen() {
    if (fullscreenRef.current) {
      setFullscreen(false);
    }
  }

  function revealTerminal() {
    terminalShellRef.current?.scrollIntoView({
      behavior: resolveScrollBehavior(motionLevel),
      block: "start",
      inline: "nearest",
    });
    xtermRef.current?.focus({ preventScroll: true });
  }

  function applySessionResult(result: ReadingSessionResult) {
    readingSessionRef.current = result.session;
    setReadingSession(result.session);
    for (const effect of result.effects) {
      if (effect === "focusTerminal") {
        revealTerminal();
      }
    }
  }

  function animateLeave() {
    return resolvePanelLeaveMs(motionLevel) > 0;
  }

  function animateDemote() {
    return resolveDemoteMs(motionLevel) > 0;
  }

  function closeReading() {
    applySessionResult(
      requestClose(readingSessionRef.current, {
        animateLeave: animateLeave(),
      }),
    );
  }

  function finishLeave() {
    applySessionResult(leaveDone(readingSessionRef.current));
  }

  /** Phase 2b：有旧主槽且换文时，幽灵 demote + 新主槽 Phase 1 进场并行 */
  function swapReading(surfaces: ReadingSurface[]) {
    applySessionResult(
      swapSurfaces(readingSessionRef.current, surfaces, {
        animateDemote: animateDemote(),
      }),
    );
  }

  function applyReading(next: ReadingSurface | ReadingSurface[] | null) {
    if (next === null) {
      applySessionResult(
        requestClear(readingSessionRef.current, {
          animateLeave: animateLeave(),
        }),
      );
      return;
    }

    // 全屏沉浸让位于 Dual Phase：阅读纸面需要浅色外区
    exitFullscreen();
    swapReading(Array.isArray(next) ? next : [next]);
  }

  function promoteFromRail(surface: ReadingSurface) {
    applySessionResult(
      requestPromote(readingSessionRef.current, surface, {
        animateDemote: animateDemote(),
      }),
    );
  }

  function dismissRailItem(key: string) {
    applySessionResult(dismissRail(readingSessionRef.current, key));
  }

  /** 编辑面板关闭：保存则即时刷新已打开阅读面；删除则关掉该文；并 refresh 快照。 */
  function handleEditorDone(result: {
    saved: boolean;
    deleted: boolean;
    raw?: string;
  }) {
    const target = editorTargetRef.current;
    editorTargetRef.current = null;
    setEditorTarget(null);

    if (result.deleted && target) {
      applySessionResult(
        dismissDocument(readingSessionRef.current, toLocalKey(target.ref)),
      );
      router.refresh();
    } else if (result.saved && target && result.raw) {
      const document = parseDocument(
        target.ref.group,
        target.ref.slug,
        result.raw,
      );
      applySessionResult(replaceDocument(readingSessionRef.current, document));
      router.refresh();
    } else if (result.saved || result.deleted) {
      router.refresh();
    }
    revealTerminal();
  }

  function finishDemote() {
    applySessionResult(demoteDone(readingSessionRef.current));
  }

  const panelEnterMs = resolvePanelEnterMs(motionLevel);
  const panelLeaveMs = resolvePanelLeaveMs(motionLevel);
  const demoteMs = resolveDemoteMs(motionLevel);
  const main = readingSession.reading.main;
  const leaving = isLeaving(readingSession);
  const demoting = demoteGhost(readingSession);
  const hasReading =
    Boolean(main) || readingSession.reading.rail.length > 0 || Boolean(demoting);
  const arrivingKey = demoting ? readingSurfaceKey(demoting) : null;

  return (
    <main
      className={`archive-workspace motion-level-${motionLevel}${
        fullscreen ? " is-terminal-fullscreen" : ""
      }`}
      style={
        {
          "--output-fade-ms": `${motionSpec.outputFadeMs}ms`,
          "--output-distance": `${motionSpec.outputDistancePx}px`,
          "--cursor-blink-ms": `${motionSpec.cursorBlinkMs}ms`,
          "--panel-fade-ms": `${panelEnterMs}ms`,
          "--panel-leave-ms": `${panelLeaveMs}ms`,
          "--panel-demote-ms": `${demoteMs}ms`,
        } as CSSProperties
      }
    >
      <div className="archive-workspace__stage">
        <section ref={terminalShellRef} className="terminal-shell">
          <header className="terminal-shell__chrome">
            <div className="terminal-shell__brand">
              <p className="terminal-shell__title">{zhCN.shell.title}</p>
              <p className="terminal-shell__subtitle">{zhCN.shell.subtitle}</p>
            </div>
            <div className="terminal-shell__actions">
              <button
                type="button"
                className="terminal-shell__btn"
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
              >
                {fullscreen
                  ? zhCN.shell.fullscreenExit
                  : zhCN.shell.fullscreen}
              </button>
              <Link href="/themes" className="terminal-shell__btn">
                {zhCN.shell.themeLab}
              </Link>
            </div>
          </header>

          <div className="terminal-shell__body">
            <ArchiveXterm
              ref={xtermRef}
              bootEntries={bootEntries}
              lineDelayMs={
                motionLevel === 0 ? 0 : motionSpec.lineDelayMs
              }
              getPromptTokens={() =>
                formatShellPromptTokens(sessionRef.current.cwd)
              }
              getComplete={(input, cycle) =>
                completeInput(input, snapshot, sessionRef.current.cwd, cycle)
              }
              onCommand={(command) => {
                const result = runCommand(snapshot, command, sessionRef.current);
                sessionRef.current = result.session;
                setSession(result.session);

                if (result.reading !== undefined) {
                  applyReading(result.reading);
                }
                if (result.edit) {
                  editorTargetRef.current = result.edit;
                  setEditorTarget(result.edit);
                }

                return {
                  entries: result.entries,
                  clear: result.clear,
                  pager: result.pager,
                };
              }}
              onCandidatesChange={setCompleteCandidates}
              onEscape={() => {
                if (readingSessionRef.current.reading.main) {
                  closeReading();
                  return true;
                }
                if (fullscreenRef.current) {
                  setFullscreen(false);
                  return true;
                }
                return false;
              }}
            />

            {completeCandidates.length > 0 ? (
              <p className="terminal-shell__complete" aria-live="polite">
                <span className="terminal-shell__complete-label">
                  {zhCN.shell.completeHint}:{" "}
                </span>
                {completeCandidates.join("  ")}
                <span className="terminal-shell__complete-hint">
                  ({zhCN.shell.completeCycle})
                </span>
              </p>
            ) : null}
          </div>
        </section>

        {hasReading ? (
          <div className="reading-row">
            <div className="reading-row__main">
              {demoting ? (
                <ReadingDemoteGhost
                  key={`demote-${readingSurfaceKey(demoting)}`}
                  surface={demoting}
                  onDone={finishDemote}
                />
              ) : null}
              {main ? (
                <ReadingPanel
                  key={readingSurfaceKey(main)}
                  surface={main}
                  leaving={leaving}
                  onClose={closeReading}
                  onLeaveDone={finishLeave}
                />
              ) : null}
            </div>
            <ReadingRail
              items={readingSession.reading.rail}
              arrivingKey={arrivingKey}
              onPromote={promoteFromRail}
              onDismiss={dismissRailItem}
            />
          </div>
        ) : null}

        {editorTarget ? (
          <EditorPanel
            key={toLocalKey(editorTarget.ref)}
            target={editorTarget}
            onDone={handleEditorDone}
          />
        ) : null}
      </div>
    </main>
  );
}
