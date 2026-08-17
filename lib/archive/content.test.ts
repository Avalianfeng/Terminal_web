import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getArchiveSnapshot } from "./content";
import { slugSegments } from "./content-format";

describe("content read path (ADR 0013)", () => {
  it("loads snapshot recursively with valid multi-segment slugs", async () => {
    const snapshot = await getArchiveSnapshot();
    const all = [
      ...snapshot.projects,
      ...snapshot.thoughts,
      ...snapshot.resources,
    ];
    assert.ok(all.length > 0, "expected at least one document");
    for (const document of all) {
      assert.ok(
        slugSegments(document.ref.slug) !== null,
        `invalid slug parsed from disk: ${document.ref.slug}`,
      );
      assert.ok(
        document.ref.group === "projects" ||
          document.ref.group === "thoughts" ||
          document.ref.group === "resources",
        `unexpected group: ${document.ref.group}`,
      );
    }
  });
});
