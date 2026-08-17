import {
  CONTENT_GROUPS,
  contentGroupLocalKeyHint,
  slugSegments,
  type ContentGroup,
} from "./content-format";

/**
 * Canonical identity of a local archive document (`source: local`).
 * Projects to discovery localKey and VFS path only — not filesystem paths.
 *
 * ADR 0013: `slug` is the group-relative path, one or more segments joined
 * by `/` (e.g. `my_web` or `my_web/log`); each segment matches SLUG_PATTERN.
 */
export type DocumentRef = {
  readonly group: ContentGroup;
  readonly slug: string;
};

export class DocumentRefError extends Error {
  readonly code = "bad_request" as const;

  constructor(message: string) {
    super(message);
    this.name = "DocumentRefError";
  }
}

/** Edit / create target: identity + whether the document already exists. */
export type DocumentEditTarget = {
  ref: DocumentRef;
  exists: boolean;
};

export function documentRef(group: ContentGroup, slug: string): DocumentRef {
  if (!CONTENT_GROUPS.includes(group)) {
    throw new DocumentRefError(`Unknown group: ${group}`);
  }
  if (slugSegments(slug) === null) {
    throw new DocumentRefError(
      `Invalid slug: "${slug}". Each segment must match [a-z0-9_-]+ (e.g. "my_web" or "my_web/log").`,
    );
  }
  return { group, slug };
}

export function tryDocumentRef(
  group: string,
  slug: string,
): DocumentRef | null {
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) return null;
  if (slugSegments(slug) === null) return null;
  return { group: group as ContentGroup, slug };
}

/** Discovery localKey / former ArchiveDocument.path: `group/slug`. */
export function toLocalKey(ref: DocumentRef): string {
  return `${ref.group}/${ref.slug}`;
}

/** Terminal VFS path: `/group/slug`. */
export function toVfsPath(ref: DocumentRef): string {
  return `/${ref.group}/${ref.slug}`;
}

export function refsEqual(a: DocumentRef, b: DocumentRef): boolean {
  return a.group === b.group && a.slug === b.slug;
}

/**
 * Parse discovery localKey (`projects/foo`, `projects/my_web/log`,
 * optional leading `/`). Requires group + at least one slug segment;
 * interior empty segments are rejected (ADR 0013).
 */
export function fromLocalKey(localKey: string): DocumentRef {
  const normalized = localKey.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = normalized.split("/");
  if (parts.length < 2) {
    throw new DocumentRefError(
      `Invalid localKey: "${localKey}". Must be ${contentGroupLocalKeyHint()}.`,
    );
  }
  const [group, ...rest] = parts;
  const ref = tryDocumentRef(group!, rest.join("/"));
  if (!ref) {
    throw new DocumentRefError(
      `Invalid localKey: "${localKey}". Must be ${contentGroupLocalKeyHint()}.`,
    );
  }
  return ref;
}

export function tryFromLocalKey(localKey: string): DocumentRef | null {
  try {
    return fromLocalKey(localKey);
  } catch {
    return null;
  }
}

/**
 * Parse a document VFS path (`/projects/foo`, `/projects/my_web/log`).
 * Requires group + at least one slug segment; interior empty segments
 * are rejected (ADR 0013).
 * Directories and non-document nodes (`/timeline`, `/person`) → error.
 */
export function fromVfsPath(vfsPath: string): DocumentRef {
  const normalized = vfsPath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = normalized.split("/");
  if (parts.length < 2) {
    throw new DocumentRefError(
      `Invalid VFS document path: "${vfsPath}". Expected /projects/<slug>[/<sub>…], /thoughts/<slug>[/<sub>…], or /resources/<slug>[/<sub>…].`,
    );
  }
  const [group, ...rest] = parts;
  const ref = tryDocumentRef(group!, rest.join("/"));
  if (!ref) {
    throw new DocumentRefError(
      `Invalid VFS document path: "${vfsPath}". Expected /projects/<slug>[/<sub>…], /thoughts/<slug>[/<sub>…], or /resources/<slug>[/<sub>…].`,
    );
  }
  return ref;
}

export function tryFromVfsPath(vfsPath: string): DocumentRef | null {
  try {
    return fromVfsPath(vfsPath);
  } catch {
    return null;
  }
}
