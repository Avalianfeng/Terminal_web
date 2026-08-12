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

/** 只支持单文件形态 `content/<group>/<slug>.md`。 */
async function readMarkdownGroup(group: ContentGroup) {
  const groupRoot = path.join(contentRoot, group);
  const entries = await readdir(groupRoot, { withFileTypes: true }).catch(
    () => [],
  );

  const documents = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry): Promise<ArchiveDocument | null> => {
        const slug = entry.name.replace(/\.md$/, "");
        const markdown = await readFile(
          path.join(groupRoot, entry.name),
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
