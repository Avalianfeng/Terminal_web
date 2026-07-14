import type {
  ArchiveDocument,
  ArchiveSnapshot,
  ReadingSurface,
  TerminalLine,
  TerminalSession,
  TerminalEntry,
  TerminalToken,
} from "./types";
import { zhCN } from "./i18n";
import { resolveAlias } from "./aliases";
import {
  createSession,
  createVfs,
  formatShellPrompt,
  listNode,
  resolveVfsPath,
  treeLines,
} from "./vfs";

type CommandResult = {
  entries: TerminalEntry[];
  clear?: boolean;
  session: TerminalSession;
  /** 打开外区阅读面板；与终端输出分离（Spatial separation）。 */
  reading?: ReadingSurface | null;
};

type LinuxHandlerResult = {
  entries: TerminalEntry[];
  session: TerminalSession;
  handled: boolean;
  reading?: ReadingSurface | null;
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function token(text: string, tone: TerminalToken["tone"] = "normal"): TerminalToken {
  return { text, tone };
}

function line(tokens: TerminalToken[] | string): TerminalLine {
  if (typeof tokens === "string") {
    return { tokens: [token(tokens)] };
  }
  return { tokens };
}

function lines(...items: (TerminalToken[] | string)[]) {
  return items.map((item) => line(item));
}

function lineEntry(
  lineItems: TerminalLine[],
  kind: "system" | "lines" = "lines",
): TerminalEntry {
  return {
    id: id(kind),
    kind,
    lines: lineItems,
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
    return lines([token(zhCN.labels.noRecord, "muted")]);
  }

  return documents.flatMap((document, index) => {
    const itemLines = [
      line([token(`${String(index + 1).padStart(2, "0")}  `, "muted"), token(document.title)]),
      line([token(`    ${zhCN.labels.slug}: `, "muted"), token(document.slug, "path")]),
    ];
    if (document.summary) {
      itemLines.push(line([token(`    ${document.summary}`, "hint")]));
    }
    return itemLines;
  });
}

function search(snapshot: ArchiveSnapshot, query: string) {
  const target = normalize(query);
  if (!target) {
    return lineEntry(lines([token(zhCN.errors.usageSearch, "hint")]));
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
      line([token(`${zhCN.errors.emptySearch}: "${query}"`, "error")]),
      line([token(zhCN.errors.tryProjectsThoughts, "hint")]),
    ]);
  }

  return lineEntry(
    [
      line([token(`${zhCN.labels.searchResults}: "${query}"`, "success")]),
      line(""),
      ...formatDocumentList(results),
    ],
  );
}

function toDocumentEntry(snapshot: ArchiveSnapshot, nodePath: string) {
  if (nodePath.startsWith("/projects/")) {
    const slug = nodePath.replace("/projects/", "");
    return snapshot.projects.find((item) => item.slug === slug) ?? null;
  }
  if (nodePath.startsWith("/thoughts/")) {
    const slug = nodePath.replace("/thoughts/", "");
    return snapshot.thoughts.find((item) => item.slug === slug) ?? null;
  }
  return null;
}

function echoCommand(command: string, cwd: string): TerminalEntry {
  return {
    id: id("command"),
    kind: "command",
    lines: lines(
      [
        token(`${formatShellPrompt(cwd)} `, "prompt"),
        token(command, "command"),
      ],
    ),
  };
}

function openSuggestions(snapshot: ArchiveSnapshot) {
  const slugs = allDocuments(snapshot).map((document) => document.slug);
  const examples = ["timeline", ...slugs].slice(0, 4).join(", ");
  return `${zhCN.errors.tryOpenHint} ${examples}`;
}

function systemError(message: string, hint?: string) {
  const rows = [line([token(message, "error")])];
  if (hint) rows.push(line([token(hint, "hint")]));
  return lineEntry(rows);
}

