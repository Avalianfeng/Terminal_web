import type { MusicAction } from "@/lib/music/music-command";
import {
  parseMusicArgs,
  resolveImportUrl,
  resolvePlayQuery,
} from "@/lib/music/music-command";
import {
  musicError,
  musicNoPlaylist,
  musicPlaylistUsage,
  musicPlaying,
  musicSwitchedBrowse,
} from "./cli-emit";
import type { MusicPlaylistIndex } from "@/lib/music/playlist-types";
import { playlistTrackCount } from "@/lib/music/playlist-types";
import { isLocalPlaylist } from "@/lib/music/playlist-project";
import { formatTrackArtists } from "@/lib/music/track-resolve";
import type {
  ArchiveDocument,
  ArchiveSnapshot,
  ReadingSurface,
  TerminalLine,
  TerminalSession,
  TerminalEntry,
  TerminalToken,
} from "./types";
import { allSnapshotDocuments } from "./types";
import { zhCN } from "./i18n";
import {
  getCommand,
  helpSectionTitleKey,
  helpSections,
  helpUsagesForSection,
  resolveAlias,
} from "./command-registry";
import {
  IMPLICIT_OWNER,
  capabilitiesFrom,
  type SitePrincipal,
} from "./site-principal";
import { RAIL_MAX } from "./reading-state";
import { formatInputTokens } from "./shell-style";
import {
  CONTENT_GROUPS,
  SLUG_PATTERN,
  slugSegments,
  type ContentGroup,
} from "./content-format";
import {
  documentRef,
  refsEqual,
  toLocalKey,
  toVfsPath,
  tryFromLocalKey,
  tryFromVfsPath,
  type DocumentEditTarget,
} from "./document-ref";
import {
  createSession,
  createVfs,
  formatShellPromptTokens,
  isDirectory,
  listNode,
  normalizePath,
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
  /** 打开全屏编辑面板（原文由编辑面板异步读取）。 */
  edit?: DocumentEditTarget | null;
  /** 目录副作用（mkdir / rmdir）；由终端 UI 异步执行 server action。 */
  fs?: { kind: "mkdir"; path: string } | { kind: "rmdir"; path: string } | null;
  /** 音乐层副作用（播放 / 导入）；由终端 UI 异步执行。 */
  music?: MusicAction | null;
  /** 站点身份副作用（口令提示 / 清 cookie）。 */
  auth?: { kind: "login" } | { kind: "logout" };
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
  return allSnapshotDocuments(snapshot);
}

function groupFromCwd(cwd: string): ContentGroup {
  if (cwd.startsWith("/resources")) return "resources";
  if (cwd.startsWith("/thoughts")) return "thoughts";
  return "projects";
}

