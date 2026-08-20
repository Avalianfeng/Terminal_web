import { readFile, readdir, realpath } from "fs/promises";
import path from "path";
import { slugSegments, type ContentGroup } from "./content-format";
import { parseDocument } from "./parse-document";
import type { DocumentZone } from "./document-ref";
import { PRIVATE_ZONE_PREFIX } from "./document-ref";
import {
  grantFor,
  scopeSnapshot,
  type PrincipalGrant,
} from "./permission";
import type {
  ArchiveDocument,
  ArchiveSnapshot,
  PersonRecord,
  TimelineEntry,
} from "./types";

export { allSnapshotDocuments } from "./types";

/** 仓根下 `content/`（按当前 cwd 惰性解析，便于测试 chdir；ADR 0018）。 */
export function getContentRoot(cwd = process.cwd()): string {
  return path.join(cwd, "content");
}

/** Absolute disk root for a zone under content/ (private = content/private). */
export function contentRootForZone(
  zone: DocumentZone,
  cwd = process.cwd(),
): string {
  const root = getContentRoot(cwd);
  return zone === "private" ? path.join(root, PRIVATE_ZONE_PREFIX) : root;
}

export { parseDocument } from "./parse-document";

/** 扫描深度上限：防 junction 成环无限递归（安全审查 #2）。 */
const MAX_SCAN_DEPTH = 24;

/** target 是否在 root（realpath 后）之内；二者相等也视为在内。 */
function isUnderRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (rel !== ".." &&
      !rel.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(rel))
  );
}

/**
 * 递归收集组内 `.md` 相对路径与真实目录相对路径（跳过隐藏项；不含组根）。
 * 相对路径一律相对 **groupRoot**（多级路径保持完整，如 `a/b/c`、`my_web/log.md`）。
 * 目录做 realpath 包含检查：junction/symlink 指向组外 → 跳过（防泄露与成环）。
 * 非法段名（不符合 slug 白名单）的文件/目录容错跳过。
 */
async function collectGroupTree(
  groupRoot: string,
  groupRootReal: string,
  dir = groupRoot,
  depth = 0,
): Promise<{ files: string[]; dirs: string[] }> {
  if (depth > MAX_SCAN_DEPTH) return { files: [], dirs: [] };
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  const dirs: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const real = await realpath(full).catch(() => null);
      if (real === null || !isUnderRoot(groupRootReal, real)) continue;
      const relative = path.relative(groupRoot, full).replace(/\\/g, "/");
      if (slugSegments(relative) !== null) {
        dirs.push(relative);
      }
      const sub = await collectGroupTree(groupRoot, groupRootReal, full, depth + 1);
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(groupRoot, full).replace(/\\/g, "/"));
    }
  }
  return { files, dirs };
}

/** 任意目录的树收集（组根语义；供测试与复用）。 */
export async function readGroupTree(
  groupRoot: string,
): Promise<{ files: string[]; dirs: string[] }> {
  const groupRootReal = await realpath(groupRoot).catch(() => null);
  if (groupRootReal === null) return { files: [], dirs: [] };
  return collectGroupTree(groupRoot, groupRootReal);
}

async function readMarkdownGroup(
  group: ContentGroup,
  zone: DocumentZone,
): Promise<ArchiveDocument[]> {
  const groupRoot = path.join(contentRootForZone(zone), group);
  const groupRootReal = await realpath(groupRoot).catch(() => null);
  if (groupRootReal === null) return [];

  const { files } = await collectGroupTree(groupRoot, groupRootReal);

  const documents = await Promise.all(
    files.map(async (relative): Promise<ArchiveDocument | null> => {
      const slug = relative.replace(/\\/g, "/").replace(/\.md$/, "");
      if (slugSegments(slug) === null) {
        console.warn(
          `[content] skipping invalid document path: ${zone === "private" ? "private/" : ""}${group}/${relative}`,
        );
        return null;
      }
      const markdown = await readFile(
        path.join(groupRoot, relative),
        "utf8",
      ).catch(() => null);
      if (!markdown) return null;
      return parseDocument(group, slug, markdown, zone);
    }),
  );

  return documents.filter((document): document is ArchiveDocument =>
    Boolean(document),
  );
}

