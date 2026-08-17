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

function snapshot(
  docs: ArchiveDocument[],
  directories: Partial<ArchiveSnapshot["directories"]> = {},
): ArchiveSnapshot {
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
      ...directories,
    },
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

  it("shows real empty directories from snapshot (disk state, ADR 0013)", () => {
    const root = createVfs(
      snapshot([], {
        projects: ["my_web", "my_web/notes", "empty"],
        thoughts: ["a/b"],
        resources: [],
      }),
    );
    const projects = resolveVfsPath(root, "/", "/projects")!;
    assert.deepEqual(
      listNode(projects).map((n) => n.name),
      ["empty", "my_web"],
    );
    const myWeb = resolveVfsPath(root, "/", "/projects/my_web")!;
    assert.equal(myWeb.type, "dir");
    assert.equal(isDirectory(myWeb), true);
    assert.deepEqual(
      listNode(myWeb).map((n) => n.name),
      ["notes"],
    );
    // 空目录可 cd（isDirectory）且无文档
    const empty = resolveVfsPath(root, "/", "/projects/empty")!;
    assert.equal(empty.type, "dir");
    assert.equal(isDirectory(empty), true);
    assert.deepEqual(listNode(empty), []);
  });

  it("merges empty dir with doc into dual node (either order)", () => {
    // 目录先到（盘上先 mkdir），子文档后到：纯目录 + 子文档
    const dirFirst = createVfs(
      snapshot([doc("projects", "my_web/log")], {
        projects: ["my_web"],
      }),
    );
    const node1 = resolveVfsPath(dirFirst, "/", "/projects/my_web")!;
    assert.equal(node1.type, "dir");
    assert.equal(isDirectory(node1), true);
    assert.deepEqual(
      listNode(node1).map((n) => n.name),
      ["log"],
    );

    // 入口篇文档先到，目录后到（mkdir 在已有入口篇旁建簇）→ 复合节点
    const docFirst = createVfs(
      snapshot(
        [doc("projects", "my_web")],
        { projects: ["my_web/log"], thoughts: [], resources: [] },
      ),
    );
    const node2 = resolveVfsPath(docFirst, "/", "/projects/my_web")!;
    assert.equal(node2.type, "project");
    assert.equal(node2.refSlug, "my_web");
    assert.equal(isDirectory(node2), true);
    assert.deepEqual(
      listNode(node2).map((n) => n.name),
      ["log"],
    );
  });
});
