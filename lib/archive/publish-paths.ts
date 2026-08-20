/**
 * Publish path selection invariant (ADR 0019):
 * ∀ path ∈ published → path ∉ content/private/**
 */

import { CONTENT_GROUPS } from "./content-format";

const BYPASS_FILES = new Set(["person.json", "timeline.md"]);

/**
 * Given relative paths under `content/` (posix `/` separators, no `content/` prefix),
 * return the subset safe to publish to a public VPS.
 */
export function selectPublishPaths(
  relativePaths: readonly string[],
): string[] {
  return relativePaths.filter((raw) => {
    const path = raw.replace(/^\/+/, "").replace(/\\/g, "/");
    if (!path || path.includes("..")) return false;
    if (path === "private" || path.startsWith("private/")) return false;
    if (BYPASS_FILES.has(path)) return true;
    const [group] = path.split("/");
    return CONTENT_GROUPS.includes(group as (typeof CONTENT_GROUPS)[number]);
  });
}