function handleLinuxCommand(
  snapshot: ArchiveSnapshot,
  command: string,
  args: string[],
  session: TerminalSession,
): LinuxHandlerResult {
  const root = createVfs(snapshot);
  const cwdNode = resolveVfsPath(root, session.cwd, ".");

  if (!cwdNode) {
    return {
      entries: [systemError(`${zhCN.errors.invalidPath}: ${session.cwd}`)],
      session: { ...session, cwd: "/" },
      handled: true,
    };
  }

  if (command === "pwd") {
    return {
      entries: [lineEntry(lines([token(session.cwd, "path")]))],
      session,
      handled: true,
    };
  }

  if (command === "ls") {
    const target = args[0] ?? ".";
    const node = resolveVfsPath(root, session.cwd, target);
    if (!node) {
      return {
        entries: [systemError(`${zhCN.errors.invalidPath}: ${target}`)],
        session,
        handled: true,
      };
    }

    if (node.type === "dir") {
      const entries = listNode(node).map((child) =>
        line([
          token(child.name, child.type === "dir" ? "path" : "normal"),
          token(child.type === "dir" ? "/" : "", "muted"),
        ]),
      );
      return {
        entries: [lineEntry(entries.length > 0 ? entries : lines([token("(empty)", "muted")]))],
        session,
        handled: true,
      };
    }

    return {
      entries: [lineEntry(lines([token(node.name, "normal")]))],
      session,
      handled: true,
    };
  }

  if (command === "cd") {
    const target = args[0] ?? "/";
    const node = resolveVfsPath(root, session.cwd, target);
    if (!node) {
      return {
        entries: [systemError(`${zhCN.errors.invalidPath}: ${target}`)],
        session,
        handled: true,
      };
    }
    if (node.type !== "dir") {
      return {
        entries: [systemError(zhCN.errors.notDirectory)],
        session,
        handled: true,
      };
    }
    return {
      entries: [lineEntry(lines([token(node.path, "path")]))],
      session: { ...session, cwd: node.path },
      handled: true,
    };
  }

  if (command === "tree") {
    const target = args[0] ?? ".";
    const node = resolveVfsPath(root, session.cwd, target);
    if (!node) {
      return {
        entries: [systemError(`${zhCN.errors.invalidPath}: ${target}`)],
        session,
        handled: true,
      };
    }
    return {
      entries: [lineEntry(treeLines(node).map((row) => line([token(row, "muted")])))],
      session,
      handled: true,
    };
  }

  if (command === "cat") {
    const target = args[0];
    if (!target) {
      return {
        entries: [systemError(zhCN.errors.usageOpen)],
        session,
        handled: true,
      };
    }
    const node = resolveVfsPath(root, session.cwd, target);
    if (!node) {
      return {
        entries: [systemError(`${zhCN.errors.invalidPath}: ${target}`)],
        session,
        handled: true,
      };
    }
    if (node.type === "timeline") {
      return {
        entries: [
          lineEntry(lines([token(zhCN.reading.openedTimeline, "hint")])),
        ],
        session: { ...session, selectedPath: node.path },
        handled: true,
        reading: { kind: "timeline", entries: snapshot.timeline },
      };
    }
    if (node.type === "person") {
      return {
        entries: [
          lineEntry(
            lines(
              [token(`${zhCN.about.name} `, "muted"), token(snapshot.person.name)],
              [token(`${zhCN.about.description} `, "muted"), token(snapshot.person.description)],
              [token(`${zhCN.about.focus} `, "muted"), token(snapshot.person.currentFocus)],
            ),
          ),
        ],
        session: { ...session, selectedPath: node.path },
        handled: true,
      };
    }

    const document = toDocumentEntry(snapshot, node.path);
    if (!document) {
      return {
        entries: [systemError(zhCN.errors.notFile)],
        session,
        handled: true,
      };
    }

    return {
      entries: [
        lineEntry(
          lines([
            token(zhCN.reading.openedPrefix, "hint"),
            token(document.title, "path"),
          ]),
        ),
      ],
      session: { ...session, selectedPath: node.path },
      handled: true,
      reading: { kind: "document", document },
    };
  }

  if (command === "whoami") {
    return {
      entries: [lineEntry(lines([token(snapshot.person.name, "success")]))],
      session,
      handled: true,
    };
  }

  if (command === "history") {
    const historyLines = session.commandHistory.map((item, index) =>
      line([token(`${String(index + 1).padStart(2, "0")}  `, "muted"), token(item, "command")]),
    );
    return {
      entries: [lineEntry(historyLines.length ? historyLines : lines([token("(empty)", "muted")]))],
      session,
      handled: true,
    };
  }

  return { entries: [], session, handled: false };
}

export function initialEntries(snapshot: ArchiveSnapshot): TerminalEntry[] {
  return [
    {
      id: "system-boot",
      kind: "system",
      lines: lines(
        [token(zhCN.shell.title, "success")],
        "",
        [token(`${zhCN.boot.person}: `, "muted"), token(snapshot.person.name)],
        [token(zhCN.boot.interface, "hint")],
        [token(`${zhCN.boot.ready}: `, "muted"), token(snapshot.generatedAt, "path")],
        "",
        [token(zhCN.boot.hint, "hint")],
      ),
    },
  ];
}

