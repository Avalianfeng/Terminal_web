import { parseFrontmatter, type ContentGroup } from "./content-format";

import { documentRef } from "./document-ref";

import {

  RESOURCE_TYPES,

  type ArchiveDocument,

  type ResourceType,

} from "./types";



function tagsFrom(value: string | undefined) {

  if (!value) return [];

  return value

    .split(",")

    .map((tag) => tag.trim())

    .filter(Boolean);

}



function parseResourceType(value: string | undefined): ResourceType | undefined {

  if (!value) return undefined;

  return RESOURCE_TYPES.includes(value as ResourceType)

    ? (value as ResourceType)

    : undefined;

}



function parseEmbedFlag(value: string | undefined): boolean | undefined {

  if (value === undefined || value === "") return undefined;

  const lower = value.trim().toLowerCase();

  if (lower === "true") return true;

  if (lower === "false") return false;

  return undefined;

}



function inferPlatform(url: string | undefined): string | undefined {

  if (!url) return undefined;

  try {

    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";

    if (host.includes("bilibili.com") || host === "b23.tv") return "bilibili";

    if (host.includes("douyin.com")) return "douyin";

    return host || undefined;

  } catch {

    return undefined;

  }

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



  const base: ArchiveDocument = {

    ref: documentRef(group, slug),

    title: data.get("title") ?? fallbackTitle,

    summary: data.get("summary") ?? "",

    status: data.get("status"),

    body,

    tags: tagsFrom(data.get("tags")),

  };



  if (group !== "resources") {

    return base;

  }



  const url = data.get("url")?.trim() || undefined;

  const resourceType = parseResourceType(data.get("resourceType"));

  const platform = data.get("platform")?.trim() || inferPlatform(url);



  return {

    ...base,

    url,

    resourceType,

    platform,

    embed: parseEmbedFlag(data.get("embed")),

    audioSrc: data.get("audio")?.trim() || undefined,

  };

}


