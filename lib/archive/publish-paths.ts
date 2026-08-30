/**
 * Upload path selection. **Current behavior** still matches old 0019:
 * published subset excludes `content/private/**`.
 * Target policy (ADR 0021): private may live on the VPS; do not feed this
 * list into `rsync --delete` from a sparse local tree until the ops console
 * is upload-only.
 */

import { CONTENT_GROUPS } from "./content-format";

const BYPASS_FILES = new Set(["person.json", "timeline.md"]);

/**
 * Given relative paths under `content/` (posix `/` separators, no `content/` prefix),
 * return the subset the **current** kernel will list for upload.
 * Still excludes `private/**` (legacy 0019). ADR 0021 wants private included
 * after the ops console is upload-only.
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
