import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCAL_DEV_SESSION_SECRET,
  resolveSessionSecret,
  signOwnerSession,
  verifyOwnerSession,
} from "./owner-session.ts";

const secret = "test-session-secret-at-least-32-bytes!!";
const now = 1_700_000_000_000;

describe("owner-session", () => {
  it("round-trips a signed token", () => {
    const token = signOwnerSession(now, secret);
    assert.equal(verifyOwnerSession(token, secret, now + 1000), true);
  });

  it("rejects a tampered payload", () => {
    const token = signOwnerSession(now, secret);
    const parts = token.split(".");
    const bad = `${parts[0]}.${parts[1]!.replace(/.$/, "A")}.${parts[2]}`;
    assert.equal(verifyOwnerSession(bad, secret, now + 1000), false);
  });

  it("rejects a wrong secret", () => {
    const token = signOwnerSession(now, secret);
    assert.equal(verifyOwnerSession(token, "other-secret", now + 1000), false);
  });

  it("rejects an expired token", () => {
    const token = signOwnerSession(now, secret, 1000);
    assert.equal(verifyOwnerSession(token, secret, now + 1001), false);
  });

  it("falls back to local-dev secret outside production", () => {
    assert.equal(resolveSessionSecret(undefined, "development"), LOCAL_DEV_SESSION_SECRET);
    assert.equal(resolveSessionSecret(undefined, "production"), null);
    assert.equal(resolveSessionSecret(" env-secret ", "production"), "env-secret");
  });
});
