import { NextResponse } from "next/server";
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
    href: publicItemHref(document.path),
  };
}

export function toItemPayload(document: ArchiveDocument): ItemPayload {
  return {
    ...toItemListItem(document),
    body: document.body,
    bodyFormat: "markdown",
    hash: "",
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
  return {
    ...toItemListItem(document),
    body: document.body,
    bodyFormat: "markdown",
    hash: hashRaw(raw),
  };
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

export function buildItemsIndex(
  snapshot: ArchiveSnapshot,
  filters?: { kind?: string; source?: string },
): { items: ItemListItem[] } {
  const allDocs = [...snapshot.projects, ...snapshot.thoughts];
  const items = allDocs
    .map(toItemListItem)
    .filter(
      (item) =>
        (!filters?.kind || item.kind === filters.kind) &&
        (!filters?.source || item.source === filters.source),
    );
  return { items };
}

// --- Discovery ---

export function buildDiscovery() {
  return {
    name: "Personal Archive System API",
    capabilities: {
      read: true,
      write: true,
      auth: "Authorization: Bearer <token>",
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
        write: { method: "PUT|DELETE", href: "/api/v1/items?source=local&localKey=…" },
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
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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
