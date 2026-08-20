import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findNodes, QueryError, searchDocuments } from "./query.ts";
import type { ArchiveDocument, ArchiveSnapshot } from "./types.ts";

function doc(
  group: "projects" | "thoughts" | "resources",
  slug: string,
  extra: Partial<ArchiveDocument> = {},
): ArchiveDocument {
  return {
    ref: { zone: "public", group, slug },
    title: slug,
    summary: "",
    body: `body of ${slug}`,
    tags: [],
    ...extra,
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
    privateZoneMounted: false,
    timeline: [],
    generatedAt: "2026-08-20T00:00:00.000Z",
  };
}

const snap = snapshot([
  doc("thoughts", "digital-archive-entry", {
    title: "数字档案",
    body: "终端探索与 HTTP",
    tags: ["archive"],
  }),
  doc("projects", "my_web/log"),
]);

describe("query", () => {
  it("searchDocuments matches body and rejects empty q", () => {
    const hits = searchDocuments(snap, "HTTP");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.ref.slug, "digital-archive-entry");

    assert.throws(
      () => searchDocuments(snap, "   "),
      (error: unknown) => error instanceof QueryError,
    );
  });

  it("findNodes matches nested path; empty q lists openable nodes", () => {
    const hits = findNodes(snap, "log");
    assert.ok(hits.some((n) => n.path === "/projects/my_web/log"));
    assert.equal(hits.find((n) => n.path === "/projects/my_web/log")?.localKey, "projects/my_web/log");

    const all = findNodes(snap, "");
    assert.ok(all.length > 0);
    assert.ok(all.some((n) => n.path === "/projects/my_web/log"));
  });
});
