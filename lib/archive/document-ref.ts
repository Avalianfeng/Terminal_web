import {
  CONTENT_GROUPS,
  SLUG_PATTERN,
  contentGroupLocalKeyHint,
  type ContentGroup,
} from "./content-format";

/**
 * Canonical identity of a local archive document (`source: local`).
 * Projects to discovery localKey and VFS path only — not filesystem paths.
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
  if (!SLUG_PATTERN.test(slug)) {
    throw new DocumentRefError(
      `Invalid slug: "${slug}". Allowed: [a-z0-9_-]+`,
    );
  }
  return { group, slug };
}

export function tryDocumentRef(
  group: string,
  slug: string,
): DocumentRef | null {
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) return null;
  if (!SLUG_PATTERN.test(slug)) return null;
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
 * Parse discovery localKey (`projects/foo`, optional leading `/`).
 * Rejects nested slug segments and unknown groups.
 */
export function fromLocalKey(localKey: string): DocumentRef {
  const normalized = localKey.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new DocumentRefError(
      `Invalid localKey: "${localKey}". Must be ${contentGroupLocalKeyHint()}.`,
    );
  }
  const [group, slug] = parts;
  const ref = tryDocumentRef(group!, slug!);
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
 * Parse a document VFS path (`/projects/foo`).
 * Directories and non-document nodes (`/timeline`, `/person`) → error.
 */
export function fromVfsPath(vfsPath: string): DocumentRef {
  const normalized = vfsPath.trim().replace(/\/+$/, "") || "/";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new DocumentRefError(
      `Invalid VFS document path: "${vfsPath}". Expected /projects/<slug>, /thoughts/<slug>, or /resources/<slug>.`,
    );
  }
  const [group, slug] = parts;
  const ref = tryDocumentRef(group!, slug!);
  if (!ref) {
    throw new DocumentRefError(
      `Invalid VFS document path: "${vfsPath}". Expected /projects/<slug>, /thoughts/<slug>, or /resources/<slug>.`,
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
