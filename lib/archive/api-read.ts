import { NextResponse } from "next/server";
import { parseDocument } from "./content";
import type {
  ArchiveDocument,
  ArchiveSnapshot,
  PersonRecord,
  TimelineEntry,
} from "./types";
import {
  hashRaw,
  readDocumentRaw,
  type ContentGroup,
} from "./content-write";

export const API_VERSION = 1 as const;

// --- Error types ---

export type ApiErrorCode =
  | "not_found"
  | "bad_request"
  | "method_not_allowed"
  | "unauthorized"
  | "forbidden"
  | "conflict";

// --- Item types (08 unified model) ---

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

// --- Validation ---

export function validateKind(kind: string): kind is ItemKind {
  return AVAILABLE_KINDS.includes(kind as ItemKind);
}

export function validateSource(source: string): source is ItemSource {
  return AVAILABLE_SOURCES.includes(source as ItemSource);
}

// --- URL builders ---

export function publicItemHref(localKey: string): string {
  return `/api/v1/items?source=local&localKey=${encodeURIComponent(localKey)}`;
}

// --- Converters ---

export function toItemListItem(document: ArchiveDocument): ItemListItem {
  return {
    source: "local",
    localKey: document.path,
    kind: "document",
    title: document.title,
    ...(document.summary ? { summary: document.summary } : {}),
    ...(document.status ? { status: document.status } : {}),
    ...(document.tags.length > 0 ? { tags: document.tags } : {}),
    href: publicItemHref(document.path),
  };
}

/** raw → 完整详情 payload（含真实 hash）。详情读与 PUT/PATCH 写响应共用。 */
export function payloadFromRaw(
  group: ContentGroup,
  slug: string,
  raw: string,
): ItemPayload {
  const document = parseDocument(group, slug, raw);
  return {
    ...toItemListItem(document),
    body: document.body,
    bodyFormat: "markdown",
    hash: hashRaw(raw),
  };
}

/**
 * 详情带真实文件 hash（If-Match 用）。
 * 文档缺失 → WriteError not_found（调用方转 404）。
 */
export async function toItemPayloadWithHash(
  document: ArchiveDocument,
): Promise<ItemPayload> {
  const [group, ...slugParts] = document.path.split("/");
  const raw = await readDocumentRaw(
    group as ContentGroup,
    slugParts.join("/"),
  );
  return payloadFromRaw(group as ContentGroup, slugParts.join("/"), raw);
}

// --- Item lookup (unified key) ---

export function findItemByKey(
  snapshot: ArchiveSnapshot,
  source: string,
  localKey: string,
): ArchiveDocument | null {
  if (source !== "local") return null;
  const normalized = localKey.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) return null;
  return (
    [...snapshot.projects, ...snapshot.thoughts].find(
      (document) => document.path === normalized,
    ) ?? null
  );
}

// --- Legacy path lookup (?path= syntax sugar) ---

export function findDocumentByPath(
  snapshot: ArchiveSnapshot,
  rawPath: string,
): ArchiveDocument | null {
  return findItemByKey(snapshot, "local", rawPath);
}

// --- Build unified items index ---

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
): { items: Partial<ItemListItem>[] } {
  const allDocs = [...snapshot.projects, ...snapshot.thoughts];
  const items = allDocs
    .map(toItemListItem)
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

// --- Discovery ---

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
        write: { method: "PUT|PATCH|DELETE", href: "/api/v1/items?source=local&localKey=…" },
      },
      person: { method: "GET", href: "/api/v1/person" },
      timeline: { method: "GET", href: "/api/v1/timeline" },
    },
  };
}

// --- HTTP response helpers ---

function corsHeaders(generatedAt?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match",
  };
  if (generatedAt) {
    headers["X-Archive-Generated-At"] = generatedAt;
  }
  return headers;
}

export function jsonOk<T>(
  data: T,
  generatedAt: string,
  init?: { status?: number },
) {
  return NextResponse.json(
    {
      ok: true as const,
      apiVersion: API_VERSION,
      generatedAt,
      data,
    },
    {
      status: init?.status ?? 200,
      headers: corsHeaders(generatedAt),
    },
  );
}

export function jsonError(
  error: ApiErrorCode,
  message: string,
  status: number,
  extraHeaders?: HeadersInit,
) {
  return NextResponse.json(
    {
      ok: false as const,
      apiVersion: API_VERSION,
      error,
      message,
    },
    {
      status,
      headers: {
        ...corsHeaders(),
        ...extraHeaders,
      },
    },
  );
}

export function methodNotAllowed(allow = "GET") {
  return jsonError(
    "method_not_allowed",
    `Method not allowed here. Allowed: ${allow}.`,
    405,
    { Allow: allow },
  );
}

export function optionsCors() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export type { PersonRecord, TimelineEntry };
