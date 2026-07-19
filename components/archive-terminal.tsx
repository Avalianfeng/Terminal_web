"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveXterm, type ArchiveXtermHandle } from "@/components/archive-xterm";
import { ReadingPanel } from "@/components/reading-panel";
import { ReadingRail } from "@/components/reading-rail";
import { completeInput } from "@/lib/archive/complete";
import { initialEntries, runCommand } from "@/lib/archive/commands";
import { zhCN } from "@/lib/archive/i18n";
import {
  motionSpec,
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
  readingSurfaceKey,
  type ReadingState,
} from "@/lib/archive/reading-state";
import { createSession, formatShellPrompt } from "@/lib/archive/vfs";
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
  const [completeCandidates, setCompleteCandidates] = useState<string[]>([]);
  const xtermRef = useRef<ArchiveXtermHandle>(null);
  const terminalShellRef = useRef<HTMLElement>(null);
  const sessionRef = useRef(session);
  const readingStateRef = useRef(readingState);
  const leavingRef = useRef(leaving);
  const leaveFinishedRef = useRef(false);
  const leaveIntentRef = useRef<LeaveIntent>(null);
  sessionRef.current = session;
  readingStateRef.current = readingState;
  leavingRef.current = leaving;

  useEffect(() => {
    setMotionLevel(resolveMotionLevel());
  }, []);

  useEffect(() => {
    if (completeCandidates.length === 0) return;
    xtermRef.current?.relayout();
  }, [completeCandidates.length]);

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
    beginLeaveMain("close");
  }

  function applyReading(next: ReadingSurface | null) {
    if (next === null) {
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

    // 打开中若主槽正在退场，先落地退场结果再打开
    if (leavingRef.current) {
      finishLeave();
    }

    const opened = openReading(readingStateRef.current, next);
    commitReadingState(opened);
    setLeaving(false);
    leavingRef.current = false;
    leaveFinishedRef.current = false;
    leaveIntentRef.current = null;
  }

  function promoteFromRail(surface: ReadingSurface) {
    if (leavingRef.current) return;
    const opened = openReading(readingStateRef.current, surface);
    commitReadingState(opened);
  }

  function dismissRailItem(key: string) {
    commitReadingState(closeRailItem(readingStateRef.current, key));
  }

  const panelEnterMs = resolvePanelEnterMs(motionLevel);
  const panelLeaveMs = resolvePanelLeaveMs(motionLevel);
  const main = readingState.main;
  const hasReading = Boolean(main) || readingState.rail.length > 0;

  return (
    <main
      className={`archive-workspace motion-level-${motionLevel}`}
      style={
        {
          "--output-fade-ms": `${motionSpec.outputFadeMs}ms`,
          "--output-distance": `${motionSpec.outputDistancePx}px`,
          "--cursor-blink-ms": `${motionSpec.cursorBlinkMs}ms`,
          "--panel-fade-ms": `${panelEnterMs}ms`,
          "--panel-leave-ms": `${panelLeaveMs}ms`,
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
                disabled
                className="rounded border border-[color:var(--terminal-border)] px-2.5 py-1 text-xs text-[rgb(var(--tone-muted))]"
              >
                fullscreen
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
              getPrompt={() => formatShellPrompt(sessionRef.current.cwd)}
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
                };
              }}
              onCandidatesChange={setCompleteCandidates}
              onEscape={() => {
                if (readingStateRef.current.main) {
                  closeReading();
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
              onPromote={promoteFromRail}
              onDismiss={dismissRailItem}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
