"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveXterm, type ArchiveXtermHandle } from "@/components/archive-xterm";
import { ReadingPanel } from "@/components/reading-panel";
import { completeInput } from "@/lib/archive/complete";
import { initialEntries, runCommand } from "@/lib/archive/commands";
import { zhCN } from "@/lib/archive/i18n";
import { motionSpec, resolveMotionLevel } from "@/lib/archive/motion-spec";
import { createSession, formatShellPrompt } from "@/lib/archive/vfs";
import type {
  ArchiveSnapshot,
  ReadingSurface,
  TerminalSession,
} from "@/lib/archive/types";

type ArchiveTerminalProps = {
  snapshot: ArchiveSnapshot;
};

export function ArchiveTerminal({ snapshot }: ArchiveTerminalProps) {
  const motionLevel = resolveMotionLevel();
  const bootEntries = useMemo(() => initialEntries(snapshot), [snapshot]);

  const [session, setSession] = useState<TerminalSession>(() => createSession());
  const [reading, setReading] = useState<ReadingSurface | null>(null);
  const [completeCandidates, setCompleteCandidates] = useState<string[]>([]);
  const xtermRef = useRef<ArchiveXtermHandle>(null);
  const sessionRef = useRef(session);
  const readingRef = useRef(reading);
  sessionRef.current = session;
  readingRef.current = reading;

  useEffect(() => {
    xtermRef.current?.relayout();
  }, [reading, completeCandidates.length]);

  function closeReading() {
    setReading(null);
    requestAnimationFrame(() => {
      xtermRef.current?.relayout();
      xtermRef.current?.focus();
    });
  }

  return (
    <main
      className={`archive-workspace motion-level-${motionLevel}${
        reading ? " is-reading" : ""
      }`}
      style={
        {
          "--output-fade-ms": `${motionSpec.outputFadeMs}ms`,
          "--output-distance": `${motionSpec.outputDistancePx}px`,
          "--cursor-blink-ms": `${motionSpec.cursorBlinkMs}ms`,
          "--panel-fade-ms": `${motionSpec.cardFadeMs}ms`,
        } as CSSProperties
      }
    >
      <div className="archive-workspace__stage">
        {reading ? <ReadingPanel surface={reading} onClose={closeReading} /> : null}

        <section className="terminal-shell">
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
              lineDelayMs={motionSpec.lineDelayMs}
              getPrompt={() => formatShellPrompt(sessionRef.current.cwd)}
              getComplete={(input, cycle) =>
                completeInput(input, snapshot, sessionRef.current.cwd, cycle)
              }
              onCommand={(command) => {
                const result = runCommand(snapshot, command, sessionRef.current);
                sessionRef.current = result.session;
                setSession(result.session);

                if (result.reading !== undefined) {
                  setReading(result.reading);
                }

                return {
                  entries: result.entries,
                  clear: result.clear,
                };
              }}
              onCandidatesChange={setCompleteCandidates}
              onEscape={() => {
                if (readingRef.current) {
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
      </div>
    </main>
  );
}
