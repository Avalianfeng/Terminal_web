import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashToken, scopeCovers, validateToken } from "./token.ts";

describe("scopeCovers", () => {
  it("supports *, prefix/*, and exact", () => {
    assert.equal(scopeCovers("*", "thoughts/foo"), true);
    assert.equal(scopeCovers("thoughts/*", "thoughts/foo"), true);
    assert.equal(scopeCovers("thoughts/*", "resources/foo"), false);
    assert.equal(scopeCovers("thoughts/*", "private/thoughts/foo"), false);
    assert.equal(scopeCovers("private/*", "private/thoughts/foo"), true);
    assert.equal(scopeCovers("thoughts/foo", "thoughts/foo"), true);
    assert.equal(scopeCovers("thoughts/foo", "thoughts/bar"), false);
  });
});

describe("validateToken — write scope only", () => {
  it("valid token without requiredScope is valid regardless of declared scope", () => {
    const token = "test-token-abcdefghijklmnopqrstuvwxyz12";
    const digest = hashToken(token);
    const prev = process.env.ARCHIVE_WRITE_TOKENS;
    process.env.ARCHIVE_WRITE_TOKENS = JSON.stringify({
      [digest]: "thoughts/*",
    });
    try {
      // Read path: validate without requiredScope → any valid token = owner-agent read
      assert.equal(validateToken(token).valid, true);
      assert.equal(validateToken(token, "thoughts/a").valid, true);
      assert.equal(validateToken(token, "resources/a").valid, false);
      assert.equal(validateToken(token, "resources/a").scope, "thoughts/*");
    } finally {
      if (prev === undefined) delete process.env.ARCHIVE_WRITE_TOKENS;
      else process.env.ARCHIVE_WRITE_TOKENS = prev;
    }
  });
});
