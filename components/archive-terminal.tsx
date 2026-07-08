"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { initialEntries, runCommand } from "@/lib/archive/commands";
import type { ArchiveDocument, ArchiveSnapshot, TerminalEntry } from "@/lib/archive/types";

type ArchiveTerminalProps = {
  snapshot: ArchiveSnapshot;
};

function MarkdownView({ document }: { document: ArchiveDocument }) {
  const lines = document.body.split("\n");

  return (
    <article className="archive-paper">
      <div className="mb-6 flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            {document.path}
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950 md:text-5xl">
            {document.title}
          </h2>
        </div>
        {document.status ? (
          <p className="w-fit rounded-full border border-black/15 px-3 py-1 text-xs text-neutral-700">
            {document.status}
          </p>
        ) : null}
      </div>

      {document.summary ? (
        <p className="mb-8 max-w-[62ch] text-base leading-7 text-neutral-700">
          {document.summary}
        </p>
      ) : null}

      <div className="space-y-4 text-[15px] leading-7 text-neutral-800">
        {lines.map((line, index) => {
          if (line.startsWith("# ")) {
            return (
              <h3
                key={`${line}-${index}`}
                className="pt-3 text-2xl font-semibold tracking-[-0.03em] text-neutral-950"
              >
                {line.replace(/^#\s+/, "")}
              </h3>
            );
          }

          if (line.startsWith("## ")) {
            return (
              <h4
                key={`${line}-${index}`}
                className="pt-4 text-lg font-semibold tracking-[-0.02em] text-neutral-950"
              >
                {line.replace(/^##\s+/, "")}
              </h4>
            );
          }

          if (line.startsWith("- ")) {
            return (
              <p key={`${line}-${index}`} className="pl-4 text-neutral-700">
                <span className="mr-2 text-neutral-400">-</span>
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
    </article>
  );
}

function TerminalOutput({ entry }: { entry: TerminalEntry }) {
  if (entry.kind === "document") {
    return (
      <div className="terminal-entry">
        <MarkdownView document={entry.document} />
      </div>
    );
  }

  if (entry.kind === "timeline") {
    return (
      <div className="terminal-entry archive-paper">
        <p className="mb-6 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          timeline
        </p>
        <div className="space-y-7">
          {entry.entries.map((item) => (
            <section
              key={`${item.date}-${item.title}`}
              className="grid gap-2 border-t border-black/10 pt-5 md:grid-cols-[9rem_1fr]"
            >
              <time className="text-sm text-neutral-500">{item.date}</time>
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-neutral-950">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-neutral-700">
                  {item.body}
                </p>
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  const tone =
    entry.kind === "command"
      ? "text-[color:var(--archive-accent)]"
      : entry.kind === "system"
        ? "text-slate-100"
        : "text-slate-300";

  return (
    <pre className={`terminal-entry whitespace-pre-wrap text-sm leading-7 ${tone}`}>
      {entry.lines.join("\n")}
    </pre>
  );
}

export function ArchiveTerminal({ snapshot }: ArchiveTerminalProps) {
  const bootEntries = useMemo(() => initialEntries(snapshot), [snapshot]);
  const [entries, setEntries] = useState<TerminalEntry[]>(bootEntries);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const command = input.trim();
    if (!command) return;

    const result = runCommand(snapshot, command);
    setHistory((current) => [...current, command]);
    setHistoryIndex(null);
    setInput("");

    if (result.clear) {
      setEntries([]);
      return;
    }

    setEntries((current) => [...current, ...result.entries]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();

    if (history.length === 0) return;

    if (event.key === "ArrowUp") {
      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
      return;
    }

    if (historyIndex === null) return;

    const nextIndex = historyIndex + 1;
    if (nextIndex >= history.length) {
      setHistoryIndex(null);
      setInput("");
      return;
    }

    setHistoryIndex(nextIndex);
    setInput(history[nextIndex]);
  }

  return (
    <main className="min-h-[100dvh] px-4 py-5 text-slate-100 md:px-8 md:py-8">
      <section className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-[1400px] flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#090a0b]/88 shadow-[0_30px_120px_rgb(0_0_0/0.42)] backdrop-blur md:min-h-[calc(100dvh-4rem)]">
        <header className="flex h-16 items-center justify-between border-b border-white/10 px-4 md:px-6">
          <div>
            <p className="text-sm tracking-[-0.02em] text-slate-100">
              PERSONAL ARCHIVE SYSTEM
            </p>
            <p className="mt-1 text-xs text-slate-500">cylf.me</p>
          </div>
          <Link
            href="/themes"
            className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:text-white active:translate-y-px"
          >
            theme lab
          </Link>
        </header>

        <div
          ref={outputRef}
          className="flex-1 space-y-6 overflow-y-auto px-4 py-6 md:px-8 md:py-8"
          onClick={() => inputRef.current?.focus()}
        >
          {entries.length === 0 ? (
            <p className="terminal-entry text-sm text-slate-500">
              Terminal cleared. Type help to continue.
            </p>
          ) : (
            entries.map((entry) => <TerminalOutput key={entry.id} entry={entry} />)
          )}
        </div>

        <form
          onSubmit={submit}
          className="border-t border-white/10 bg-black/18 px-4 py-4 md:px-8"
        >
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <span className="shrink-0 text-[color:var(--archive-accent)]">
              visitor@archive:~$
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 border-none bg-transparent text-slate-100 caret-[color:var(--archive-accent)] outline-none placeholder:text-slate-600"
              placeholder="type help"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-label="Archive terminal command"
            />
            <span className="terminal-cursor" aria-hidden="true" />
          </label>
        </form>
      </section>
    </main>
  );
}
