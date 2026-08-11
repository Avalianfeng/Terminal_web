/**
 * Read adapter — filesystem → ItemPayload (hash + body).
 * Discovery types come from discovery.ts; no NextResponse here.
 */

import { parseDocument } from "./parse-document";
import {
  hashRaw,
  readDocumentRaw,
  type ContentGroup,
} from "./content-write";
import type { ArchiveDocument } from "./types";
import { toItemListItem, type ItemPayload } from "./discovery";

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
  const raw = await readDocumentRaw(document.ref);
  return payloadFromRaw(document.ref.group, document.ref.slug, raw);
}
