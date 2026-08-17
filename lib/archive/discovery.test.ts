import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildItemsIndex,
  findItemByKey,
  toItemListItem,
  type ItemHrefFor,
} from "./discovery.ts";
import type { ArchiveDocument, ArchiveSnapshot } from "./types.ts";

function doc(
  group: "projects" | "thoughts" | "resources",
  slug: string,
  extra: Partial<ArchiveDocument> = {},
): ArchiveDocument {
  return {
    ref: { group, slug },
    title: slug,
    summary: "",
    body: "body",
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
    timeline: [],
    generatedAt: "2026-08-11T00:00:00.000Z",
  };
}

describe("discovery", () => {
  it("projects ItemListItem with injectable href", () => {
    const hrefFor: ItemHrefFor = (key) => `custom://${key}`;
    const item = toItemListItem(doc("thoughts", "a", { tags: ["x"] }), hrefFor);
    assert.equal(item.localKey, "thoughts/a");
    assert.equal(item.href, "custom://thoughts/a");
    assert.deepEqual(item.tags, ["x"]);
  });

  it("filters index by status and tag AND", () => {
    const snap = snapshot([
      doc("thoughts", "a", { status: "draft", tags: ["alpha", "beta"] }),
      doc("thoughts", "b", { status: "done", tags: ["alpha"] }),
      doc("projects", "c", { status: "draft", tags: ["alpha", "beta"] }),
    ]);

    const { items } = buildItemsIndex(snap, {
      status: "draft",
      tag: ["alpha", "beta"],
    });
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.status === "draft"));
  });

  it("projects fields whitelist", () => {
    const snap = snapshot([doc("thoughts", "a", { summary: "s" })]);
    const { items } = buildItemsIndex(snap, { fields: ["localKey", "title", "nope"] });
    assert.deepEqual(Object.keys(items[0]!).sort(), ["localKey", "title"]);
  });

  it("findItemByKey resolves local documents only", () => {
    const snap = snapshot([
      doc("projects", "p1"),
      doc("resources", "r1", { url: "https://example.com", resourceType: "article" }),
    ]);
    assert.ok(findItemByKey(snap, "local", "projects/p1"));
    assert.ok(findItemByKey(snap, "local", "resources/r1"));
    assert.equal(findItemByKey(snap, "github", "projects/p1"), null);
    assert.equal(findItemByKey(snap, "local", "projects/missing"), null);
  });

  it("projects multi-segment localKey (ADR 0013)", () => {
    const nested = doc("projects", "my_web/log");
    const item = toItemListItem(nested);
    assert.equal(item.localKey, "projects/my_web/log");
    assert.equal(item.href, "/api/v1/items?source=local&localKey=projects%2Fmy_web%2Flog");
  });

  it("index and lookup cover nested documents (ADR 0013)", () => {
    const snap = snapshot([
      doc("projects", "my_web"),
      doc("projects", "my_web/log"),
      doc("projects", "my_web/notes"),
      doc("thoughts", "a/b/c"),
    ]);
    const { items } = buildItemsIndex(snap);
    const keys = items.map((item) => item.localKey).sort();
    assert.deepEqual(keys, [
      "projects/my_web",
      "projects/my_web/log",
      "projects/my_web/notes",
      "thoughts/a/b/c",
    ]);
    assert.ok(findItemByKey(snap, "local", "projects/my_web/log"));
    assert.ok(findItemByKey(snap, "local", "thoughts/a/b/c"));
    assert.equal(findItemByKey(snap, "local", "thoughts/a"), null);
  });

  it("filters apply to nested documents too", () => {
    const snap = snapshot([
      doc("projects", "my_web/log", { status: "done", tags: ["cluster:my_web"] }),
      doc("projects", "other", { status: "draft" }),
    ]);
    const { items } = buildItemsIndex(snap, {
      status: "done",
      tag: ["cluster:my_web"],
    });
    assert.deepEqual(items.map((item) => item.localKey), ["projects/my_web/log"]);
  });
});
