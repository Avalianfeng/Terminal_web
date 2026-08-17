import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { getArchiveSnapshot, readGroupTree } from "./content";
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

  it("exposes real directories per group (disk state)", async () => {
    const snapshot = await getArchiveSnapshot();
    for (const group of ["projects", "thoughts", "resources"] as const) {
      const dirs = snapshot.directories[group];
      assert.ok(Array.isArray(dirs), `directories.${group} is an array`);
      for (const dir of dirs) {
        assert.ok(
          slugSegments(dir) !== null,
          `invalid directory path from disk: ${group}/${dir}`,
        );
      }
    }
  });

  it("collects multi-level files and dirs relative to group root (regression)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "dsh-content-"));
    try {
      await mkdir(path.join(tmp, "a", "b", "c"), { recursive: true });
      await mkdir(path.join(tmp, "my_web"), { recursive: true });
      await writeFile(path.join(tmp, "flat.md"), "# flat", "utf8");
      await writeFile(path.join(tmp, "my_web", "log.md"), "# log", "utf8");
      const { files, dirs } = await readGroupTree(tmp);
      assert.deepEqual(files.sort(), ["flat.md", "my_web/log.md"]);
      assert.deepEqual(dirs.sort(), ["a", "a/b", "a/b/c", "my_web"]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
