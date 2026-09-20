/**
 * Archive permission kernel (ADR 0019 + 0022).
 * No HTTP / cookies / Bearer — only Principal → Grant, Action, Zone, can().
 */

import type { ArchiveDocument, ArchiveSnapshot } from "./types";
import type { DocumentZone } from "./document-ref";

/** Monotone: public < member < owner */
export type PrincipalLevel = "public" | "member" | "owner";

export const LEVEL_ORDER: Record<PrincipalLevel, number> = {
  public: 0,
  member: 1,
  owner: 2,
};

export type ActionCapability = "read" | "writeCreate" | "writeMutate";

export type ArchiveActionId =
  | "discover_docs"
  | "open"
  | "read_body"
  | "search"
  | "find"
  | "list_dir"
  | "tree"
  | "read_person"
  | "read_timeline"
  | "create"
  | "replace"
  | "patch"
  | "delete_doc"
  | "mkdir"
  | "rmdir";

export const ARCHIVE_ACTION_CAPABILITY: Record<
  ArchiveActionId,
  ActionCapability
> = {
  discover_docs: "read",
  open: "read",
  read_body: "read",
  search: "read",
  find: "read",
  list_dir: "read",
  tree: "read",
  read_person: "read",
  read_timeline: "read",
  create: "writeCreate",
  mkdir: "writeCreate",
  replace: "writeMutate",
  patch: "writeMutate",
  delete_doc: "writeMutate",
  rmdir: "writeMutate",
};

/** Logical actor for grant resolution (Agent = same grants as human peers). */
export type ArchiveActor =
  | "visitor"
  | "member"
  | "owner"
  | "owner-password"
  | "anonymous-agent"
  | "owner-agent";

export type PrincipalGrant = {
  readonly level: PrincipalLevel;
  readonly writeCreate: boolean;
  readonly writeMutate: boolean;
};

export const VISITOR_GRANT: PrincipalGrant = {
  level: "public",
  writeCreate: false,
  writeMutate: false,
};

export const MEMBER_GRANT: PrincipalGrant = {
  level: "member",
  writeCreate: false,
  writeMutate: false,
};

export const OWNER_GRANT: PrincipalGrant = {
  level: "owner",
  writeCreate: true,
  writeMutate: true,
};

/** Production password session: public read, create (incl. private drop-box), no mutate. */
export const PASSWORD_SESSION_GRANT: PrincipalGrant = {
  level: "public",
  writeCreate: true,
  writeMutate: false,
};

export function grantFor(actor: ArchiveActor): PrincipalGrant {
  switch (actor) {
    case "visitor":
    case "anonymous-agent":
      return VISITOR_GRANT;
    case "member":
      return MEMBER_GRANT;
    case "owner-password":
      return PASSWORD_SESSION_GRANT;
    case "owner":
    case "owner-agent":
      return OWNER_GRANT;
  }
}

/** private zone requires member+; public requires public+. */
export function zoneMinLevel(zone: DocumentZone): PrincipalLevel {
  return zone === "private" ? "member" : "public";
}

export function levelAtLeast(
  grant: PrincipalLevel,
  required: PrincipalLevel,
): boolean {
  return LEVEL_ORDER[grant] >= LEVEL_ORDER[required];
}

/**
 * Visibility/zone decides reachability for **read**;
 * writeCreate may target private without read (ADR 0022 drop-box).
 * Unreachable-for-read objects are omitted from snapshots (never 403).
 */
export function can(
  grant: PrincipalGrant,
  action: ArchiveActionId,
  zone: DocumentZone,
): boolean {
  const needed = ARCHIVE_ACTION_CAPABILITY[action];
  if (needed === "read") {
    return levelAtLeast(grant.level, zoneMinLevel(zone));
  }
  if (needed === "writeCreate") {
    if (!grant.writeCreate) return false;
    if (zone === "private") return true;
    return levelAtLeast(grant.level, zoneMinLevel(zone));
  }
  if (!grant.writeMutate) return false;
  return levelAtLeast(grant.level, zoneMinLevel(zone));
}

export function canReachZone(
  grant: PrincipalGrant,
  zone: DocumentZone,
): boolean {
  return levelAtLeast(grant.level, zoneMinLevel(zone));
}

function emptyPrivateDirs() {
  return {
    projects: [] as string[],
    thoughts: [] as string[],
    resources: [] as string[],
  };
}

function filterDocs(
  documents: ArchiveDocument[],
  grant: PrincipalGrant,
): ArchiveDocument[] {
  return documents.filter((document) =>
    canReachZone(grant, document.ref.zone ?? "public"),
  );
}

/**
 * Project snapshot to what the grant can **read**.
 * Unreachable docs and private directories are omitted (not empty shells).
 */
export function scopeSnapshot(
  snapshot: ArchiveSnapshot,
  grant: PrincipalGrant,
): ArchiveSnapshot {
  if (canReachZone(grant, "private")) {
    return snapshot;
  }
  return {
    ...snapshot,
    projects: filterDocs(snapshot.projects, grant),
    thoughts: filterDocs(snapshot.thoughts, grant),
    resources: filterDocs(snapshot.resources, grant),
    directories: {
      projects: snapshot.directories.projects,
      thoughts: snapshot.directories.thoughts,
      resources: snapshot.directories.resources,
      private: emptyPrivateDirs(),
    },
    privateZoneMounted: false,
  };
}
