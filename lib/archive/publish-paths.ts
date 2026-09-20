/**
 * Upload path selection (ADR 0021): public groups, bypass files, and
 * private/<group>/**. Never Git; never `..`. Ops console must upload
 * without rsync --delete.
 */

import { CONTENT_GROUPS } from "./content-format";

const BYPASS_FILES = new Set(["person.json", "timeline.md"]);

function isGroupPath(path: string): boolean {
  const [group, ...rest] = path.split("/");
  return (
    CONTENT_GROUPS.includes(group as (typeof CONTENT_GROUPS)[number]) &&
    rest.length > 0
  );
}

/**
 * Relative paths under `content/` (posix `/`, no `content/` prefix).
 */
export function selectPublishPaths(
  relativePaths: readonly string[],
): string[] {
  return relativePaths.filter((raw) => {
    const path = raw.replace(/^\/+/, "").replace(/\\/g, "/");
    if (!path || path.includes("..")) return false;
    if (BYPASS_FILES.has(path)) return true;
    if (path === "private" || path === "private/") return false;
    if (path.startsWith("private/")) {
      return isGroupPath(path.slice("private/".length));
    }
    return isGroupPath(path);
  });
}