async function readGroupDirectories(
  group: ContentGroup,
  zone: DocumentZone,
): Promise<string[]> {
  const groupRoot = path.join(contentRootForZone(zone), group);
  const groupRootReal = await realpath(groupRoot).catch(() => null);
  if (groupRootReal === null) return [];
  const { dirs } = await collectGroupTree(groupRoot, groupRootReal);
  return dirs;
}

/** True when `content/private/` exists on disk (empty skeleton still counts). */
async function privateZoneRootExists(cwd = process.cwd()): Promise<boolean> {
  const root = await realpath(contentRootForZone("private", cwd)).catch(
    () => null,
  );
  return root !== null;
}

function parseTimeline(markdown: string): TimelineEntry[] {
  const sections = markdown
    .split(/^##\s+/m)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section) => {
    const [firstLine = "", ...rest] = section.split("\n");
    const [date, ...titleParts] = firstLine.split(" ");

    return {
      date,
      title: titleParts.join(" ").trim(),
      body: rest.join("\n").trim(),
    };
  });
}

/** Same group+slug in both zones is allowed (different localKeys); warn only. */
function concatZoneDocs(
  publicDocs: ArchiveDocument[],
  privateDocs: ArchiveDocument[],
): ArchiveDocument[] {
  const publicSlugs = new Set(publicDocs.map((doc) => doc.ref.slug));
  for (const doc of privateDocs) {
    if (publicSlugs.has(doc.ref.slug)) {
      console.warn(
        `[content] same slug in public and private zones: ${doc.ref.group}/${doc.ref.slug}`,
      );
    }
  }
  return [...publicDocs, ...privateDocs];
}

/**
 * Raw disk snapshot with no principal filter.
 * Prefer {@link getArchiveSnapshotFor} at request / page boundaries.
 */
export async function readArchiveSnapshotUnscoped(): Promise<ArchiveSnapshot> {
  const person = JSON.parse(
    await readFile(path.join(getContentRoot(), "person.json"), "utf8"),
  ) as PersonRecord;
  const [
    publicProjects,
    publicThoughts,
    publicResources,
    privateProjects,
    privateThoughts,
    privateResources,
    projectDirs,
    thoughtDirs,
    resourceDirs,
    privateProjectDirs,
    privateThoughtDirs,
    privateResourceDirs,
    timelineMarkdown,
  ] = await Promise.all([
    readMarkdownGroup("projects", "public"),
    readMarkdownGroup("thoughts", "public"),
    readMarkdownGroup("resources", "public"),
    readMarkdownGroup("projects", "private"),
    readMarkdownGroup("thoughts", "private"),
    readMarkdownGroup("resources", "private"),
    readGroupDirectories("projects", "public"),
    readGroupDirectories("thoughts", "public"),
    readGroupDirectories("resources", "public"),
    readGroupDirectories("projects", "private"),
    readGroupDirectories("thoughts", "private"),
    readGroupDirectories("resources", "private"),
    readFile(path.join(getContentRoot(), "timeline.md"), "utf8").catch(() => ""),
  ]);

  return {
    person,
    projects: concatZoneDocs(publicProjects, privateProjects),
    thoughts: concatZoneDocs(publicThoughts, privateThoughts),
    resources: concatZoneDocs(publicResources, privateResources),
    directories: {
      projects: projectDirs,
      thoughts: thoughtDirs,
      resources: resourceDirs,
      private: {
        projects: privateProjectDirs,
        thoughts: privateThoughtDirs,
        resources: privateResourceDirs,
      },
    },
    privateZoneMounted: await privateZoneRootExists(),
    timeline: parseTimeline(timelineMarkdown),
    generatedAt: new Date().toISOString(),
  };
}

/** Snapshot projected for a grant (unreachable zone omitted). */
export async function getArchiveSnapshotFor(
  grant: PrincipalGrant,
): Promise<ArchiveSnapshot> {
  return scopeSnapshot(await readArchiveSnapshotUnscoped(), grant);
}

/**
 * @deprecated Prefer {@link getArchiveSnapshotFor} or {@link readArchiveSnapshotUnscoped}.
 * Unscoped alias kept for tests that intentionally need the full disk view.
 */
export async function getArchiveSnapshot(): Promise<ArchiveSnapshot> {
  return readArchiveSnapshotUnscoped();
}

/** Convenience: owner-scoped snapshot (local-dev / owner session default). */
export async function getOwnerArchiveSnapshot(): Promise<ArchiveSnapshot> {
  return getArchiveSnapshotFor(grantFor("owner"));
}
