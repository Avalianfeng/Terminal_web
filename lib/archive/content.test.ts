import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { getArchiveSnapshot, readGroupTree } from "./content";
import { slugSegments } from "./content-format";

/** Fixture content tree under tmp cwd（ADR 0018：CI/克隆无真实正文）。 */
async function withFixtureContent(
  run: () => Promise<void>,
): Promise<void> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "dsh-snap-"));
  const prev = process.cwd();
  try {
    await mkdir(path.join(tmp, "content", "projects", "my_web"), {
      recursive: true,
    });
    await mkdir(path.join(tmp, "content", "thoughts"), { recursive: true });
    await mkdir(path.join(tmp, "content", "resources"), { recursive: true });
    await writeFile(
      path.join(tmp, "content", "person.json"),
      JSON.stringify({
        name: "fixture",
        description: "",
        currentFocus: "",
        created: "2026-01-01",
        links: [],
      }),
      "utf8",
    );
    await writeFile(
      path.join(tmp, "content", "timeline.md"),
      "## 2026-01-01 fixture\n\nbody\n",
      "utf8",
    );
    await writeFile(
      path.join(tmp, "content", "projects", "flat.md"),
      "---\ntitle: flat\n---\n\n# flat\n",
      "utf8",
    );
    await writeFile(
      path.join(tmp, "content", "projects", "my_web", "log.md"),
      "---\ntitle: log\n---\n\n# log\n",
      "utf8",
    );
    await writeFile(
      path.join(tmp, "content", "thoughts", "note.md"),
      "---\ntitle: note\n---\n\n# note\n",
      "utf8",
    );
    process.chdir(tmp);
    await run();
  } finally {
    process.chdir(prev);
    await rm(tmp, { recursive: true, force: true });
  }
}

describe("content read path (ADR 0013 / 0018)", () => {
  it("loads snapshot recursively with valid multi-segment slugs", async () => {
    await withFixtureContent(async () => {
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
      assert.equal(snapshot.person.name, "fixture");
    });
  });

  it("exposes real directories per group (disk state)", async () => {
    await withFixtureContent(async () => {
      const snapshot = await getArchiveSnapshot();
      assert.ok(snapshot.directories.projects.includes("my_web"));
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
  });

  it("loads private zone docs with zone=private and scopes visitors", async () => {
    await withFixtureContent(async () => {
      await mkdir(path.join(process.cwd(), "content", "private", "thoughts"), {
        recursive: true,
      });
      await writeFile(
        path.join(
          process.cwd(),
          "content",
          "private",
          "thoughts",
          "secret.md",
        ),
        "---\ntitle: secret\n---\n\n# secret\n",
        "utf8",
      );
      const snapshot = await getArchiveSnapshot();
      const secret = snapshot.thoughts.find((d) => d.ref.slug === "secret");
      assert.ok(secret);
      assert.equal(secret.ref.zone, "private");
      const { VISITOR_GRANT, scopeSnapshot } = await import("./permission");
      const scoped = scopeSnapshot(snapshot, VISITOR_GRANT);
      assert.equal(
        scoped.thoughts.find((d) => d.ref.slug === "secret"),
        undefined,
      );
    });
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
