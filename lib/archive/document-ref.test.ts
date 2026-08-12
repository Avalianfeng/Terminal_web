import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DocumentRefError,
  documentRef,
  fromLocalKey,
  fromVfsPath,
  refsEqual,
  toLocalKey,
  toVfsPath,
  tryDocumentRef,
  tryFromLocalKey,
  tryFromVfsPath,
} from "./document-ref";

describe("documentRef", () => {
  it("constructs a valid ref", () => {
    const ref = documentRef("thoughts", "archive-system");
    assert.equal(ref.group, "thoughts");
    assert.equal(ref.slug, "archive-system");
  });

  it("rejects unknown group and bad slug", () => {
    assert.throws(() => documentRef("nope" as "projects", "x"), DocumentRefError);
    assert.throws(() => documentRef("projects", "Bad"), DocumentRefError);
    assert.throws(() => documentRef("projects", "a/b"), DocumentRefError);
  });

  it("tryDocumentRef returns null on invalid", () => {
    assert.equal(tryDocumentRef("nope", "x"), null);
    assert.equal(tryDocumentRef("projects", "Bad"), null);
    assert.deepEqual(tryDocumentRef("projects", "ok"), {
      group: "projects",
      slug: "ok",
    });
  });
});

describe("projections", () => {
  it("toLocalKey and toVfsPath", () => {
    const ref = documentRef("projects", "foo");
    assert.equal(toLocalKey(ref), "projects/foo");
    assert.equal(toVfsPath(ref), "/projects/foo");
  });

  it("refsEqual", () => {
    assert.equal(
      refsEqual(documentRef("projects", "x"), documentRef("projects", "x")),
      true,
    );
    assert.equal(
      refsEqual(documentRef("projects", "x"), documentRef("thoughts", "x")),
      false,
    );
  });
});

describe("fromLocalKey", () => {
  it("parses plain and leading-slash forms", () => {
    assert.deepEqual(fromLocalKey("thoughts/foo"), {
      group: "thoughts",
      slug: "foo",
    });
    assert.deepEqual(fromLocalKey("/projects/bar"), {
      group: "projects",
      slug: "bar",
    });
  });

  it("rejects nested, empty, and unknown groups", () => {
    assert.deepEqual(fromLocalKey("resources/foo"), {
      group: "resources",
      slug: "foo",
    });
    assert.throws(() => fromLocalKey("thoughts/a/b"), DocumentRefError);
    assert.throws(() => fromLocalKey("thoughts/"), DocumentRefError);
    assert.throws(() => fromLocalKey("other/foo"), DocumentRefError);
    assert.throws(() => fromLocalKey("Thoughts/foo"), DocumentRefError);
    assert.equal(tryFromLocalKey("nope"), null);
  });
});

describe("fromVfsPath", () => {
  it("parses document vfs paths", () => {
    assert.deepEqual(fromVfsPath("/thoughts/foo"), {
      group: "thoughts",
      slug: "foo",
    });
  });

  it("rejects non-document vfs nodes", () => {
    assert.throws(() => fromVfsPath("/timeline"), DocumentRefError);
    assert.throws(() => fromVfsPath("/person"), DocumentRefError);
    assert.throws(() => fromVfsPath("/projects"), DocumentRefError);
    assert.throws(() => fromVfsPath("/"), DocumentRefError);
    assert.equal(tryFromVfsPath("/timeline"), null);
  });
});
