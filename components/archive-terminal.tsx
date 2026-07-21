"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveXterm, type ArchiveXtermHandle } from "@/components/archive-xterm";
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
import {
  clearReadingState,
  closeMain,
  closeRailItem,
  emptyReadingState,
  openReading,
  openReadingMany,
  readingSurfaceKey,
  type ReadingState,
} from "@/lib/archive/reading-state";
import { createSession, formatShellPromptTokens } from "@/lib/archive/vfs";
import type {
  ArchiveSnapshot,
  ReadingSurface,
  TerminalSession,
} from "@/lib/archive/types";

type ArchiveTerminalProps = {
  snapshot: ArchiveSnapshot;
};

type LeaveIntent = "close" | "clear" | null;

export function ArchiveTerminal({ snapshot }: ArchiveTerminalProps) {
  const [motionLevel, setMotionLevel] = useState<MotionLevel>(1);
  const bootEntries = useMemo(() => initialEntries(snapshot), [snapshot]);

  const [session, setSession] = useState<TerminalSession>(() => createSession());
  const [readingState, setReadingState] = useState<ReadingState>(emptyReadingState);
  const [leaving, setLeaving] = useState(false);
  const [demoting, setDemoting] = useState<ReadingSurface | null>(null);
  const [completeCandidates, setCompleteCandidates] = useState<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const xtermRef = useRef<ArchiveXtermHandle>(null);
  const terminalShellRef = useRef<HTMLElement>(null);
  const sessionRef = useRef(session);
  const readingStateRef = useRef(readingState);
  const leavingRef = useRef(leaving);
  const fullscreenRef = useRef(fullscreen);
  const leaveFinishedRef = useRef(false);
  const leaveIntentRef = useRef<LeaveIntent>(null);
  sessionRef.current = session;
  readingStateRef.current = readingState;
  leavingRef.current = leaving;
  fullscreenRef.current = fullscreen;

  useEffect(() => {
    setMotionLevel(resolveMotionLevel());
  }, []);

  useEffect(() => {
    if (completeCandidates.length === 0) return;
    xtermRef.current?.relayout();
  }, [completeCandidates.length]);

  useEffect(() => {
    xtermRef.current?.relayout();
    if (fullscreen) {
      terminalShellRef.current?.scrollIntoView({
        behavior: resolveScrollBehavior(motionLevel),
        block: "start",
        inline: "nearest",
      });
    }
  }, [fullscreen, motionLevel]);

  /** 焦点不在 xterm 时仍可用 Esc 退出 fullscreen（阅读面板优先由自身处理 Esc） */
  useEffect(() => {
    if (!fullscreen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (readingStateRef.current.main) return;
      event.preventDefault();
      setFullscreen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  function toggleFullscreen() {
    setFullscreen((current) => !current);
  }

  function revealTerminal() {
    terminalShellRef.current?.scrollIntoView({
      behavior: resolveScrollBehavior(motionLevel),
      block: "start",
      inline: "nearest",
    });
    xtermRef.current?.focus({ preventScroll: true });
  }

  function commitReadingState(next: ReadingState) {
    readingStateRef.current = next;
    setReadingState(next);
  }

  function finishLeave() {
    if (leaveFinishedRef.current) return;
    leaveFinishedRef.current = true;
    setLeaving(false);
    leavingRef.current = false;

    const intent = leaveIntentRef.current;
    leaveIntentRef.current = null;

    if (intent === "clear") {
      commitReadingState(clearReadingState());
      xtermRef.current?.focus({ preventScroll: true });
      return;
    }

    // close main：有 rail 则晋升，否则清空并回终端
    const next = closeMain(readingStateRef.current);
    commitReadingState(next);
    if (!next.main) {
      xtermRef.current?.focus({ preventScroll: true });
    }
  }

  function beginLeaveMain(intent: Exclude<LeaveIntent, null>) {
    if (!readingStateRef.current.main || leavingRef.current) return;
    leaveFinishedRef.current = false;
    leaveIntentRef.current = intent;

    const willPromote =
      intent === "close" && readingStateRef.current.rail.length > 0;

    if (resolvePanelLeaveMs(motionLevel) <= 0) {
      if (!willPromote) revealTerminal();
      finishLeave();
      return;
    }

    setLeaving(true);
    leavingRef.current = true;
    if (!willPromote) {
      revealTerminal();
    }
  }

  function closeReading() {
    setDemoting(null);
    beginLeaveMain("close");
  }

  /** Phase 2b：有旧主槽且换文时，幽灵 demote + 新主槽 Phase 1 进场并行 */
  function swapReading(surfaces: ReadingSurface[]) {
    if (surfaces.length === 0) return;

    if (leavingRef.current) {
      finishLeave();
    }

    const prevMain = readingStateRef.current.main;
    const opened =
      surfaces.length === 1
        ? openReading(readingStateRef.current, surfaces[0]!)
        : openReadingMany(readingStateRef.current, surfaces);

    const nextMain = opened.main;
    const willDemote =
      Boolean(prevMain) &&
      Boolean(nextMain) &&
      readingSurfaceKey(prevMain!) !== readingSurfaceKey(nextMain!) &&
      resolveDemoteMs(motionLevel) > 0;

    commitReadingState(opened);
    setLeaving(false);
    leavingRef.current = false;
    leaveFinishedRef.current = false;
    leaveIntentRef.current = null;

    if (willDemote && prevMain) {
      setDemoting(prevMain);
    } else {
      setDemoting(null);
    }
  }

  function applyReading(next: ReadingSurface | ReadingSurface[] | null) {
    if (next === null) {
      setDemoting(null);
      // clear：立刻清空 rail，主槽走退场
      commitReadingState({
        main: readingStateRef.current.main,
        rail: [],
      });
      if (!readingStateRef.current.main) {
        commitReadingState(clearReadingState());
        revealTerminal();
        return;
      }
      beginLeaveMain("clear");
      return;
    }

    swapReading(Array.isArray(next) ? next : [next]);
  }

  function promoteFromRail(surface: ReadingSurface) {
    if (leavingRef.current) return;
    swapReading([surface]);
  }

  function dismissRailItem(key: string) {
    commitReadingState(closeRailItem(readingStateRef.current, key));
  }

  function finishDemote() {
    setDemoting(null);
  }

  const panelEnterMs = resolvePanelEnterMs(motionLevel);
  const panelLeaveMs = resolvePanelLeaveMs(motionLevel);
  const demoteMs = resolveDemoteMs(motionLevel);
  const main = readingState.main;
  const hasReading = Boolean(main) || readingState.rail.length > 0 || Boolean(demoting);
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
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--terminal-border)] px-4 md:px-5">
            <div>
              <p className="text-sm tracking-[-0.02em] text-[rgb(var(--tone-normal))]">
                {zhCN.shell.title}
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--tone-muted))]">
                {zhCN.shell.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
                className="rounded border border-[color:var(--terminal-border)] px-2.5 py-1 text-xs text-[rgb(var(--tone-normal))] transition hover:border-white/25 hover:text-white active:translate-y-px"
              >
                {fullscreen
                  ? zhCN.shell.fullscreenExit
                  : zhCN.shell.fullscreen}
              </button>
              <Link
                href="/themes"
                className="rounded border border-[color:var(--terminal-border)] px-2.5 py-1 text-xs text-[rgb(var(--tone-normal))] transition hover:border-white/25 hover:text-white active:translate-y-px"
              >
                {zhCN.shell.themeLab}
              </Link>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col">
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

                return {
                  entries: result.entries,
                  clear: result.clear,
                  pager: result.pager,
                };
              }}
              onCandidatesChange={setCompleteCandidates}
              onEscape={() => {
                if (readingStateRef.current.main) {
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
              <p
                className="shrink-0 border-t border-[color:var(--terminal-border)] px-4 py-2 text-xs text-[rgb(var(--tone-muted))] md:px-5"
                aria-live="polite"
              >
                <span className="text-[rgb(var(--tone-hint))]">
                  {zhCN.shell.completeHint}:{" "}
                </span>
                {completeCandidates.join("  ")}
                <span className="ml-2 text-[rgb(var(--tone-hint))]">
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
              items={readingState.rail}
              arrivingKey={arrivingKey}
              onPromote={promoteFromRail}
              onDismiss={dismissRailItem}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
