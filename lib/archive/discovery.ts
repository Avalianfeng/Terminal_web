/**
 * Discovery domain — Item model, index/filter/lookup, document → Item projection.
 * No NextResponse / filesystem I/O here (see api-http.ts, read-adapter.ts).
 */

import type { ArchiveDocument, ArchiveSnapshot } from "./types";
import { refsEqual, toLocalKey, tryFromLocalKey } from "./document-ref";

export type ItemKind = "document";
export type ItemSource = "local";

/** Currently available kinds (valid in queries). */
export const AVAILABLE_KINDS: ItemKind[] = ["document"];

/** Planned but not yet implemented kinds. */
export const PLANNED_KINDS: string[] = ["image", "music", "video"];

/** Currently available sources (valid in queries). */
export const AVAILABLE_SOURCES: ItemSource[] = ["local"];

/** Planned but not yet implemented sources. */
export const PLANNED_SOURCES: string[] = ["github"];

/** Index-level item (no body). */
export type ItemListItem = {
  source: string;
  localKey: string;
  kind: string;
  title: string;
  summary?: string;
  status?: string;
  tags?: string[];
  href: string;
};

/** Detail-level item (index fields + body). */
export type ItemPayload = ItemListItem & {
  body: string;
  bodyFormat: "markdown";
  /** 文件内容 SHA-256（hex）；写回时用 If-Match 头携带。 */
  hash: string;
};

/** Build public href for an item; injectable so discovery stays transport-agnostic. */
export type ItemHrefFor = (localKey: string) => string;

/** Default href for this app's HTTP surface (not the identity authority). */
export const defaultItemHref: ItemHrefFor = (localKey) =>
  `/api/v1/items?source=local&localKey=${encodeURIComponent(localKey)}`;

/** @deprecated Prefer defaultItemHref; kept as the historical name. */
export function publicItemHref(localKey: string): string {
  return defaultItemHref(localKey);
}

export function validateKind(kind: string): kind is ItemKind {
  return AVAILABLE_KINDS.includes(kind as ItemKind);
}

export function validateSource(source: string): source is ItemSource {
  return AVAILABLE_SOURCES.includes(source as ItemSource);
}

export function toItemListItem(
  document: ArchiveDocument,
  hrefFor: ItemHrefFor = defaultItemHref,
): ItemListItem {
  const localKey = toLocalKey(document.ref);
  return {
    source: "local",
    localKey,
    kind: "document",
    title: document.title,
    ...(document.summary ? { summary: document.summary } : {}),
    ...(document.status ? { status: document.status } : {}),
    ...(document.tags.length > 0 ? { tags: document.tags } : {}),
    href: hrefFor(localKey),
  };
}

export function findItemByKey(
  snapshot: ArchiveSnapshot,
  source: string,
  localKey: string,
): ArchiveDocument | null {
  if (source !== "local") return null;
  const ref = tryFromLocalKey(localKey);
  if (!ref) return null;
  return (
    [...snapshot.projects, ...snapshot.thoughts].find((document) =>
      refsEqual(document.ref, ref),
    ) ?? null
  );
}

/** Legacy path lookup (?path= syntax sugar). */
export function findDocumentByPath(
  snapshot: ArchiveSnapshot,
  rawPath: string,
): ArchiveDocument | null {
  return findItemByKey(snapshot, "local", rawPath);
}

/** 索引投影字段白名单（?fields= 只允许这些键）。 */
const INDEX_FIELD_WHITELIST = new Set([
  "source",
  "localKey",
  "kind",
  "title",
  "summary",
  "status",
  "tags",
  "href",
]);

export type ItemsIndexFilters = {
  kind?: string;
  source?: string;
  /** 单值精确匹配（status 是自由文本，不做枚举）。 */
  status?: string;
  /** 多值 AND：文档 tags 须包含全部给定 tag。 */
  tag?: string[];
  /** 投影：只返回白名单内的请求字段（非法字段名忽略）。 */
  fields?: string[];
};

function pickIndexFields(
  item: ItemListItem,
  fields: string[],
): Partial<ItemListItem> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (!INDEX_FIELD_WHITELIST.has(field) || !(field in item)) continue;
    picked[field] = item[field as keyof ItemListItem];
  }
  return picked as Partial<ItemListItem>;
}

export function buildItemsIndex(
  snapshot: ArchiveSnapshot,
  filters?: ItemsIndexFilters,
  hrefFor: ItemHrefFor = defaultItemHref,
): { items: Partial<ItemListItem>[] } {
  const allDocs = [...snapshot.projects, ...snapshot.thoughts];
  const items = allDocs
    .map((document) => toItemListItem(document, hrefFor))
    .filter(
      (item) =>
        (!filters?.kind || item.kind === filters.kind) &&
        (!filters?.source || item.source === filters.source) &&
        (!filters?.status || item.status === filters.status) &&
        (!filters?.tag?.length ||
          filters.tag.every((tag) => item.tags?.includes(tag))),
    );
  return {
    items: filters?.fields?.length
      ? items.map((item) => pickIndexFields(item, filters.fields!))
      : items,
  };
}

/** GET /api/v1 discovery document (capabilities + resource map). */
export function buildDiscovery() {
  return {
    name: "Personal Archive System API",
    capabilities: {
      read: true,
      write: true,
      auth: "Authorization: Bearer <token>",
      filters: {
        status: "exact-match",
        tag: "all-of",
        fields: "projection",
      },
    },
    kinds: {
      available: AVAILABLE_KINDS,
      planned: PLANNED_KINDS,
    },
    sources: {
      available: AVAILABLE_SOURCES,
      planned: PLANNED_SOURCES,
    },
    resources: {
      items: {
        read: { method: "GET", href: "/api/v1/items" },
        write: {
          method: "PUT|PATCH|DELETE",
          href: "/api/v1/items?source=local&localKey=…",
        },
      },
      person: { method: "GET", href: "/api/v1/person" },
      timeline: { method: "GET", href: "/api/v1/timeline" },
    },
  };
}
