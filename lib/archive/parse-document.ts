import { parseFrontmatter, type ContentGroup } from "./content-format";
import { documentRef } from "./document-ref";
import type { ArchiveDocument } from "./types";

function tagsFrom(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 单个文档 raw → ArchiveDocument（快照读、写后回读、客户端即时刷新共用）。 */
export function parseDocument(
  group: ContentGroup,
  slug: string,
  markdown: string,
): ArchiveDocument {
  const { fields, body } = parseFrontmatter(markdown);
  const data = new Map(fields.map((field) => [field.key, field.value]));
  const fallbackTitle =
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug.replaceAll("-", " ");

  return {
    ref: documentRef(group, slug),
    title: data.get("title") ?? fallbackTitle,
    summary: data.get("summary") ?? "",
    status: data.get("status"),
    body,
    tags: tagsFrom(data.get("tags")),
  };
}
