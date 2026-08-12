import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextSongIdForPrefetch, stepTrackIndex } from "./play-order";

describe("stepTrackIndex", () => {
  it("wraps sequentially", () => {
    assert.equal(stepTrackIndex(5, 4, 1, "sequential"), 0);
    assert.equal(stepTrackIndex(5, 0, -1, "sequential"), 4);
  });

  it("shuffles away from current when possible", () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return calls === 1 ? 0.1 : 0.9; // first → 0 (same), second → high
    };
    const next = stepTrackIndex(3, 0, 1, "shuffle", random);
    assert.notEqual(next, 0);
  });

  it("stays on single track", () => {
    assert.equal(stepTrackIndex(1, 0, 1, "shuffle"), 0);
  });
});

describe("nextSongIdForPrefetch", () => {
  const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("returns sequential neighbor", () => {
    assert.equal(nextSongIdForPrefetch(tracks, 0, "sequential"), "2");
  });
});
