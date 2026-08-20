import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectPublishPaths } from "./publish-paths.ts";

describe("selectPublishPaths", () => {
  it("includes public groups and bypass files; excludes private/**", () => {
    const published = selectPublishPaths([
      "person.json",
      "timeline.md",
      "projects/a.md",
      "thoughts/b.md",
      "resources/c.md",
      "private/projects/secret.md",
      "private/thoughts/x.md",
      "music/playlists/foo.yaml",
      "../escape.md",
    ]);
    assert.deepEqual(published.sort(), [
      "person.json",
      "projects/a.md",
      "resources/c.md",
      "thoughts/b.md",
      "timeline.md",
    ]);
  });

  it("rejects bare private prefix", () => {
    assert.deepEqual(selectPublishPaths(["private", "private/"]), []);
  });
});
