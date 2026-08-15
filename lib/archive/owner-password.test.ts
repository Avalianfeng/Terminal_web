import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearLoginFailures,
  hashOwnerPassword,
  isLoginBlocked,
  recordLoginFailure,
  verifyOwnerPassword,
} from "./owner-password.ts";

describe("owner-password", () => {
  it("verifies a freshly hashed password", () => {
    const stored = hashOwnerPassword("correct horse");
    assert.equal(verifyOwnerPassword("correct horse", stored), true);
    assert.equal(verifyOwnerPassword("wrong", stored), false);
  });

  it("rejects a malformed stored hash", () => {
    assert.equal(verifyOwnerPassword("x", "not-a-hash"), false);
    assert.equal(verifyOwnerPassword("x", "sha256$abc"), false);
  });

  it("does not use $ so dotenv will not expand the hash", () => {
    const stored = hashOwnerPassword("x");
    assert.equal(stored.includes("$"), false);
    assert.match(stored, /^scrypt:/);
  });

  it("still verifies the legacy $ delimiter", () => {
    const colon = hashOwnerPassword("same");
    const dollar = colon.replaceAll(":", "$");
    assert.equal(verifyOwnerPassword("same", dollar), true);
  });
});

describe("login throttle", () => {
  it("blocks after max failures inside the window", () => {
    const store = new Map();
    const now = 1000;
    for (let i = 0; i < 5; i += 1) {
      const result = recordLoginFailure(store, "1.1.1.1", now, 60_000, 5);
      assert.equal(result.blocked, false);
    }
    assert.equal(isLoginBlocked(store, "1.1.1.1", now, 60_000, 5), true);
    const sixth = recordLoginFailure(store, "1.1.1.1", now, 60_000, 5);
    assert.equal(sixth.blocked, true);
  });

  it("resets after the window and on success", () => {
    const store = new Map();
    recordLoginFailure(store, "ip", 0, 1000, 2);
    recordLoginFailure(store, "ip", 0, 1000, 2);
    assert.equal(isLoginBlocked(store, "ip", 0, 1000, 2), true);
    assert.equal(isLoginBlocked(store, "ip", 1000, 1000, 2), false);
    clearLoginFailures(store, "ip");
    assert.equal(isLoginBlocked(store, "ip", 0, 1000, 2), false);
  });
});
