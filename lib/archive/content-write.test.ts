import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, it } from "node:test";
import { documentRef } from "./document-ref";
import {
  WriteError,
  createDirectory,
  removeDirectory,
  resolveContentDir,
  resolveContentPath,
  vfsDirRef,
} from "./content-write";

const tmpRoots: string[] = [];

async function tmpRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "cw-test-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("content-write multi-segment (ADR 0013)", () => {
  it("resolveContentPath maps nested slug to nested file", () => {
    const flat = resolveContentPath(documentRef("projects", "foo"));
    assert.equal(flat, path.join(process.cwd(), "content", "projects", "foo.md"));

    const nested = resolveContentPath(documentRef("projects", "my_web/log"));
    assert.equal(
      nested,
      path.join(process.cwd(), "content", "projects", "my_web", "log.md"),
    );
  });

  it("vfsDirRef validates group and segments", () => {
    assert.deepEqual(vfsDirRef("projects", ["my_web", "log"]), {
      group: "projects",
      segments: ["my_web", "log"],
    });
    assert.throws(() => vfsDirRef("nope" as "projects", ["a"]), WriteError);
    assert.throws(() => vfsDirRef("projects", []), WriteError);
    assert.throws(() => vfsDirRef("projects", ["a", "Bad"]), WriteError);
    assert.throws(() => vfsDirRef("projects", ["a", ""]), WriteError);
  });

  it("createDirectory creates nested dirs recursively (idempotent)", async () => {
    const root = await tmpRoot();
    const ref = vfsDirRef("projects", ["my_web", "notes"]);
    const first = await createDirectory(ref, root);
    assert.equal(first.created, true);
    const second = await createDirectory(ref, root);
    assert.equal(second.created, false);
    const dir = resolveContentDir(ref, root);
    const projects = await readdir(path.join(root, "projects"));
    assert.deepEqual(projects, ["my_web"]);
    assert.deepEqual(await readdir(path.join(root, "projects", "my_web")), [
      "notes",
    ]);
    void dir;
  });

  it("removeDirectory removes only empty dirs", async () => {
    const root = await tmpRoot();
    const empty = vfsDirRef("projects", ["a"]);
    await createDirectory(empty, root);
    await removeDirectory(empty, root);
    await assert.rejects(removeDirectory(empty, root), (error: unknown) => {
      assert.ok(error instanceof WriteError);
      assert.equal(error.code, "not_found");
      return true;
    });

    const withFile = vfsDirRef("projects", ["b"]);
    await createDirectory(withFile, root);
    await writeFile(path.join(resolveContentDir(withFile, root), "x.md"), "x");
    await assert.rejects(removeDirectory(withFile, root), (error: unknown) => {
      assert.ok(error instanceof WriteError);
      assert.equal(error.code, "conflict");
      return true;
    });
    // 非空目录仍在
    assert.deepEqual(
      await readdir(path.join(root, "projects", "b")),
      ["x.md"],
    );
  });
});
