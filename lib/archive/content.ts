import { readFile, readdir } from "fs/promises";
import path from "path";
import type {
  ArchiveDocument,
  ArchiveSnapshot,
  PersonRecord,
  TimelineEntry,
} from "./types";

const contentRoot = path.join(process.cwd(), "content");

function parseFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) {
    return { data: new Map<string, string>(), body: markdown.trim() };
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return { data: new Map<string, string>(), body: markdown.trim() };
  }

  const raw = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).trim();
  const data = new Map<string, string>();

  for (const line of raw.split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (!key || valueParts.length === 0) continue;
    data.set(key.trim(), valueParts.join(":").trim().replace(/^"|"$/g, ""));
  }

  return { data, body };
}

function tagsFrom(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function readMarkdownGroup(group: "projects" | "thoughts") {
  const groupRoot = path.join(contentRoot, group);
  const entries = await readdir(groupRoot, { withFileTypes: true }).catch(
    () => [],
  );

  const documents = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() || entry.name.endsWith(".md"))
      .map(async (entry): Promise<ArchiveDocument | null> => {
        const slug = entry.isDirectory()
          ? entry.name
          : entry.name.replace(/\.md$/, "");
        const filePath = entry.isDirectory()
          ? path.join(groupRoot, entry.name, "info.md")
          : path.join(groupRoot, entry.name);

        const markdown = await readFile(filePath, "utf8").catch(() => null);
        if (!markdown) return null;

        const { data, body } = parseFrontmatter(markdown);
        const fallbackTitle =
          body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug.replaceAll("-", " ");

        return {
          slug,
          title: data.get("title") ?? fallbackTitle,
          summary: data.get("summary") ?? "",
          status: data.get("status"),
          path: `${group}/${slug}`,
          body,
          tags: tagsFrom(data.get("tags")),
        };
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
  const [projects, thoughts, timelineMarkdown] = await Promise.all([
    readMarkdownGroup("projects"),
    readMarkdownGroup("thoughts"),
    readFile(path.join(contentRoot, "timeline.md"), "utf8").catch(() => ""),
  ]);

  return {
    person,
    projects,
    thoughts,
    timeline: parseTimeline(timelineMarkdown),
    generatedAt: new Date().toISOString(),
  };
}
