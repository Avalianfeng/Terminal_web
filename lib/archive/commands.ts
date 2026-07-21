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
import { RAIL_MAX } from "./reading-state";
import { formatInputTokens } from "./shell-style";
import {
  createSession,
  createVfs,
  formatShellPromptTokens,
  listNode,
  resolveVfsPath,
  suggestVfsPaths,
  treeLines,
  type VfsNode,
} from "./vfs";

/** 单篇或批量打开；数组时最后一项进 main（见 docs/05）。 */
type ReadingPayload = ReadingSurface | ReadingSurface[];

type CommandResult = {
  entries: TerminalEntry[];
  clear?: boolean;
  session: TerminalSession;
  /** 打开外区阅读面板；与终端输出分离（Spatial separation）。 */
  reading?: ReadingPayload | null;
  /** 终端 pager：未按列宽 wrap 的逻辑行（由 xterm 侧 wrap）。 */
  pager?: { logicalLines: string[] } | null;
};

type LinuxHandlerResult = {
  entries: TerminalEntry[];
  session: TerminalSession;
  handled: boolean;
  reading?: ReadingPayload | null;
  pager?: { logicalLines: string[] } | null;
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

function collectOpenableNodes(node: VfsNode): VfsNode[] {
  if (node.type === "dir") {
    return (node.children ?? []).flatMap((child) => collectOpenableNodes(child));
  }
  return [node];
}

function nodeLabel(node: VfsNode) {
  if (node.type === "timeline") return zhCN.labels.timeline;
  if (node.type === "person") return zhCN.vfs.person;
  return node.refSlug ?? node.name;
}

/** 路径 / 名称检索；不搜正文（正文用 search）。空查询列出全部可打开节点。 */
function findPaths(snapshot: ArchiveSnapshot, query: string) {
  const root = createVfs(snapshot);
  const nodes = collectOpenableNodes(root);
  const target = normalize(query);

  const hits = target
    ? nodes.filter((node) => {
        const haystack = normalize(
          [node.path, node.name, node.refSlug ?? "", nodeLabel(node)].join(" "),
        );
        return haystack.includes(target);
      })
    : nodes;

  if (hits.length === 0) {
    return lineEntry([
      line([
        token(
          target
            ? `${zhCN.errors.emptyFind}: "${query}"`
            : zhCN.errors.emptyFind,
          "error",
        ),
      ]),
      line([token(zhCN.errors.usageFind, "hint")]),
    ]);
  }

  const header = target
    ? `${zhCN.labels.findResults}: "${query}"`
    : zhCN.labels.findAll;

  return lineEntry([
    line([token(header, "success")]),
    line([token(zhCN.labels.findHint, "hint")]),
    line(""),
    ...hits.map((node) =>
      line([
        token(node.path, "path"),
        token(`  ${node.type}`, "muted"),
      ]),
    ),
  ]);
}

function archiveStatus(snapshot: ArchiveSnapshot) {
  const indexTime = snapshot.generatedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC");
  return lineEntry(
    lines(
      [token(zhCN.labels.statusTitle, "success")],
      "",
      [
        token(`${zhCN.labels.statusPerson}: `, "muted"),
        token(snapshot.person.name, "success"),
      ],
      [
        token(`${zhCN.labels.statusFocus}: `, "muted"),
        token(snapshot.person.currentFocus),
      ],
      "",
      [
        token(`${zhCN.labels.statusProjects}: `, "muted"),
        token(`${snapshot.projects.length} ${zhCN.labels.countUnit}`, "path"),
      ],
      [
        token(`${zhCN.labels.statusThoughts}: `, "muted"),
        token(`${snapshot.thoughts.length} ${zhCN.labels.countUnit}`, "path"),
      ],
      [
        token(`${zhCN.labels.statusTimeline}: `, "muted"),
        token(
          `${snapshot.timeline.length} ${zhCN.labels.timelineUnit}`,
          "path",
        ),
      ],
      [
        token(`${zhCN.labels.statusIndex}: `, "muted"),
        token(indexTime, "hint"),
      ],
      "",
      [token(zhCN.labels.statusHint, "hint")],
    ),
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

function surfaceFromNode(
  snapshot: ArchiveSnapshot,
  node: VfsNode,
): ReadingSurface | null {
  if (node.type === "timeline") {
    return { kind: "timeline", entries: snapshot.timeline };
  }
  if (node.type === "project" || node.type === "thought") {
    const document = toDocumentEntry(snapshot, node.path);
    return document ? { kind: "document", document } : null;
  }
  return null;
}

/** 目录下可进阅读面板的节点（不含 person；不含嵌套子目录）。 */
function openableInDir(
  snapshot: ArchiveSnapshot,
  dir: VfsNode,
): ReadingSurface[] {
  if (dir.type !== "dir") {
    const alone = surfaceFromNode(snapshot, dir);
    return alone ? [alone] : [];
  }
  return listNode(dir)
    .map((child) => surfaceFromNode(snapshot, child))
    .filter((surface): surface is ReadingSurface => surface !== null);
}

/**
 * 解析单个 open 参数。
 * - `.` / `*` → 当前目录批量
 * - 目录路径 → 该目录批量
 * - 文件 / timeline / slug → 单篇
 * - person → 终端摘要（不进面板），用特殊标记
 */
type OpenResolve =
  | { kind: "surfaces"; surfaces: ReadingSurface[]; batch: boolean }
  | { kind: "person" }
  | { kind: "empty-dir"; path: string }
  | { kind: "missing"; token: string }
  | { kind: "unreadable"; token: string };

function resolveOpenToken(
  snapshot: ArchiveSnapshot,
  cwd: string,
  rawToken: string,
): OpenResolve {
  const token = rawToken.trim();
  if (!token) return { kind: "missing", token: rawToken };

  const root = createVfs(snapshot);
  const lower = normalize(token);

  if (lower === "person") {
    return { kind: "person" };
  }
  if (lower === "timeline") {
    return {
      kind: "surfaces",
      surfaces: [{ kind: "timeline", entries: snapshot.timeline }],
      batch: false,
    };
  }

  const isGlob = token === "*" || token === ".";
  const node = isGlob
    ? resolveVfsPath(root, cwd, ".")
    : resolveVfsPath(root, cwd, token);

  if (node) {
    if (node.type === "person") {
      return { kind: "person" };
    }
    if (node.type === "dir" || isGlob) {
      const surfaces = openableInDir(snapshot, node);
      if (surfaces.length === 0) {
        return { kind: "empty-dir", path: node.path };
      }
      return { kind: "surfaces", surfaces, batch: true };
    }
    const surface = surfaceFromNode(snapshot, node);
    if (surface) {
      return { kind: "surfaces", surfaces: [surface], batch: false };
    }
    return { kind: "unreadable", token };
  }

  const document = findDocument(snapshot, token);
  if (document) {
    return {
      kind: "surfaces",
      surfaces: [{ kind: "document", document }],
      batch: false,
    };
  }

  return { kind: "missing", token };
}

const OPEN_SLOT_MAX = RAIL_MAX + 1;

function capSurfaces(surfaces: ReadingSurface[]) {
  if (surfaces.length <= OPEN_SLOT_MAX) {
    return { surfaces, truncated: 0 };
  }
  return {
    surfaces: surfaces.slice(0, OPEN_SLOT_MAX),
    truncated: surfaces.length - OPEN_SLOT_MAX,
  };
}

/** 目录批量：首项 main → 传入 openReadingMany 时把首项放到最后。 */
function orderForBatchMainFirst(surfaces: ReadingSurface[]) {
  if (surfaces.length <= 1) return surfaces;
  return [...surfaces.slice(1), surfaces[0]!];
}

function echoCommand(command: string, cwd: string): TerminalEntry {
  return {
    id: id("command"),
    kind: "command",
    lines: [
      {
        tokens: [
          ...formatShellPromptTokens(cwd),
          token(" ", "muted"),
          ...formatInputTokens(command),
        ],
      },
    ],
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

function pathMissingError(
  root: VfsNode,
  cwd: string,
  target: string,
  extraHint?: string,
) {
  const suggestions = suggestVfsPaths(root, cwd, target);
  const hintParts = [
    suggestions.length > 0
      ? `${zhCN.errors.didYouMean} ${suggestions.join(", ")}`
      : undefined,
    extraHint,
  ].filter(Boolean);
  return systemError(
    `${zhCN.errors.invalidPath}: ${target}`,
    hintParts.length > 0 ? hintParts.join(" · ") : undefined,
  );
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
        entries: [pathMissingError(root, session.cwd, target)],
        session,
        handled: true,
      };
    }

    if (node.type === "dir") {
      const entries = listNode(node).map((child) => {
        const nameTone =
          child.type === "dir"
            ? "path"
            : child.type === "timeline"
              ? "success"
              : child.type === "person"
                ? "user"
                : "command";
        return line([
          token(child.name, nameTone),
          token(child.type === "dir" ? "/" : "", "muted"),
        ]);
      });
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
        entries: [pathMissingError(root, session.cwd, target)],
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
        entries: [pathMissingError(root, session.cwd, target)],
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
        entries: [systemError(zhCN.errors.usageCat)],
        session,
        handled: true,
      };
    }
    const node = resolveVfsPath(root, session.cwd, target);

    if (!node) {
      return {
        entries: [pathMissingError(root, session.cwd, target)],
        session,
        handled: true,
      };
    }
    if (node.type === "dir") {
      return {
        entries: [systemError(zhCN.errors.isDirectory)],
        session,
        handled: true,
      };
    }
    if (node.type === "timeline") {
      const logicalLines: string[] = [];
      for (const entry of snapshot.timeline) {
        if (logicalLines.length > 0) logicalLines.push("");
        logicalLines.push(`${entry.date}  ${entry.title}`);
        logicalLines.push(
          ...entry.body.replace(/\r\n/g, "\n").split("\n"),
        );
      }
      return {
        entries: [],
        session: { ...session, selectedPath: node.path },
        handled: true,
        pager: { logicalLines },
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

    const logicalLines = [
      document.title,
      "",
      ...document.body.replace(/\r\n/g, "\n").split("\n"),
    ];

    return {
      entries: [],
      session: {
        ...session,
        selectedPath: node.path,
      },
      handled: true,
      pager: { logicalLines },
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
        [token(zhCN.boot.banner, "success")],
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
        pager: null,
      };
    }
    return {
      entries: [commandEcho, ...linuxResult.entries],
      session: linuxResult.session,
      reading: linuxResult.reading,
      pager: linuxResult.pager,
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
              [token(zhCN.help.exploreTitle, "success")],
              zhCN.help.ls,
              zhCN.help.cd,
              zhCN.help.pwd,
              zhCN.help.tree,
              zhCN.help.find,
              zhCN.help.whoami,
              zhCN.help.status,
              zhCN.help.history,
              "",
              [token(zhCN.help.readTitle, "success")],
              zhCN.help.open,
              zhCN.help.cat,
              zhCN.help.timeline,
              zhCN.help.search,
              zhCN.help.projects,
              zhCN.help.thoughts,
              zhCN.help.about,
              "",
              [token(zhCN.help.sessionTitle, "success")],
              zhCN.help.clear,
              zhCN.help.themes,
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

    case "find":
      return {
        entries: [commandEcho, findPaths(snapshot, rest)],
        session: nextSession,
      };

    case "status":
      return {
        entries: [commandEcho, archiveStatus(snapshot)],
        session: nextSession,
      };

    case "open": {
      if (!rest) {
        return {
          entries: [commandEcho, systemError(zhCN.errors.usageOpen)],
          session: nextSession,
        };
      }

      const tokens = args.length > 0 ? args : rest.split(/\s+/).filter(Boolean);
      const collected: ReadingSurface[] = [];
      const notes: TerminalLine[] = [];
      let sawPerson = false;
      let dirBatchAlone = false;
      const multiExplicit = tokens.length > 1;

      for (const raw of tokens) {
        const resolved = resolveOpenToken(snapshot, nextSession.cwd, raw);

        if (resolved.kind === "person") {
          sawPerson = true;
          continue;
        }
        if (resolved.kind === "empty-dir") {
          notes.push(
            line([
              token(`${zhCN.errors.emptyDir}: `, "error"),
              token(resolved.path, "path"),
            ]),
          );
          continue;
        }
        if (resolved.kind === "missing" || resolved.kind === "unreadable") {
          notes.push(
            line([
              token(`${zhCN.errors.cannotOpen}: "`, "error"),
              token(resolved.token, "path"),
              token(`".`, "error"),
            ]),
          );
          if (resolved.kind === "missing") {
            const suggestions = suggestVfsPaths(
              createVfs(snapshot),
              nextSession.cwd,
              resolved.token,
            );
            if (suggestions.length > 0) {
              notes.push(
                line([
                  token(
                    `${zhCN.errors.didYouMean} ${suggestions.join(", ")}`,
                    "hint",
                  ),
                ]),
              );
            }
          }
          continue;
        }

        if (resolved.batch && !multiExplicit) {
          dirBatchAlone = true;
        }
        collected.push(...resolved.surfaces);
      }

      if (sawPerson) {
        notes.push(
          line([token(`${zhCN.about.name} `, "muted"), token(snapshot.person.name)]),
          line([
            token(`${zhCN.about.description} `, "muted"),
            token(snapshot.person.description),
          ]),
          line([
            token(`${zhCN.about.focus} `, "muted"),
            token(snapshot.person.currentFocus),
          ]),
        );
      }

      if (collected.length === 0) {
        if (sawPerson) {
          return {
            entries: [commandEcho, lineEntry(notes)],
            session: { ...nextSession, selectedPath: "/person" },
          };
        }
        return {
          entries: [
            commandEcho,
            notes.length > 0
              ? lineEntry([
                  ...notes,
                  line(""),
                  line([token(openSuggestions(snapshot), "hint")]),
                ])
              : systemError(zhCN.errors.usageOpen, openSuggestions(snapshot)),
          ],
          session: nextSession,
        };
      }

      // 单目录/通配：首项 → main；多目标：末项 → main
      const ordered = dirBatchAlone
        ? orderForBatchMainFirst(collected)
        : collected;
      const { surfaces: capped, truncated } = capSurfaces(ordered);

      const summaryLines: TerminalLine[] =
        capped.length === 1
          ? [
              line([
                token(zhCN.reading.openedPrefix, "hint"),
                token(
                  capped[0]!.kind === "document"
                    ? capped[0]!.document.title
                    : zhCN.labels.timeline,
                  "path",
                ),
              ]),
            ]
          : [
              line([
                token(zhCN.reading.openedBatchPrefix, "hint"),
                token(String(capped.length), "success"),
                token(zhCN.reading.openedBatchSuffix, "hint"),
              ]),
              ...capped.map((surface) =>
                line([
                  token("  · ", "muted"),
                  token(
                    surface.kind === "document"
                      ? surface.document.title
                      : zhCN.labels.timeline,
                    "path",
                  ),
                ]),
              ),
            ];

      if (truncated > 0) {
        summaryLines.push(
          line([
            token(
              `${zhCN.reading.openedTruncated} ${truncated}（${zhCN.reading.railCapHint} ${OPEN_SLOT_MAX}）`,
              "hint",
            ),
          ]),
        );
      }

      const mainSurface = capped[capped.length - 1]!;
      const selectedPath =
        mainSurface.kind === "document"
          ? `/${mainSurface.document.path}`
          : "/timeline";

      return {
        entries: [
          commandEcho,
          lineEntry([
            ...notes,
            ...(notes.length ? [line("")] : []),
            ...summaryLines,
          ]),
        ],
        session: {
          ...nextSession,
          selectedPath,
        },
        reading: capped.length === 1 ? capped[0]! : capped,
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
