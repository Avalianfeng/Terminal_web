import { readFile, readdir } from "fs/promises";
import path from "path";
import { type ContentGroup } from "./content-format";
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

/** 递归收集组内全部 `.md` 相对路径（`a/b.md`；跳过隐藏项与非 .md）。 */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(dir, full));
    }
  }
  return files;
}

/**
 * 支持单文件与多段形态（ADR 0013）：
 * `content/<group>/<slug>.md` 或 `content/<group>/<seg1>/<seg2>.md`。
 */
async function readMarkdownGroup(group: ContentGroup) {
  const groupRoot = path.join(contentRoot, group);
  const files = await collectMarkdownFiles(groupRoot);

  const documents = await Promise.all(
    files.map(async (relative): Promise<ArchiveDocument | null> => {
      const slug = relative.replace(/\\/g, "/").replace(/\.md$/, "");
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
