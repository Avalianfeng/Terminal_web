"use client";

import Link from "next/link";
import {
  CSSProperties,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReadingPanel } from "@/components/reading-panel";
import { completeInput } from "@/lib/archive/complete";
import { initialEntries, runCommand } from "@/lib/archive/commands";
import { zhCN } from "@/lib/archive/i18n";
import { motionSpec, resolveMotionLevel } from "@/lib/archive/motion-spec";
import { createSession, formatShellPrompt } from "@/lib/archive/vfs";
import type {
  ArchiveSnapshot,
  ReadingSurface,
  TerminalLine,
  TerminalSession,
  TerminalToken,
  TerminalEntry,
} from "@/lib/archive/types";

type ArchiveTerminalProps = {
  snapshot: ArchiveSnapshot;
};

function tokenClass(tone?: TerminalToken["tone"]) {
  switch (tone) {
    case "prompt":
      return "terminal-tone-prompt";
    case "command":
      return "terminal-tone-command";
    case "hint":
      return "terminal-tone-hint";
    case "error":
      return "terminal-tone-error";
    case "success":
      return "terminal-tone-success";
    case "path":
      return "terminal-tone-path";
    case "muted":
      return "terminal-tone-muted";
    default:
      return "terminal-tone-normal";
  }
}

function TokenLineView({ line }: { line: TerminalLine }) {
  if (line.tokens.length === 0) return <span>&nbsp;</span>;

  return (
    <>
      {line.tokens.map((segment, index) => (
        <span key={`${segment.text}-${index}`} className={tokenClass(segment.tone)}>
          {segment.text}
        </span>
      ))}
    </>
  );
}

function TokenLines({
  lines,
  toneClass,
}: {
  lines: TerminalLine[];
  toneClass?: string;
}) {
  return (
    <pre
      className={`terminal-entry whitespace-pre-wrap text-sm leading-7 ${
        toneClass ?? "text-slate-300"
      }`}
    >
      {lines.map((line, index) => (
        <div key={index}>
          <TokenLineView line={line} />
        </div>
      ))}
    </pre>
  );
}

function TerminalOutput({ entry }: { entry: TerminalEntry }) {
  const tone =
    entry.kind === "command"
      ? "text-[color:var(--archive-accent)]"
      : entry.kind === "system"
        ? "text-slate-100"
        : "text-slate-300";

  return <TokenLines lines={entry.lines} toneClass={tone} />;
}

