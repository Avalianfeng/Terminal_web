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
  it("constructs a valid flat ref", () => {
    const ref = documentRef("thoughts", "archive-system");
    assert.equal(ref.group, "thoughts");
    assert.equal(ref.slug, "archive-system");
  });

  it("constructs a valid multi-segment ref (ADR 0013)", () => {
    const ref = documentRef("projects", "my_web/log");
    assert.equal(ref.group, "projects");
    assert.equal(ref.slug, "my_web/log");
    assert.equal(documentRef("resources", "a/b/c").slug, "a/b/c");
  });

  it("rejects unknown group and bad slugs", () => {
    assert.throws(() => documentRef("nope" as "projects", "x"), DocumentRefError);
    assert.throws(() => documentRef("projects", "Bad"), DocumentRefError);
    assert.throws(() => documentRef("projects", "a//b"), DocumentRefError);
    assert.throws(() => documentRef("projects", "/a"), DocumentRefError);
    assert.throws(() => documentRef("projects", "a/"), DocumentRefError);
    assert.throws(() => documentRef("projects", "a/Bad"), DocumentRefError);
    assert.throws(() => documentRef("projects", "a b"), DocumentRefError);
    assert.throws(() => documentRef("projects", ""), DocumentRefError);
  });

  it("tryDocumentRef returns null on invalid", () => {
    assert.equal(tryDocumentRef("nope", "x"), null);
    assert.equal(tryDocumentRef("projects", "Bad"), null);
    assert.equal(tryDocumentRef("projects", "a//b"), null);
    assert.deepEqual(tryDocumentRef("projects", "ok"), {
      group: "projects",
      slug: "ok",
    });
    assert.deepEqual(tryDocumentRef("projects", "my_web/log"), {
      group: "projects",
      slug: "my_web/log",
    });
  });
});

describe("projections", () => {
  it("toLocalKey and toVfsPath (flat and multi-segment)", () => {
    const ref = documentRef("projects", "foo");
    assert.equal(toLocalKey(ref), "projects/foo");
    assert.equal(toVfsPath(ref), "/projects/foo");

    const nested = documentRef("projects", "my_web/log");
    assert.equal(toLocalKey(nested), "projects/my_web/log");
    assert.equal(toVfsPath(nested), "/projects/my_web/log");
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
    assert.equal(
      refsEqual(
        documentRef("projects", "my_web/log"),
        documentRef("projects", "my_web/log"),
      ),
      true,
    );
    assert.equal(
      refsEqual(
        documentRef("projects", "my_web/log"),
        documentRef("projects", "my_web"),
      ),
      false,
    );
  });
});

describe("fromLocalKey", () => {
  it("parses plain, leading-slash, and multi-segment forms", () => {
    assert.deepEqual(fromLocalKey("thoughts/foo"), {
      group: "thoughts",
      slug: "foo",
    });
    assert.deepEqual(fromLocalKey("/projects/bar"), {
      group: "projects",
      slug: "bar",
    });
    assert.deepEqual(fromLocalKey("projects/my_web/log"), {
      group: "projects",
      slug: "my_web/log",
    });
    assert.deepEqual(fromLocalKey("resources/a/b/c"), {
      group: "resources",
      slug: "a/b/c",
    });
  });

  it("rejects group-only, empty, and unknown groups", () => {
    assert.deepEqual(fromLocalKey("resources/foo"), {
      group: "resources",
      slug: "foo",
    });
    assert.throws(() => fromLocalKey("thoughts"), DocumentRefError);
    assert.throws(() => fromLocalKey("thoughts/"), DocumentRefError);
    assert.throws(() => fromLocalKey("thoughts//a"), DocumentRefError);
    assert.throws(() => fromLocalKey("thoughts/a/Bad"), DocumentRefError);
    assert.throws(() => fromLocalKey("other/foo"), DocumentRefError);
    assert.throws(() => fromLocalKey("Thoughts/foo"), DocumentRefError);
    assert.equal(tryFromLocalKey("nope"), null);
    assert.equal(tryFromLocalKey("thoughts"), null);
  });
});

describe("fromVfsPath", () => {
  it("parses document vfs paths (flat and multi-segment)", () => {
    assert.deepEqual(fromVfsPath("/thoughts/foo"), {
      group: "thoughts",
      slug: "foo",
    });
    assert.deepEqual(fromVfsPath("/projects/my_web/log"), {
      group: "projects",
      slug: "my_web/log",
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
