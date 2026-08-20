import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentRef } from "./document-ref.ts";
import type { ArchiveDocument, ArchiveSnapshot } from "./types.ts";
import {
  classifyPath,
  lookupVfsNode,
  normalizeFindNeedle,
  resolveAbsoluteVfsPath,
  resolveCreatableDirectory,
  resolveCreatableDocument,
  resolveExistingDocument,
  splitVfsDirPath,
} from "./target-resolver.ts";

function doc(
  group: "projects" | "thoughts" | "resources",
  slug: string,
  zone: "public" | "private" = "public",
): ArchiveDocument {
  return {
    ref: documentRef(group, slug, zone),
    title: slug,
    summary: "",
    body: "body",
    tags: [],
  };
}

function snapshot(docs: ArchiveDocument[]): ArchiveSnapshot {
  return {
    person: {
      name: "t",
      description: "",
      currentFocus: "",
      created: "",
      links: [],
    },
    projects: docs.filter((d) => d.ref.group === "projects"),
    thoughts: docs.filter((d) => d.ref.group === "thoughts"),
    resources: docs.filter((d) => d.ref.group === "resources"),
    directories: {
      projects: [],
      thoughts: [],
      resources: [],
      private: { projects: [], thoughts: [], resources: [] },
    },
    privateZoneMounted: true,
    timeline: [],
    generatedAt: "2026-08-20T00:00:00.000Z",
  };
}

describe("resolveAbsoluteVfsPath", () => {
  it("does not join absolute or ~ paths with cwd", () => {
    assert.equal(
      resolveAbsoluteVfsPath("/resources", "~/private/thoughts/x"),
      "/private/thoughts/x",
    );
    assert.equal(
      resolveAbsoluteVfsPath("/resources", "/private/thoughts/x"),
      "/private/thoughts/x",
    );
    assert.equal(resolveAbsoluteVfsPath("/resources", "~"), "/");
  });

  it("joins relative paths to cwd", () => {
    assert.equal(
      resolveAbsoluteVfsPath("/projects/my_web", "notes"),
      "/projects/my_web/notes",
    );
  });
});

describe("classifyPath", () => {
  it("classifies root zone group bypass writable", () => {
    assert.equal(classifyPath("/").kind, "root");
    assert.deepEqual(classifyPath("/private"), { kind: "zone", zone: "private" });
    assert.deepEqual(classifyPath("/projects"), {
      kind: "group",
      zone: "public",
      group: "projects",
    });
    assert.deepEqual(classifyPath("/private/thoughts"), {
      kind: "group",
      zone: "private",
      group: "thoughts",
    });
    assert.deepEqual(classifyPath("/person"), {
      kind: "bypass",
      name: "person",
    });
    assert.deepEqual(classifyPath("/private/thoughts/secret"), {
      kind: "writable",
      zone: "private",
      group: "thoughts",
      segments: ["secret"],
    });
  });
});

describe("resolveCreatableDocument", () => {
  const snap = snapshot([
    doc("projects", "my_web/log"),
    doc("thoughts", "secret", "private"),
  ]);

  it("from /resources, ~/private/thoughts/x is private thoughts (not resources)", () => {
    const resolved = resolveCreatableDocument(
      "/resources",
      "~/private/thoughts/agent-note",
      snap,
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.value.ref.zone, "private");
    assert.equal(resolved.value.ref.group, "thoughts");
    assert.equal(resolved.value.ref.slug, "agent-note");
    assert.equal(resolved.value.exists, false);
  });

  it("rejects root / zone / group roots", () => {
    for (const [cwd, token] of [
      ["/", "~/test"],
      ["/", "/test_dir"],
      ["/private", "test_dir"],
    ] as const) {
      const resolved = resolveCreatableDocument(cwd, token, snap);
      assert.equal(resolved.ok, false, `${cwd} ${token}`);
      if (!resolved.ok) {
        assert.ok(
          /不允许|zone|组根|根目录/.test(resolved.hint),
          resolved.hint,
        );
      }
    }
    assert.equal(resolveCreatableDocument("/", "/projects", snap).ok, false);
    assert.equal(
      resolveCreatableDocument("/", "/private/thoughts", snap).ok,
      false,
    );
  });

  it("bare slug at root defaults to projects (create)", () => {
    const resolved = resolveCreatableDocument("/", "brand_new", snap);
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.deepEqual(resolved.value.ref, {
      zone: "public",
      group: "projects",
      slug: "brand_new",
    });
    assert.equal(resolved.value.exists, false);
  });

  it("opens existing private doc by absolute path", () => {
    const resolved = resolveCreatableDocument(
      "/",
      "/private/thoughts/secret",
      snap,
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.value.exists, true);
    assert.equal(resolved.value.ref.zone, "private");
  });
});

describe("resolveCreatableDirectory", () => {
  it("allows group-relative and private paths; rejects shells", () => {
    const ok = resolveCreatableDirectory("/", "/private/thoughts/foo");
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.ref.zone, "private");
      assert.equal(ok.value.vfsPath, "/private/thoughts/foo");
    }
    assert.equal(resolveCreatableDirectory("/", "test_dir").ok, false);
    assert.equal(resolveCreatableDirectory("/private", "test_dir").ok, false);
    assert.equal(resolveCreatableDirectory("/", "/projects").ok, false);
  });
});

describe("resolveExistingDocument / splitVfsDirPath", () => {
  const snap = snapshot([doc("thoughts", "note"), doc("projects", "flat")]);

  it("rm finds existing doc; directories suggest rmdir", () => {
    const docHit = resolveExistingDocument("/", "/thoughts/note", snap);
    assert.equal(docHit.ok, true);
    const dirHit = resolveExistingDocument("/", "/projects", snap);
    assert.equal(dirHit.ok, false);
    if (!dirHit.ok) assert.ok(dirHit.hint.includes("rmdir"), dirHit.hint);
  });

  it("splitVfsDirPath still parses private dirs", () => {
    assert.deepEqual(splitVfsDirPath("/private/thoughts/a/b"), {
      zone: "private",
      group: "thoughts",
      segments: ["a", "b"],
    });
  });
});

describe("lookupVfsNode / normalizeFindNeedle", () => {
  const snap = snapshot([
    doc("thoughts", "secret", "private"),
    doc("projects", "flat"),
  ]);

  it("from /resources, ~/private/thoughts/secret finds private node", () => {
    const { abs, node } = lookupVfsNode(
      "/resources",
      "~/private/thoughts/secret",
      snap,
    );
    assert.equal(abs, "/private/thoughts/secret");
    assert.ok(node);
    assert.equal(node!.refSlug, "secret");
  });

  it("normalizeFindNeedle absoluteizes path-like queries", () => {
    assert.equal(
      normalizeFindNeedle("/resources", "~/private"),
      "/private",
    );
    assert.equal(normalizeFindNeedle("/", "flat"), "flat");
  });
});
