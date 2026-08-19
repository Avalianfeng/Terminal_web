import type { TerminalEntry, TerminalLine, TerminalToken } from "./types";

export type CliResultPart = {
  text: string;
  tone?: "muted" | "normal" | "path";
};

export type CliEvent =
  | { genre: "usage"; syntax: string }
  | { genre: "result"; parts: CliResultPart[][] }
  | { genre: "error"; prog: string; message: string; hint?: string }
  | { genre: "status"; text: string };

function makeEntryId(): string {
  return `cli-${Math.random().toString(36).slice(2, 11)}`;
}

function lineFromTokens(tokens: TerminalToken[]): TerminalLine {
  return { tokens };
}

function linesEntry(kind: "lines", lines: TerminalLine[]): TerminalEntry {
  return { id: makeEntryId(), kind, lines };
}

function statusEntry(text: string): TerminalEntry {
  return {
    id: makeEntryId(),
    kind: "status",
    lines: [lineFromTokens([{ text, tone: "hint" }])],
  };
}

export function renderCliEvent(event: CliEvent): TerminalEntry {
  switch (event.genre) {
    case "usage":
      return linesEntry("lines", [
        lineFromTokens([{ text: `usage: ${event.syntax}`, tone: "muted" }]),
      ]);
    case "result":
      return linesEntry(
        "lines",
        event.parts.map((lineParts) =>
          lineFromTokens(
            lineParts.map((part) => ({
              text: part.text,
              tone: part.tone ?? "normal",
            })),
          ),
        ),
      );
    case "error": {
      const lines: TerminalLine[] = [
        lineFromTokens([{ text: `${event.prog}: ${event.message}`, tone: "error" }]),
      ];
      if (event.hint !== undefined) {
        lines.push(lineFromTokens([{ text: event.hint, tone: "hint" }]));
      }
      return linesEntry("lines", lines);
    }
    case "status":
      return statusEntry(event.text);
  }
}

export function renderCliEvents(events: CliEvent[]): TerminalEntry[] {
  return events.map(renderCliEvent);
}

export function entryPlainText(entry: TerminalEntry): string {
  return entry.lines
    .map((line) => line.tokens.map((token) => token.text).join(""))
    .join("\n");
}

export function formatProgressLine(
  name: string,
  percent: number,
  barWidth = 10,
): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  let bar: string;
  if (pct >= 100) {
    bar = "=".repeat(barWidth);
  } else {
    const equals = Math.min(barWidth - 1, Math.round((pct / 100) * barWidth));
    const spaces = barWidth - equals - 1;
    bar = "=".repeat(equals) + ">" + " ".repeat(spaces);
  }
  return `${name}  ${pct}% [${bar}]`;
}

export function musicPlaying(track: string, playlist?: string): TerminalEntry[] {
  const events: CliEvent[] = [
    {
      genre: "result",
      parts: [
        [
          { text: "playing ", tone: "muted" },
          { text: track, tone: "path" },
        ],
      ],
    },
  ];
  if (playlist !== undefined) {
    events.push({
      genre: "result",
      parts: [
        [
          { text: "in ", tone: "muted" },
          { text: playlist, tone: "path" },
        ],
      ],
    });
  }
  return renderCliEvents(events);
}

export function musicNoPlaylist(query: string): TerminalEntry {
  return renderCliEvent({
    genre: "error",
    prog: "music",
    message: `no playlist matches '${query}'`,
    hint: `Try 'music ls' or 'music play --song ${query}'.`,
  });
}

export function musicNoTrack(query: string): TerminalEntry {
  return renderCliEvent({
    genre: "error",
    prog: "music",
    message: `no track matches '${query}'`,
  });
}

export function musicPlaylistUsage(): TerminalEntry {
  return renderCliEvent({
    genre: "usage",
    syntax: "music playlist next|prev|<name>",
  });
}

export function musicSwitchedBrowse(name: string): TerminalEntry {
  return renderCliEvent({
    genre: "result",
    parts: [
      [
        { text: "switched browse playlist to ", tone: "muted" },
        { text: `'${name}'`, tone: "path" },
      ],
    ],
  });
}

export function musicSaved(title: string, file: string): TerminalEntry {
  return renderCliEvent({
    genre: "result",
    parts: [
      [
        { text: "saved ", tone: "muted" },
        { text: `'${title}'`, tone: "path" },
        { text: ` (${file})`, tone: "normal" },
      ],
    ],
  });
}

export function musicDownloadSkipped(label: string): TerminalEntry {
  return renderCliEvent({
    genre: "result",
    parts: [
      [
        { text: "skipped ", tone: "muted" },
        { text: label, tone: "path" },
      ],
    ],
  });
}

export function musicDownloadAborted(): TerminalEntry {
  return renderCliEvent({
    genre: "result",
    parts: [[{ text: "download aborted", tone: "normal" }]],
  });
}

export function musicRemoved(title: string): TerminalEntry {
  return renderCliEvent({
    genre: "result",
    parts: [
      [
        { text: "removed ", tone: "muted" },
        { text: `'${title}'`, tone: "path" },
      ],
    ],
  });
}

export function musicError(message: string, hint?: string): TerminalEntry {
  return renderCliEvent({
    genre: "error",
    prog: "music",
    message,
    hint,
  });
}

export function musicProgress(name: string, percent: number): TerminalEntry {
  return renderCliEvent({
    genre: "status",
    text: formatProgressLine(name, percent),
  });
}