export function runCommand(
  snapshot: ArchiveSnapshot,
  rawCommand: string,
  session: TerminalSession = createSession(),
): CommandResult {
  const trimmed = rawCommand.trim();
  const [rawCommandName = "", ...args] = trimmed.split(/\s+/);
  const command = resolveAlias(normalize(rawCommandName));
  const rest = args.join(" ");

  if (!trimmed) {
    return { entries: [], session };
  }

  const nextSession: TerminalSession = {
    ...session,
    commandHistory: [...session.commandHistory, trimmed],
  };
  const commandEcho = echoCommand(trimmed, session.cwd);

  const linuxResult = handleLinuxCommand(snapshot, command, args, nextSession);
  if (linuxResult.handled) {
    if (command === "clear") {
      return {
        clear: true,
        entries: [commandEcho],
        session: linuxResult.session,
        reading: null,
      };
    }
    return {
      entries: [commandEcho, ...linuxResult.entries],
      session: linuxResult.session,
      reading: linuxResult.reading,
    };
  }

  switch (command) {
    case "help":
      return {
        entries: [
          commandEcho,
          lineEntry(
            lines(
              [token(zhCN.help.title, "success")],
              "",
              zhCN.help.about,
              zhCN.help.projects,
              zhCN.help.thoughts,
              zhCN.help.timeline,
              zhCN.help.search,
              zhCN.help.open,
              zhCN.help.themes,
              zhCN.help.clear,
              "",
              [token(zhCN.help.vfsTitle, "success")],
              "",
              zhCN.help.ls,
              zhCN.help.cd,
              zhCN.help.cat,
              zhCN.help.pwd,
              zhCN.help.tree,
              zhCN.help.whoami,
              zhCN.help.history,
            ),
          ),
        ],
        session: nextSession,
      };

    case "about":
      return {
        entries: [
          commandEcho,
          lineEntry(
            lines(
              [token(zhCN.about.name, "muted")],
              snapshot.person.name,
              "",
              [token(zhCN.about.description, "muted")],
              snapshot.person.description,
              "",
              [token(zhCN.about.focus, "muted")],
              snapshot.person.currentFocus,
              "",
              [token(zhCN.about.links, "muted")],
              ...snapshot.person.links.map((link) => [
                token(`${link.label}: `, "muted"),
                token(link.href, "path"),
              ]),
            ),
          ),
        ],
        session: nextSession,
      };

    case "projects":
      return {
        entries: [commandEcho, lineEntry(formatDocumentList(snapshot.projects))],
        session: nextSession,
      };

    case "thoughts":
      return {
        entries: [commandEcho, lineEntry(formatDocumentList(snapshot.thoughts))],
        session: nextSession,
      };

    case "timeline":
      return {
        entries: [
          commandEcho,
          lineEntry(lines([token(zhCN.reading.openedTimeline, "hint")])),
        ],
        session: {
          ...nextSession,
          selectedPath: "/timeline",
        },
        reading: { kind: "timeline", entries: snapshot.timeline },
      };

    case "search":
      return {
        entries: [commandEcho, search(snapshot, rest)],
        session: nextSession,
      };

    case "open": {
      if (!rest) {
        return {
          entries: [commandEcho, systemError(zhCN.errors.usageOpen)],
          session: nextSession,
        };
      }

      const root = createVfs(snapshot);
      const byVfsPath = resolveVfsPath(root, nextSession.cwd, rest);
      const targetName = normalize(rest);

      if (
        byVfsPath?.type === "timeline" ||
        targetName === "timeline"
      ) {
        return {
          entries: [
            commandEcho,
            lineEntry(lines([token(zhCN.reading.openedTimeline, "hint")])),
          ],
          session: {
            ...nextSession,
            selectedPath: "/timeline",
          },
          reading: { kind: "timeline", entries: snapshot.timeline },
        };
      }

      if (byVfsPath?.type === "person" || targetName === "person") {
        return {
          entries: [
            commandEcho,
            lineEntry(
              lines(
                [token(`${zhCN.about.name} `, "muted"), token(snapshot.person.name)],
                [
                  token(`${zhCN.about.description} `, "muted"),
                  token(snapshot.person.description),
                ],
                [
                  token(`${zhCN.about.focus} `, "muted"),
                  token(snapshot.person.currentFocus),
                ],
              ),
            ),
          ],
          session: {
            ...nextSession,
            selectedPath: "/person",
          },
        };
      }

      if (byVfsPath?.type === "dir") {
        return {
          entries: [
            commandEcho,
            systemError(
              `${zhCN.errors.cannotOpen}: "${rest}".`,
              zhCN.errors.isDirectory,
            ),
          ],
          session: nextSession,
        };
      }

      const bySlug = findDocument(snapshot, rest);
      const document =
        (byVfsPath ? toDocumentEntry(snapshot, byVfsPath.path) : null) ?? bySlug;
      if (!document) {
        return {
          entries: [
            commandEcho,
            systemError(
              `${zhCN.errors.cannotOpen}: "${rest}".`,
              openSuggestions(snapshot),
            ),
          ],
          session: nextSession,
        };
      }

      return {
        entries: [
          commandEcho,
          lineEntry(
            lines([
              token(zhCN.reading.openedPrefix, "hint"),
              token(document.title, "path"),
            ]),
          ),
        ],
        session: {
          ...nextSession,
          selectedPath: `/${document.path}`,
        },
        reading: { kind: "document", document },
      };
    }

    case "themes":
      return {
        entries: [
          commandEcho,
          lineEntry(
            lines(
              [token(zhCN.labels.themeLab, "success")],
              [token("/themes", "path")],
              "",
              [token(zhCN.labels.currentDirection, "hint")],
              [token(zhCN.labels.blackWhiteDirection, "normal")],
            ),
          ),
        ],
        session: nextSession,
      };

    case "clear":
      return {
        clear: true,
        entries: [commandEcho],
        session: createSession(),
        reading: null,
      };

    default:
      return {
        entries: [
          commandEcho,
          systemError(
            `${zhCN.errors.unknownCommand}: ${command}`,
            zhCN.errors.typeHelp,
          ),
        ],
        session: nextSession,
      };
  }
}
