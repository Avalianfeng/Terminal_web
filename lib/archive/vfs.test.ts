import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVfs,
  isDirectory,
  listNode,
  resolveVfsPath,
  treeLines,
} from "./vfs";
import type { ArchiveDocument, ArchiveSnapshot } from "./types";

function doc(
  group: "projects" | "thoughts" | "resources",
  slug: string,
): ArchiveDocument {
  return {
    ref: { group, slug },
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
    timeline: [],
    generatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("vfs (ADR 0013)", () => {
  it("builds nested directories from multi-segment slugs", () => {
    const root = createVfs(
      snapshot([
        doc("projects", "flat"),
        doc("projects", "my_web/log"),
        doc("projects", "my_web/notes/2026"),
        doc("thoughts", "a/b"),
      ]),
    );

    const projects = resolveVfsPath(root, "/", "/projects")!;
    // 目录优先、按名排序
    assert.deepEqual(
      listNode(projects).map((n) => n.name),
      ["my_web", "flat"],
    );

    const myWeb = resolveVfsPath(root, "/", "/projects/my_web")!;
    assert.equal(myWeb.type, "dir");
    assert.deepEqual(
      listNode(myWeb).map((n) => n.name),
      ["notes", "log"],
    );

    const log = resolveVfsPath(root, "/", "/projects/my_web/log")!;
    assert.equal(log.type, "project");
    assert.equal(log.refSlug, "my_web/log");

    const deep = resolveVfsPath(root, "/", "/projects/my_web/notes/2026")!;
    assert.equal(deep.type, "project");
    assert.equal(deep.refSlug, "my_web/notes/2026");

    const notes = resolveVfsPath(root, "/", "/projects/my_web/notes")!;
    assert.equal(notes.type, "dir");
    assert.equal(isDirectory(notes), true);
  });

  it("merges entry document and folder into a dual node", () => {
    const root = createVfs(
      snapshot([
        doc("projects", "my_web"),
        doc("projects", "my_web/log"),
      ]),
    );
    const myWeb = resolveVfsPath(root, "/", "/projects/my_web")!;
    assert.equal(myWeb.type, "project");
    assert.equal(myWeb.refSlug, "my_web");
    assert.equal(isDirectory(myWeb), true);
    assert.deepEqual(
      listNode(myWeb).map((n) => n.name),
      ["log"],
    );
  });

  it("merges folder-first then entry document", () => {
    const root = createVfs(
      snapshot([
        doc("projects", "my_web/log"),
        doc("projects", "my_web"),
      ]),
    );
    const myWeb = resolveVfsPath(root, "/", "/projects/my_web")!;
    assert.equal(myWeb.type, "project");
    assert.equal(myWeb.refSlug, "my_web");
    assert.equal(isDirectory(myWeb), true);
  });

  it("treeLines shows nested hierarchy", () => {
    const root = createVfs(snapshot([doc("projects", "my_web/log")]));
    const lines = treeLines(root);
    assert.ok(lines.some((l) => l.includes("my_web/")));
    assert.ok(lines.some((l) => l.includes("log")));
  });

  it("resolveVfsPath missing path returns null", () => {
    const root = createVfs(snapshot([doc("projects", "a")]));
    assert.equal(resolveVfsPath(root, "/", "/projects/missing"), null);
    assert.equal(resolveVfsPath(root, "/", "/nope"), null);
    assert.equal(resolveVfsPath(root, "/", "/projects/a/sub"), null);
  });
});
