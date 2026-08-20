/**
 * ADR 0019 entry-path invariants (bypass audit).
 * Mirrors GET items/docs/search/find + write auth layers without Next HTTP.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { getArchiveSnapshotFor } from "./content.ts";
import { findDocumentByPath, findItemByKey } from "./discovery.ts";
import { documentRef } from "./document-ref.ts";
import { grantFor } from "./permission.ts";
import { findNodes, searchDocuments } from "./query.ts";
import { payloadFromRaw } from "./read-adapter.ts";
import {
  saveDocument,
  readDocumentRaw,
} from "./content-write.ts";
import { hashToken } from "./token.ts";
import { requireWriteScope } from "./write-api-auth.ts";

const SECRET_KEY = "private/thoughts/secret";
const SECRET_BODY_MARKER = "private-only-body-xyz";

async function withPrivateFixture(run: () => Promise<void>): Promise<void> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "dsh-perm-entry-"));
  const prev = process.cwd();
  try {
    for (const group of ["projects", "thoughts", "resources"] as const) {
      await mkdir(path.join(tmp, "content", group), { recursive: true });
    }
    await mkdir(path.join(tmp, "content", "private", "thoughts"), {
      recursive: true,
    });
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
    await writeFile(path.join(tmp, "content", "timeline.md"), "", "utf8");
    await writeFile(
      path.join(tmp, "content", "thoughts", "public-note.md"),
      "---\ntitle: public-note\nsummary: visible\ntags: public\n---\n\npublic body\n",
      "utf8",
    );
    await writeFile(
      path.join(tmp, "content", "private", "thoughts", "secret.md"),
      `---\ntitle: secret\nsummary: hidden\ntags: private\n---\n\n${SECRET_BODY_MARKER}\n`,
      "utf8",
    );
    process.chdir(tmp);
    await run();
  } finally {
    process.chdir(prev);
    await rm(tmp, { recursive: true, force: true });
  }
}

function withTokenEnv(
  tokens: Record<string, string>,
  run: () => void,
): void {
  const prev = process.env.ARCHIVE_WRITE_TOKENS;
  process.env.ARCHIVE_WRITE_TOKENS = JSON.stringify(tokens);
  try {
    run();
  } finally {
    if (prev === undefined) delete process.env.ARCHIVE_WRITE_TOKENS;
    else process.env.ARCHIVE_WRITE_TOKENS = prev;
  }
}

describe("permission entry — read paths (scoped snapshot)", () => {
  it("visitor: GET items/docs/search/find cannot reach private", async () => {
    await withPrivateFixture(async () => {
      const snapshot = await getArchiveSnapshotFor(grantFor("visitor"));

      assert.equal(
        findItemByKey(snapshot, "local", SECRET_KEY),
        null,
        "items?localKey=private/…",
      );
      assert.equal(
        findDocumentByPath(snapshot, SECRET_KEY),
        null,
        "docs?path=private/…",
      );
      assert.equal(
        findDocumentByPath(snapshot, "/private/thoughts/secret"),
        null,
      );

      const searchHits = searchDocuments(snapshot, SECRET_BODY_MARKER);
      assert.equal(searchHits.length, 0, "search must not leak private body");

      const findHits = findNodes(snapshot, "secret");
      assert.ok(
        findHits.every((node) => !node.path.includes("/private/")),
        "find must not list /private/…",
      );

      assert.ok(
        findItemByKey(snapshot, "local", "thoughts/public-note"),
        "public still readable",
      );
    });
  });

  it("owner-agent: same keys are reachable", async () => {
    await withPrivateFixture(async () => {
      const snapshot = await getArchiveSnapshotFor(grantFor("owner-agent"));
      const doc = findItemByKey(snapshot, "local", SECRET_KEY);
      assert.ok(doc);
      assert.equal(doc.ref.zone, "private");
      assert.ok(doc.body.includes(SECRET_BODY_MARKER));

      const searchHits = searchDocuments(snapshot, SECRET_BODY_MARKER);
      assert.equal(searchHits.length, 1);
      assert.equal(searchHits[0]!.ref.zone, "private");
    });
  });
});

describe("permission entry — write layers (can WRITE vs Bearer scope)", () => {
  it("visitor (no Bearer): unauthorized for private PUT target", () => {
    const auth = requireWriteScope(null, SECRET_KEY);
    assert.equal(auth.authorized, false);
    if (!auth.authorized) assert.equal(auth.error, "unauthorized");
  });

  it("owner-agent thoughts/*: forbidden for private/thoughts/…", () => {
    const token = "entry-test-token-thoughts-scope-abcdef12";
    withTokenEnv({ [hashToken(token)]: "thoughts/*" }, () => {
      const auth = requireWriteScope(`Bearer ${token}`, SECRET_KEY);
      assert.equal(auth.authorized, false);
      if (!auth.authorized) assert.equal(auth.error, "forbidden");

      const publicAuth = requireWriteScope(
        `Bearer ${token}`,
        "thoughts/public-note",
      );
      assert.equal(publicAuth.authorized, true);
    });
  });

  it("owner-agent * : allowed; save + payload keep private localKey", async () => {
    await withPrivateFixture(async () => {
      const token = "entry-test-token-star-scope-abcdefghijklmn";
      withTokenEnv({ [hashToken(token)]: "*" }, () => {
        const auth = requireWriteScope(
          `Bearer ${token}`,
          "private/thoughts/agent-note",
        );
        assert.equal(auth.authorized, true);
      });

      const ref = documentRef("thoughts", "agent-note", "private");
      await saveDocument(ref, {
        title: "agent-note",
        summary: "from agent",
        body: "written by owner-agent",
      });
      const raw = await readDocumentRaw(ref);
      const payload = payloadFromRaw(ref, raw);
      assert.equal(payload.localKey, "private/thoughts/agent-note");
      assert.ok(payload.body.includes("written by owner-agent"));
    });
  });
});

describe("payloadFromRaw preserves zone", () => {
  it("private ref → localKey with private/ prefix", () => {
    const ref = documentRef("thoughts", "secret", "private");
    const raw = "---\ntitle: secret\n---\n\nbody\n";
    const payload = payloadFromRaw(ref, raw);
    assert.equal(payload.localKey, "private/thoughts/secret");
  });

  it("public ref → localKey without private/", () => {
    const ref = documentRef("thoughts", "note", "public");
    const raw = "---\ntitle: note\n---\n\nbody\n";
    const payload = payloadFromRaw(ref, raw);
    assert.equal(payload.localKey, "thoughts/note");
  });
});