function findDocument(snapshot: ArchiveSnapshot, query: string) {
  const target = normalize(query);
  if (!target) return null;

  return (
    allDocuments(snapshot).find(
      (document) => normalize(document.ref.slug) === target,
    ) ??
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
      line([
        token(`    ${zhCN.labels.slug}: `, "muted"),
        token(document.ref.slug, "path"),
      ]),
    ];
    if (document.status) {
      itemLines.push(
        line([
          token(`    ${zhCN.labels.docStatus}: `, "muted"),
          token(document.status, "path"),
        ]),
      );
    }
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
        document.ref.slug,
        toLocalKey(document.ref),
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

/** 全部可打开节点：纯目录递归；复合节点 = 自身（入口篇）+ 子节点。 */
function collectOpenableNodes(node: VfsNode): VfsNode[] {
  if (node.type === "dir") {
    return (node.children ?? []).flatMap((child) => collectOpenableNodes(child));
  }
  if (isDirectory(node)) {
    return [
      node,
      ...(node.children ?? []).flatMap((child) => collectOpenableNodes(child)),
    ];
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
        token(`${zhCN.labels.statusResources}: `, "muted"),
        token(`${snapshot.resources.length} ${zhCN.labels.countUnit}`, "path"),
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
  const ref = tryFromVfsPath(nodePath);
  if (!ref) return null;
  return (
    allDocuments(snapshot).find((document) => refsEqual(document.ref, ref)) ??
    null
  );
}

function surfaceFromNode(
  snapshot: ArchiveSnapshot,
  node: VfsNode,
): ReadingSurface | null {
  if (node.type === "timeline") {
    return { kind: "timeline", entries: snapshot.timeline };
  }
  if (node.type === "project" || node.type === "thought" || node.type === "resource") {
    const document = toDocumentEntry(snapshot, node.path);
    return document ? { kind: "document", document } : null;
  }
  return null;
}

/**
 * 目录下可进阅读面板的节点。
 * - 纯目录：直接子文档（不含更深嵌套）
 * - 复合节点：入口篇 + 直接子文档（ADR 0013）
 * - 文档节点：自身
 */
function openableInDir(
  snapshot: ArchiveSnapshot,
  dir: VfsNode,
): ReadingSurface[] {
  if (!isDirectory(dir)) {
    const alone = surfaceFromNode(snapshot, dir);
    return alone ? [alone] : [];
  }
  const surfaces: ReadingSurface[] = [];
  if (dir.type !== "dir") {
    const entry = surfaceFromNode(snapshot, dir);
    if (entry) surfaces.push(entry);
  }
  for (const child of listNode(dir)) {
    const surface = surfaceFromNode(snapshot, child);
    if (surface) surfaces.push(surface);
  }
  return surfaces;
}

/**
 * 绝对 VFS 目录路径 → `{ group, segments }`；非法（非组路径/段不合法/缺段）→ null。
 * 终端 handler 与组件 glue（archive-terminal.tsx）共用同一解析，防 off-by-one 回归。
 */
export function splitVfsDirPath(
  vfsPath: string,
): { group: ContentGroup; segments: string[] } | null {
  const parts = vfsPath.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [group, ...segments] = parts;
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) return null;
  if (slugSegments(segments.join("/")) === null) return null;
  return { group: group as ContentGroup, segments };
}

/**
 * rmdir 成功后的 cwd 修正：cwd 在被删目录内或等于它 → 回退到被删目录的父级
 * （rmdir 只删空目录，父级必然存活）；否则不变。防 cwd 悬空（终端自洽边界，docs/18 §6）。
 */
export function cwdAfterRemoval(cwd: string, removedPath: string): string {
  if (cwd !== removedPath && !cwd.startsWith(`${removedPath}/`)) return cwd;
  const parent = removedPath.slice(0, removedPath.lastIndexOf("/"));
  return parent || "/";
}

/**
 * 解析 mkdir / rmdir 目标：`/projects/my_web/notes`、`projects/my_web/notes`
 * （组前缀 = 绝对语义）或相对 cwd（如 `notes`）。组根/根/非组路径 → 错误。
 */
function resolveDirTarget(
  cwd: string,
  rawTarget: string,
): { ok: true; vfsPath: string; group: ContentGroup; segments: string[] } | { ok: false; hint: string } {
  const target = rawTarget.trim();
  if (!target) {
    return { ok: false, hint: zhCN.errors.usageMkdir };
  }
  // 组前缀与绝对路径都不拼接 cwd（否则 cwd 段会混入 segments）
  const hasGroupPrefix =
    target.startsWith("projects/") ||
    target.startsWith("thoughts/") ||
    target.startsWith("resources/");
  const vfsPath = target.startsWith("/") || hasGroupPrefix
    ? normalizePath(`/${target}`)
    : normalizePath(`${cwd}/${target}`);
  const parsed = splitVfsDirPath(vfsPath);
  if (!parsed) {
    return { ok: false, hint: `${zhCN.errors.invalidPath}: ${target}` };
  }
  return { ok: true, vfsPath, group: parsed.group, segments: parsed.segments };
}

/**
 * 解析 edit 目标。
 * - 显式路径：/projects/foo、thoughts/foo（目录 / 未知节点报错）
 * - 裸 slug：精确匹配已有文档取 group；否则按 cwd 所在组，默认 projects
 * - exists=false 表示进入新建
 */
function resolveEditTarget(
  snapshot: ArchiveSnapshot,
  cwd: string,
  rawToken: string,
): { ok: true; target: DocumentEditTarget } | { ok: false; hint: string } {
  const token = rawToken.trim().replace(/^\/+/, "");
  if (!token) {
    return { ok: false, hint: zhCN.errors.usageEdit };
  }

  const root = createVfs(snapshot);

  // 显式组前缀：新建或编辑均可（优先于 VFS 解析，支持不存在的路径）
  // 注意：不可对整段 token 做 SLUG_PATTERN——含 `/` 的路径（help 示例）会被误拒
  if (
    token.startsWith("projects/") ||
    token.startsWith("thoughts/") ||
    token.startsWith("resources/")
  ) {
    const ref = tryFromLocalKey(token);
    if (!ref) {
      return { ok: false, hint: `${zhCN.errors.invalidPath}: ${token}` };
    }
    return {
      ok: true,
      target: {
        ref,
        exists: allDocuments(snapshot).some((document) =>
          refsEqual(document.ref, ref),
        ),
      },
    };
  }

  const node = resolveVfsPath(root, cwd, token);
  if (node) {
    if (node.type === "project" || node.type === "thought" || node.type === "resource") {
      const ref = tryFromVfsPath(node.path);
      if (!ref) {
        return { ok: false, hint: zhCN.errors.notFile };
      }
      return {
        ok: true,
        target: {
          ref,
          exists: true,
        },
      };
    }
    return { ok: false, hint: zhCN.errors.notFile };
  }

  // 裸 slug：先精确匹配已有文档
  const known = allDocuments(snapshot).find(
    (document) => normalize(document.ref.slug) === normalize(token),
  );
  if (known) {
    return {
      ok: true,
      target: {
        ref: known.ref,
        exists: true,
      },
    };
  }

  // 新建：按 cwd 推断组；仅允许合法 slug（不含 `/`）
  if (!SLUG_PATTERN.test(token)) {
    return { ok: false, hint: `${zhCN.errors.invalidPath}: ${token}` };
  }
  const group: ContentGroup = groupFromCwd(cwd);
  return {
    ok: true,
    target: { ref: documentRef(group, token), exists: false },
  };
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
    if (isDirectory(node) || isGlob) {
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

function echoCommand(command: string, cwd: string, role: SitePrincipal["role"] = "owner"): TerminalEntry {
  return {
    id: id("command"),
    kind: "command",
    lines: [
      {
        tokens: [
          ...formatShellPromptTokens(cwd, role),
          token(" ", "muted"),
          ...formatInputTokens(command),
        ],
      },
    ],
  };
}

function openSuggestions(snapshot: ArchiveSnapshot) {
  const slugs = allDocuments(snapshot).map((document) => document.ref.slug);
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
  principal: SitePrincipal,
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

    if (isDirectory(node)) {
      const entries = listNode(node).map((child) => {
        const childDir = isDirectory(child);
        const nameTone =
          childDir
            ? "path"
            : child.type === "timeline"
              ? "success"
              : child.type === "person"
                ? "user"
                : "command";
        return line([
          token(child.name, nameTone),
          token(childDir ? "/" : "", "muted"),
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
    if (!isDirectory(node)) {
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
    if (isDirectory(node) && node.type === "dir") {
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
    const viaLabel =
      principal.via === "implicit-local-dev"
        ? zhCN.auth.viaImplicit
        : principal.via === "session"
          ? zhCN.auth.viaCookie
          : zhCN.auth.viaNone;
    return {
      entries: [
        lineEntry(
          lines(
            [
              token(`${zhCN.auth.person}: `, "muted"),
              token(snapshot.person.name, "success"),
            ],
            [
              token(`${zhCN.auth.role}: `, "muted"),
              token(principal.role, "success"),
            ],
            [
              token(`${zhCN.auth.session}: `, "muted"),
              token(viaLabel, "muted"),
            ],
          ),
        ),
      ],
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

function formatPlaylistList(
  playlists: MusicPlaylistIndex[],
  visitor: boolean,
): TerminalLine[] {
  if (playlists.length === 0) {
    return [
      line([
        token(visitor ? zhCN.music.emptyVisitor : zhCN.music.empty, "hint"),
      ]),
    ];
  }
  const rows: TerminalLine[] = [];
  for (const playlist of playlists) {
    const local = isLocalPlaylist(playlist);
    rows.push(
      line([
        token(playlist.name, "path"),
        token(
          `  ${playlistTrackCount(playlist)}${zhCN.music.trackUnit}  `,
          "muted",
        ),
        token(local ? zhCN.music.localTag : playlist.neteasePlaylistId, "muted"),
      ]),
    );
    if (local) {
      for (const track of playlist.tracks) {
        const artists = formatTrackArtists(track);
        rows.push(
          line([
            token("    ", "muted"),
            token(track.name),
            ...(artists
              ? [token(`  ${artists}`, "muted")]
              : []),
          ]),
        );
      }
    }
  }
  return rows;
}

function handleMusicCommand(
  commandEcho: TerminalEntry,
  args: string[],
  session: TerminalSession,
  playlists: MusicPlaylistIndex[],
  principal: SitePrincipal,
): CommandResult {
  const intent = parseMusicArgs(args);
  const owner = capabilitiesFrom(principal).musicBff;

  if (intent.kind === "flag-conflict") {
    return {
      entries: [commandEcho, systemError(zhCN.music.flagConflict)],
      session,
    };
  }

  if (intent.kind === "flag-mismatch") {
    return {
      entries: [commandEcho, systemError(zhCN.music[intent.messageKey])],
      session,
    };
  }

  if (intent.kind === "usage") {
    return {
      entries: [commandEcho, musicPlaylistUsage()],
      session,
    };
  }

  if (intent.kind === "help") {
    return {
      entries: [
        commandEcho,
        lineEntry(
          lines(
            [token(zhCN.music.usageTitle, "success")],
            zhCN.music.usageList,
            zhCN.music.usagePlay,
            zhCN.music.usageLyric,
            zhCN.music.usageShuffle,
            zhCN.music.usageShow,
            zhCN.music.usageHide,
            zhCN.music.usagePlaylist,
            ...(owner
              ? [
                  zhCN.music.usageImport,
                  zhCN.music.usageSync,
                  zhCN.music.usageDownload,
                  zhCN.music.usageDelete,
                ]
              : []),
            zhCN.music.usagePause,
            zhCN.music.usagePrev,
            zhCN.music.usageNext,
            zhCN.music.usageStop,
          ),
        ),
      ],
      session,
    };
  }

  if (intent.kind === "list") {
    return {
      entries: [
        commandEcho,
        lineEntry(formatPlaylistList(playlists, !owner)),
      ],
      session,
    };
  }

  if (intent.kind === "lyric") {
    return {
      entries: [commandEcho],
      session,
      music: { type: "lyric", query: intent.query },
    };
  }

  if (intent.kind === "shuffle") {
    return {
      entries: [commandEcho],
      session,
      music: { type: "shuffle", mode: intent.mode },
    };
  }

  if (intent.kind === "play") {
    if (intent.scope === "song") {
      return {
        entries: [commandEcho],
        session,
        music: {
          type: "play-search",
          query: intent.query,
          scope: intent.scope,
        },
      };
    }
    const resolved = resolvePlayQuery(playlists, intent.query);
    if (resolved.ok) {
      return {
        entries: [commandEcho, ...musicPlaying(resolved.playlist.name)],
        session,
        music: { type: "play", playlist: resolved.playlist },
      };
    }
    if (intent.scope === "playlist") {
      if (resolved.reason === "ambiguous") {
        return {
          entries: [
            commandEcho,
            musicError(
              `ambiguous playlist matches '${intent.query}'`,
              resolved.matches.map((item) => item.name).join("、"),
            ),
          ],
          session,
        };
      }
      return {
        entries: [commandEcho, musicNoPlaylist(intent.query)],
        session,
      };
    }
    return {
      entries: [commandEcho],
      session,
      music: {
        type: "play-search",
        query: intent.query,
        scope: intent.scope,
      },
    };
  }

  if (intent.kind === "show" || intent.kind === "hide") {
    return {
      entries: [
        commandEcho,
        lineEntry(
          lines([
            token(
              intent.kind === "show" ? zhCN.music.showing : zhCN.music.hiding,
              "hint",
            ),
          ]),
        ),
      ],
      session,
      music: { type: intent.kind },
    };
  }

  if (intent.kind === "playlist-next" || intent.kind === "playlist-prev") {
    return {
      entries: [commandEcho],
      session,
      music: { type: intent.kind },
    };
  }

  if (intent.kind === "playlist-use") {
    const resolved = resolvePlayQuery(playlists, intent.query);
    if (!resolved.ok) {
      if (resolved.reason === "missing") {
        return {
          entries: [commandEcho, musicPlaylistUsage()],
          session,
        };
      }
      if (resolved.reason === "none") {
        return {
          entries: [commandEcho, musicNoPlaylist(intent.query)],
          session,
        };
      }
      return {
        entries: [
          commandEcho,
          musicError(
            `ambiguous playlist matches '${intent.query}'`,
            resolved.matches.map((item) => item.name).join("、"),
          ),
        ],
        session,
      };
    }
    return {
      entries: [commandEcho, musicSwitchedBrowse(resolved.playlist.name)],
      session,
      music: { type: "playlist-use", playlist: resolved.playlist },
    };
  }

  if (intent.kind === "import") {
    if (!owner) {
      return {
        entries: [commandEcho, systemError(zhCN.auth.needOwner)],
        session,
      };
    }
    const url = resolveImportUrl(intent.url);
    if (!url) {
      return {
        entries: [commandEcho, systemError(zhCN.music.needImportUrl)],
        session,
      };
    }
    return {
      entries: [
        commandEcho,
        lineEntry(lines([token(zhCN.music.importing, "hint")])),
      ],
      session,
      music: { type: "import", url },
    };
  }

  if (intent.kind === "sync") {
    if (!owner) {
      return {
        entries: [commandEcho, systemError(zhCN.auth.needOwner)],
        session,
      };
    }
    return {
      entries: [
        commandEcho,
        lineEntry(lines([token(zhCN.music.syncing, "hint")])),
      ],
      session,
      music: { type: "sync" },
    };
  }

  if (intent.kind === "download") {
    if (!owner) {
      return {
        entries: [commandEcho, systemError(zhCN.auth.needOwner)],
        session,
      };
    }
    if (intent.queries.length === 0) {
      return {
        entries: [commandEcho],
        session,
        music: { type: "download-now" },
      };
    }
    return {
      entries: [commandEcho],
      session,
      music: { type: "download-queries", queries: intent.queries },
    };
  }

  if (intent.kind === "delete") {
    if (!owner) {
      return {
        entries: [commandEcho, systemError(zhCN.auth.needOwner)],
        session,
      };
    }
    return {
      entries: [commandEcho],
      session,
      music: { type: "delete", name: intent.name },
    };
  }

  if (intent.kind === "pause" || intent.kind === "resume") {
    return {
      entries: [commandEcho],
      session,
      music: { type: intent.kind },
    };
  }

  const statusKey =
    intent.kind === "prev"
      ? "prev"
      : intent.kind === "next"
        ? "next"
        : "stop";

  return {
    entries: [
      commandEcho,
      lineEntry(lines([token(zhCN.music[statusKey], "hint")])),
    ],
    session,
    music: { type: intent.kind },
  };
}

export function runCommand(
  snapshot: ArchiveSnapshot,
  rawCommand: string,
  session: TerminalSession = createSession(),
  playlists: MusicPlaylistIndex[] = [],
  principal: SitePrincipal = IMPLICIT_OWNER,
): CommandResult {
  const trimmed = rawCommand.trim();
  const [rawCommandName = "", ...args] = trimmed.split(/\s+/);
  const command = resolveAlias(normalize(rawCommandName));
  const rest = args.join(" ");
  const role = principal.role;

  if (!trimmed) {
    return { entries: [], session };
  }

  const loginWithArg = command === "login" && args.length > 0;
  const nextSession: TerminalSession = {
    ...session,
    commandHistory: loginWithArg
      ? session.commandHistory
      : [...session.commandHistory, trimmed],
  };
  const commandEcho = echoCommand(
    loginWithArg ? "login" : trimmed,
    session.cwd,
    role,
  );

  if (!getCommand(command)) {
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

  const linuxResult = handleLinuxCommand(
    snapshot,
    command,
    args,
    nextSession,
    principal,
  );
  if (linuxResult.handled) {
    return {
      entries: [commandEcho, ...linuxResult.entries],
      session: linuxResult.session,
      reading: linuxResult.reading,
      pager: linuxResult.pager,
    };
  }

  switch (command) {
    case "help": {
      const helpRows: (TerminalToken[] | string)[] = [
        [token(zhCN.help.title, "success")],
        "",
      ];
      for (const section of helpSections()) {
        helpRows.push([
          token(zhCN.help[helpSectionTitleKey(section)], "success"),
        ]);
        helpRows.push(...helpUsagesForSection(section, role));
        helpRows.push("");
      }
      helpRows.push(zhCN.help.shortcuts);
      return {
        entries: [commandEcho, lineEntry(lines(...helpRows))],
        session: nextSession,
      };
    }

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

    case "resources":
      return {
        entries: [commandEcho, lineEntry(formatDocumentList(snapshot.resources))],
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

    case "mkdir": {
      if (!capabilitiesFrom(principal).uiWrite) {
        return {
          entries: [commandEcho, systemError(zhCN.auth.needOwner)],
          session: nextSession,
        };
      }
      const resolved = resolveDirTarget(nextSession.cwd, rest);
      if (!resolved.ok) {
        return {
          entries: [commandEcho, systemError(resolved.hint)],
          session: nextSession,
        };
      }
      return {
        entries: [commandEcho],
        session: nextSession,
        fs: { kind: "mkdir", path: resolved.vfsPath },
      };
    }

    case "rmdir": {
      if (!capabilitiesFrom(principal).uiWrite) {
        return {
          entries: [commandEcho, systemError(zhCN.auth.needOwner)],
          session: nextSession,
        };
      }
      const resolved = resolveDirTarget(nextSession.cwd, rest);
      if (!resolved.ok) {
        return {
          entries: [commandEcho, systemError(resolved.hint)],
          session: nextSession,
        };
      }
      return {
        entries: [commandEcho],
        session: nextSession,
        fs: { kind: "rmdir", path: resolved.vfsPath },
      };
    }

    case "edit": {
      if (!capabilitiesFrom(principal).uiWrite) {
        return {
          entries: [commandEcho, systemError(zhCN.auth.needOwner)],
          session: nextSession,
        };
      }
      const resolved = resolveEditTarget(snapshot, nextSession.cwd, rest);
      if (!resolved.ok) {
        return {
          entries: [commandEcho, systemError(resolved.hint)],
          session: nextSession,
        };
      }
      const { target } = resolved;
      return {
        entries: [
          commandEcho,
          lineEntry(
            lines([
              token(
                target.exists
                  ? `${zhCN.editor.title}: ${toLocalKey(target.ref)}`
                  : `${zhCN.editor.title} (new): ${toLocalKey(target.ref)}`,
                "hint",
              ),
            ]),
          ),
        ],
        session: nextSession,
        edit: target,
      };
    }

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
          ? toVfsPath(mainSurface.document.ref)
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

    case "login": {
      if (args.length > 0) {
        return {
          entries: [commandEcho, systemError(zhCN.auth.noPasswordArg)],
          session: nextSession,
        };
      }
      return {
        entries: [commandEcho],
        session: nextSession,
        auth: { kind: "login" },
      };
    }

    case "logout":
      return {
        entries: [
          commandEcho,
          lineEntry(lines([token(zhCN.auth.loggingOut, "hint")])),
        ],
        session: nextSession,
        auth: { kind: "logout" },
      };

    case "music":
      return handleMusicCommand(
        commandEcho,
        args,
        nextSession,
        playlists,
        principal,
      );

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