export function ArchiveTerminal({ snapshot }: ArchiveTerminalProps) {
  const motionLevel = resolveMotionLevel();

  const bootEntries = useMemo(() => initialEntries(snapshot), [snapshot]);
  const [entries, setEntries] = useState<TerminalEntry[]>(bootEntries);
  const [input, setInput] = useState("");
  const [session, setSession] = useState<TerminalSession>(() => createSession());
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [reading, setReading] = useState<ReadingSurface | null>(null);
  const [completeCandidates, setCompleteCandidates] = useState<string[]>([]);
  const [completeCycle, setCompleteCycle] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const appendQueueRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!outputRef.current || !stickToBottomRef.current) return;

    const scroll = () => {
      outputRef.current?.scrollTo({
        top: outputRef.current.scrollHeight,
        behavior: motionSpec.scrollBehavior,
      });
    };

    requestAnimationFrame(scroll);
    requestAnimationFrame(scroll);
  }, [entries]);

  function closeReading() {
    setReading(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /** 轻量 streaming output：条目短间隔入列，制造加载感（非真 PTY 流）。 */
  function appendEntries(nextEntries: TerminalEntry[]) {
    if (nextEntries.length === 0) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || nextEntries.length === 1 || motionSpec.lineDelayMs <= 0) {
      setEntries((current) => [...current, ...nextEntries]);
      return;
    }

    const queueId = ++appendQueueRef.current;
    nextEntries.forEach((entry, index) => {
      window.setTimeout(() => {
        if (appendQueueRef.current !== queueId) return;
        setEntries((current) => [...current, entry]);
      }, index * motionSpec.lineDelayMs);
    });
  }

  function resetCompletion() {
    setCompleteCandidates([]);
    setCompleteCycle(null);
  }

  function applyTabCompletion() {
    /**
     * Tab 补全流程（你会直接摸到这几个词）：
     * 1) prefix match — 按已输入前缀筛命令/路径/slug
     * 2) longest common prefix — 多候选先补公共前缀
     * 3) cycle — 再按 Tab 在完整候选间轮换
     */
    let result = completeInput(input, snapshot, session.cwd, completeCycle);

    if (!result.applied && result.candidates.length > 1) {
      const startIndex = completeCycle ?? 0;
      result = completeInput(input, snapshot, session.cwd, startIndex);
      setCompleteCycle(startIndex + 1);
    } else if (result.applied && result.candidates.length > 1 && completeCycle !== null) {
      setCompleteCycle(completeCycle + 1);
    } else if (result.candidates.length <= 1) {
      setCompleteCycle(null);
    }

    if (result.applied) {
      setInput(result.input);
    }
    setCompleteCandidates(result.candidates.length > 1 ? result.candidates : []);
  }

  function executeCommand() {
    const command = input.trim();
    if (!command) return;

    const result = runCommand(snapshot, command, session);
    setHistory((current) => [...current, command]);
    setHistoryIndex(null);
    setInput("");
    resetCompletion();
    setSession(result.session);

    if (result.reading !== undefined) {
      setReading(result.reading);
    }

    if (result.clear) {
      appendQueueRef.current += 1;
      setEntries([]);
      return;
    }

    appendEntries(result.entries);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      applyTabCompletion();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      executeCommand();
      return;
    }

    if (event.key === "Escape") {
      if (completeCandidates.length > 0) {
        event.preventDefault();
        resetCompletion();
        return;
      }
      if (reading) {
        event.preventDefault();
        closeReading();
      }
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();

    if (history.length === 0) return;

    if (event.key === "ArrowUp") {
      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex] ?? "");
      resetCompletion();
      return;
    }

    if (historyIndex === null) return;

    const nextIndex = historyIndex + 1;
    if (nextIndex >= history.length) {
      setHistoryIndex(null);
      setInput("");
      resetCompletion();
      return;
    }

    setHistoryIndex(nextIndex);
    setInput(history[nextIndex] ?? "");
    resetCompletion();
  }

  return (
    <main
      className={`archive-workspace motion-level-${motionLevel}`}
      style={
        {
          "--output-fade-ms": `${motionSpec.outputFadeMs}ms`,
          "--output-distance": `${motionSpec.outputDistancePx}px`,
          "--cursor-blink-ms": `${motionSpec.cursorBlinkMs}ms`,
          "--panel-fade-ms": `${motionSpec.cardFadeMs}ms`,
        } as CSSProperties
      }
    >
      {/* 外区：浅亮 Surface，与终端 Spatial separation */}
      <div className="archive-workspace__stage">
        {reading ? <ReadingPanel surface={reading} onClose={closeReading} /> : null}

        <section className="terminal-shell">
          <header className="flex h-14 items-center justify-between border-b border-white/10 px-4 md:px-5">
            <div>
              <p className="text-sm tracking-[-0.02em] text-slate-100">
                {zhCN.shell.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{zhCN.shell.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="rounded border border-white/10 px-2.5 py-1 text-xs text-slate-600"
              >
                fullscreen
              </button>
              <Link
                href="/themes"
                className="rounded border border-white/12 px-2.5 py-1 text-xs text-slate-300 transition hover:border-white/25 hover:text-white active:translate-y-px"
              >
                {zhCN.shell.themeLab}
              </Link>
            </div>
          </header>

          <div
            ref={outputRef}
            className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-5 md:py-6"
            onClick={() => inputRef.current?.focus()}
            onScroll={(event) => {
              const element = event.currentTarget;
              const distanceToBottom =
                element.scrollHeight - element.scrollTop - element.clientHeight;
              stickToBottomRef.current = distanceToBottom < 24;
            }}
          >
            {entries.length === 0 ? (
              <p className="terminal-entry text-sm text-slate-500">
                {zhCN.shell.cleared}
              </p>
            ) : (
              entries.map((entry) => <TerminalOutput key={entry.id} entry={entry} />)
            )}
          </div>

          <div className="border-t border-white/10 bg-black/25 px-4 py-3.5 md:px-5">
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <span className="shrink-0 text-[color:var(--archive-accent)]">
                {formatShellPrompt(session.cwd)}
              </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  resetCompletion();
                }}
                onKeyDown={onKeyDown}
                className="min-w-0 flex-1 border-none bg-transparent text-slate-100 caret-[color:var(--archive-accent)] outline-none placeholder:text-slate-600"
                placeholder={zhCN.shell.placeholder}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-label="Archive terminal command"
              />
              <span className="terminal-cursor" aria-hidden="true" />
            </label>
            {completeCandidates.length > 0 ? (
              <p
                className="mt-2 truncate text-xs text-slate-500"
                aria-live="polite"
              >
                <span className="text-slate-600">{zhCN.shell.completeHint}: </span>
                {completeCandidates.join("  ")}
                <span className="ml-2 text-slate-600">
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
