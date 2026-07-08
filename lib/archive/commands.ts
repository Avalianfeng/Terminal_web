import type {
  ArchiveDocument,
  ArchiveSnapshot,
  TerminalEntry,
} from "./types";

type CommandResult = {
  entries: TerminalEntry[];
  clear?: boolean;
};

const prompt = "visitor@archive:~$";

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lineEntry(lines: string[], kind: "system" | "lines" = "lines") {
  return {
    id: id(kind),
    kind,
    lines,
  } satisfies TerminalEntry;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function allDocuments(snapshot: ArchiveSnapshot) {
  return [...snapshot.projects, ...snapshot.thoughts];
}

function findDocument(snapshot: ArchiveSnapshot, query: string) {
  const target = normalize(query);
  if (!target) return null;

  return (
    allDocuments(snapshot).find((document) => normalize(document.slug) === target) ??
    allDocuments(snapshot).find((document) =>
      normalize(document.title).includes(target),
    ) ??
    allDocuments(snapshot).find((document) =>
      document.tags.some((tag) => normalize(tag).includes(target)),
    ) ??
    null
  );
}

function formatDocumentList(documents: ArchiveDocument[]) {
  if (documents.length === 0) {
    return ["No public records found."];
  }

  return documents.flatMap((document, index) => [
    `${String(index + 1).padStart(2, "0")}  ${document.title}`,
    `    slug: ${document.slug}`,
    document.summary ? `    ${document.summary}` : "",
  ]).filter(Boolean);
}

function search(snapshot: ArchiveSnapshot, query: string) {
  const target = normalize(query);
  if (!target) {
    return lineEntry(["Usage: search <keyword>"]);
  }

  const results = allDocuments(snapshot).filter((document) => {
    const haystack = normalize(
      [
        document.title,
        document.summary,
        document.body,
        document.tags.join(" "),
        document.slug,
      ].join(" "),
    );

    return haystack.includes(target);
  });

  if (results.length === 0) {
    return lineEntry([
      `No public record matched "${query}".`,
      "Try: projects, thoughts, timeline",
    ]);
  }

  return lineEntry([
    `Search results for "${query}":`,
    "",
    ...formatDocumentList(results),
  ]);
}

export function initialEntries(snapshot: ArchiveSnapshot): TerminalEntry[] {
  return [
    {
      id: "system-boot",
      kind: "system",
      lines: [
        "PERSONAL ARCHIVE SYSTEM",
        "",
        `Person: ${snapshot.person.name}`,
        "Public interface: Terminal",
        `Archive index ready: ${snapshot.generatedAt}`,
        "",
        "Type help to inspect available commands.",
      ],
    },
  ];
}

export function runCommand(
  snapshot: ArchiveSnapshot,
  rawCommand: string,
): CommandResult {
  const trimmed = rawCommand.trim();
  const [command = "", ...args] = trimmed.split(/\s+/);
  const rest = args.join(" ");

  if (!trimmed) {
    return { entries: [] };
  }

  const commandEcho: TerminalEntry = {
    id: id("command"),
    kind: "command",
    lines: [`${prompt} ${trimmed}`],
  };

  switch (normalize(command)) {
    case "help":
      return {
        entries: [
          commandEcho,
          lineEntry([
            "available commands:",
            "",
            "about       show person profile",
            "projects    list public projects",
            "thoughts    list public notes and essays",
            "timeline    show archive timeline",
            "search      search public records",
            "open        open a project or thought",
            "themes      open visual experiment index",
            "clear       clear current terminal session",
          ]),
        ],
      };

    case "about":
      return {
        entries: [
          commandEcho,
          lineEntry([
            "Name:",
            snapshot.person.name,
            "",
            "Description:",
            snapshot.person.description,
            "",
            "Current focus:",
            snapshot.person.currentFocus,
            "",
            "Links:",
            ...snapshot.person.links.map((link) => `${link.label}: ${link.href}`),
          ]),
        ],
      };

    case "projects":
      return {
        entries: [commandEcho, lineEntry(formatDocumentList(snapshot.projects))],
      };

    case "thoughts":
      return {
        entries: [commandEcho, lineEntry(formatDocumentList(snapshot.thoughts))],
      };

    case "timeline":
      return {
        entries: [
          commandEcho,
          {
            id: id("timeline"),
            kind: "timeline",
            entries: snapshot.timeline,
          },
        ],
      };

    case "search":
      return {
        entries: [commandEcho, search(snapshot, rest)],
      };

    case "open": {
      const document = findDocument(snapshot, rest);
      if (!document) {
        return {
          entries: [
            commandEcho,
            lineEntry([
              rest
                ? `Cannot open "${rest}".`
                : "Usage: open <project-or-thought>",
              "Try: projects, thoughts, search <keyword>",
            ]),
          ],
        };
      }

      return {
        entries: [
          commandEcho,
          {
            id: id("document"),
            kind: "document",
            document,
          },
        ],
      };
    }

    case "themes":
      return {
        entries: [
          commandEcho,
          lineEntry([
            "Theme laboratory:",
            "/themes",
            "",
            "Current production direction:",
            "black terminal shell plus light archive paper cards.",
          ]),
        ],
      };

    case "clear":
      return {
        clear: true,
        entries: [commandEcho],
      };

    default:
      return {
        entries: [
          commandEcho,
          lineEntry([
            `Unknown command: ${command}`,
            "Type help to inspect available commands.",
          ]),
        ],
      };
  }
}
