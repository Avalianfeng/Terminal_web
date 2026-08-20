/**
 * Command Intent ↔ ArchiveActionId (ADR 0020 / 0019).
 * Handlers pick Intent; permission.can(grant, action, zone) gates writes.
 */

import type { ArchiveActionId } from "./permission";

export type WriteCommandName = "edit" | "rm" | "mkdir" | "rmdir";

/** Map terminal write command (+ edit create/replace) → Action id. */
export function writeActionFor(
  command: WriteCommandName,
  options?: { exists?: boolean },
): ArchiveActionId {
  switch (command) {
    case "edit":
      return options?.exists ? "replace" : "create";
    case "rm":
      return "delete_doc";
    case "mkdir":
      return "mkdir";
    case "rmdir":
      return "rmdir";
  }
}

/** Read-side command → Action（刀3 可选接线；读已靠 scoped snapshot）。 */
export const READ_COMMAND_ACTION: Readonly<
  Partial<Record<string, ArchiveActionId>>
> = {
  open: "open",
  cat: "read_body",
  search: "search",
  find: "find",
  ls: "list_dir",
  tree: "tree",
  about: "read_person",
  timeline: "read_timeline",
  projects: "discover_docs",
  thoughts: "discover_docs",
  resources: "discover_docs",
};
