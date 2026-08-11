/**
 * @deprecated Import from `discovery`, `api-http`, or `read-adapter` instead.
 * Thin barrel kept for older import paths (ADR 0003).
 */

export {
  AVAILABLE_KINDS,
  AVAILABLE_SOURCES,
  PLANNED_KINDS,
  PLANNED_SOURCES,
  buildDiscovery,
  buildItemsIndex,
  defaultItemHref,
  findDocumentByPath,
  findItemByKey,
  publicItemHref,
  toItemListItem,
  validateKind,
  validateSource,
  type ItemHrefFor,
  type ItemKind,
  type ItemListItem,
  type ItemPayload,
  type ItemSource,
  type ItemsIndexFilters,
} from "./discovery";

export {
  API_VERSION,
  jsonError,
  jsonOk,
  methodNotAllowed,
  optionsCors,
  type ApiErrorCode,
} from "./api-http";

export { payloadFromRaw, toItemPayloadWithHash } from "./read-adapter";

export type { PersonRecord, TimelineEntry } from "./types";
