import { readFile, readdir, realpath } from "fs/promises";
import path from "path";
import { slugSegments, type ContentGroup } from "./content-format";
import { parseDocument } from "./parse-document";
import type {
  ArchiveDocument,
  ArchiveSnapshot,
  PersonRecord,
  TimelineEntry,
} from "./types";

export { allSnapshotDocuments } from "./types";

export const contentRoot = path.join(process.cwd(), "content");
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
 * 递归收集组内全部 `.md` 相对路径（`a/b.md`；跳过隐藏项与非 .md）。
 * 目录做 realpath 包含检查：junction/symlink 指向组外 → 跳过（防泄露与成环）。
 */
async function collectMarkdownFiles(
  dir: string,
  groupRootReal: string,
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_SCAN_DEPTH) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const real = await realpath(full).catch(() => null);
      if (real === null || !isUnderRoot(groupRootReal, real)) continue;
      files.push(...(await collectMarkdownFiles(full, groupRootReal, depth + 1)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(dir, full));
    }
  }
  return files;
}

/**
 * 支持单文件与多段形态（ADR 0013）：
 * `content/<group>/<slug>.md` 或 `content/<group>/<seg1>/<seg2>.md`。
 * 盘上非法文件名（不符合段白名单）容错跳过，不打挂整站快照。
 */
async function readMarkdownGroup(group: ContentGroup) {
  const groupRoot = path.join(contentRoot, group);
  const groupRootReal = await realpath(groupRoot).catch(() => null);
  if (groupRootReal === null) return [];

  const files = await collectMarkdownFiles(groupRoot, groupRootReal);

  const documents = await Promise.all(
    files.map(async (relative): Promise<ArchiveDocument | null> => {
      const slug = relative.replace(/\\/g, "/").replace(/\.md$/, "");
      if (slugSegments(slug) === null) {
        console.warn(
          `[content] skipping invalid document path: ${group}/${relative}`,
        );
        return null;
      }
      const markdown = await readFile(
        path.join(groupRoot, relative),
        "utf8",
      ).catch(() => null);
      if (!markdown) return null;
      return parseDocument(group, slug, markdown);
    }),
  );

  return documents.filter((document): document is ArchiveDocument =>
    Boolean(document),
  );
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

export async function getArchiveSnapshot(): Promise<ArchiveSnapshot> {
  const person = JSON.parse(
    await readFile(path.join(contentRoot, "person.json"), "utf8"),
  ) as PersonRecord;
  const [projects, thoughts, resources, timelineMarkdown] = await Promise.all([
    readMarkdownGroup("projects"),
    readMarkdownGroup("thoughts"),
    readMarkdownGroup("resources"),
    readFile(path.join(contentRoot, "timeline.md"), "utf8").catch(() => ""),
  ]);

  return {
    person,
    projects,
    thoughts,
    resources,
    timeline: parseTimeline(timelineMarkdown),
    generatedAt: new Date().toISOString(),
  };
}
