import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CREATE_MAX_PER_WINDOW,
  notePasswordCreate,
} from "./create-quota.ts";

describe("notePasswordCreate", () => {
  it("allows CREATE_MAX_PER_WINDOW then blocks in the same window", () => {
    const ip = `test-${Date.now()}-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < CREATE_MAX_PER_WINDOW; i++) {
      assert.equal(notePasswordCreate(ip, now).allowed, true);
    }
    assert.equal(notePasswordCreate(ip, now).allowed, false);
  });

  it("resets after the window", () => {
    const ip = `test-${Date.now()}-${Math.random()}`;
    const now = 2_000_000;
    for (let i = 0; i < CREATE_MAX_PER_WINDOW; i++) {
      notePasswordCreate(ip, now);
    }
    assert.equal(notePasswordCreate(ip, now + 5 * 60 * 1000).allowed, true);
  });
});
