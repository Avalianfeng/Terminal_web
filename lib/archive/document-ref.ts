import {
  CONTENT_GROUPS,
  contentGroupLocalKeyHint,
  slugSegments,
  type ContentGroup,
} from "./content-format";

/** Zone discriminator: no prefix = public; reserved `private/` prefix. */
export type DocumentZone = "public" | "private";

export const PRIVATE_ZONE_PREFIX = "private" as const;

/**
 * Canonical identity of a local archive document (`source: local`).
 * `zone` is derived from the path — never an independent mutable field.
 *
 * ADR 0013: `slug` is the group-relative path, one or more segments joined
 * by `/` (e.g. `my_web` or `my_web/log`); each segment matches SLUG_PATTERN.
 * ADR 0019: optional `private/` prefix → zone private.
 */
export type DocumentRef = {
  readonly zone: DocumentZone;
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

export function documentRef(
  group: ContentGroup,
  slug: string,
  zone: DocumentZone = "public",
): DocumentRef {
  if (!CONTENT_GROUPS.includes(group)) {
    throw new DocumentRefError(`Unknown group: ${group}`);
  }
  if (slugSegments(slug) === null) {
    throw new DocumentRefError(
      `Invalid slug: "${slug}". Each segment must match [a-z0-9_-]+ (e.g. "my_web" or "my_web/log").`,
    );
  }
  return { zone, group, slug };
}

export function tryDocumentRef(
  group: string,
  slug: string,
  zone: DocumentZone = "public",
): DocumentRef | null {
  if (!CONTENT_GROUPS.includes(group as ContentGroup)) return null;
  if (slugSegments(slug) === null) return null;
  return { zone, group: group as ContentGroup, slug };
}

/** Discovery localKey: `group/slug` or `private/group/slug`. */
export function toLocalKey(ref: DocumentRef): string {
  const base = `${ref.group}/${ref.slug}`;
  return ref.zone === "private" ? `${PRIVATE_ZONE_PREFIX}/${base}` : base;
}

/** Terminal VFS path: `/group/slug` or `/private/group/slug`. */
export function toVfsPath(ref: DocumentRef): string {
  return `/${toLocalKey(ref)}`;
}

export function refsEqual(a: DocumentRef, b: DocumentRef): boolean {
  return a.zone === b.zone && a.group === b.group && a.slug === b.slug;
}

function parseGroupSlugParts(
  parts: string[],
  source: string,
  kind: "localKey" | "vfs",
): DocumentRef {
  if (parts.length < 2) {
    throw new DocumentRefError(
      kind === "localKey"
        ? `Invalid localKey: "${source}". Must be ${contentGroupLocalKeyHint()} or private/<group>/<slug>.`
        : `Invalid VFS document path: "${source}". Expected /projects/<slug>… or /private/projects/<slug>….`,
    );
  }

  let zone: DocumentZone = "public";
  let group: string;
  let rest: string[];

  if (parts[0] === PRIVATE_ZONE_PREFIX) {
    if (parts.length < 3) {
      throw new DocumentRefError(
        kind === "localKey"
          ? `Invalid localKey: "${source}". Must be private/<group>/<slug>.`
          : `Invalid VFS document path: "${source}". Expected /private/<group>/<slug>….`,
      );
    }
    zone = "private";
    group = parts[1]!;
    rest = parts.slice(2);
  } else {
    group = parts[0]!;
    rest = parts.slice(1);
  }

  const ref = tryDocumentRef(group, rest.join("/"), zone);
  if (!ref) {
    throw new DocumentRefError(
      kind === "localKey"
        ? `Invalid localKey: "${source}". Must be ${contentGroupLocalKeyHint()} or private/<group>/<slug>.`
        : `Invalid VFS document path: "${source}". Expected /projects/<slug>… or /private/projects/<slug>….`,
    );
  }
  return ref;
}

/**
 * Parse discovery localKey (`projects/foo`, `private/thoughts/bar`,
 * optional leading `/`). Requires group + at least one slug segment.
 */
export function fromLocalKey(localKey: string): DocumentRef {
  const normalized = localKey.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return parseGroupSlugParts(normalized.split("/"), localKey, "localKey");
}

export function tryFromLocalKey(localKey: string): DocumentRef | null {
  try {
    return fromLocalKey(localKey);
  } catch {
    return null;
  }
}

/**
 * Parse a document VFS path (`/projects/foo`, `/private/thoughts/bar`).
 * Directories and non-document nodes (`/timeline`, `/person`) → error.
 */
export function fromVfsPath(vfsPath: string): DocumentRef {
  const normalized = vfsPath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return parseGroupSlugParts(normalized.split("/"), vfsPath, "vfs");
}

export function tryFromVfsPath(vfsPath: string): DocumentRef | null {
  try {
    return fromVfsPath(vfsPath);
  } catch {
    return null;
  }
}
