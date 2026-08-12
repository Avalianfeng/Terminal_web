import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PlaybackSessionEngine,
  URL_CACHE_TTL_MS,
  isCacheFresh,
  nextTrackSongId,
  type ResolveSongUrl,
} from "./playback-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("isCacheFresh", () => {
  it("respects TTL boundary", () => {
    assert.equal(isCacheFresh(0, URL_CACHE_TTL_MS), true);
    assert.equal(isCacheFresh(0, URL_CACHE_TTL_MS + 1), false);
  });
});

describe("nextTrackSongId", () => {
  it("wraps around", () => {
    const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.equal(nextTrackSongId(tracks, 0), "2");
    assert.equal(nextTrackSongId(tracks, 2), "1");
  });

  it("returns undefined for empty", () => {
    assert.equal(nextTrackSongId([], 0), undefined);
  });
});

describe("PlaybackSessionEngine", () => {
  it("beginJump bumps generation and aborts in-flight load", async () => {
    const gate = deferred<{ ok: true; proxyUrl: string }>();
    let aborted = false;
    const resolveUrl: ResolveSongUrl = async (_id, signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return gate.promise;
    };

    const engine = new PlaybackSessionEngine({ resolveUrl, now: () => 0 });
    const gen1 = engine.beginJump();
    const pending = engine.loadTrack("10", gen1);
    const gen2 = engine.beginJump();
    assert.equal(gen2, gen1 + 1);
    assert.equal(aborted, true);

    gate.resolve({ ok: true, proxyUrl: "/api/music/audio?url=x" });
    const result = await pending;
    assert.equal(result.kind, "aborted");
    assert.equal(engine.isCurrent(gen1), false);
    assert.equal(engine.isCurrent(gen2), true);
  });

  it("serves cache within TTL and skips network", async () => {
    let calls = 0;
    const resolveUrl: ResolveSongUrl = async (id) => {
      calls += 1;
      return { ok: true, proxyUrl: `/proxy/${id}` };
    };
    let now = 1_000;
    const engine = new PlaybackSessionEngine({
      resolveUrl,
      now: () => now,
      ttlMs: 10_000,
    });
    const gen = engine.beginJump();
    const first = await engine.loadTrack("7", gen);
    assert.equal(first.kind, "src");
    if (first.kind === "src") assert.equal(first.proxyUrl, "/proxy/7");
    assert.equal(calls, 1);

    const second = await engine.loadTrack("7", gen);
    assert.equal(second.kind, "src");
    assert.equal(calls, 1);

    now += 10_001;
    const third = await engine.loadTrack("7", gen);
    assert.equal(third.kind, "src");
    assert.equal(calls, 2);
  });

  it("invalidate forces refetch; bypassCache skips peek", async () => {
    let calls = 0;
    const resolveUrl: ResolveSongUrl = async (id) => {
      calls += 1;
      return { ok: true, proxyUrl: `/proxy/${id}-${calls}` };
    };
    const engine = new PlaybackSessionEngine({
      resolveUrl,
      now: () => 0,
    });
    const gen = engine.beginJump();
    await engine.loadTrack("3", gen);
    assert.equal(calls, 1);

    engine.invalidate("3");
    const again = await engine.loadTrack("3", gen);
    assert.equal(again.kind, "src");
    if (again.kind === "src") assert.equal(again.proxyUrl, "/proxy/3-2");
    assert.equal(calls, 2);

    const bypassed = await engine.loadTrack("3", gen, { bypassCache: true });
    assert.equal(bypassed.kind, "src");
    if (bypassed.kind === "src") assert.equal(bypassed.proxyUrl, "/proxy/3-3");
    assert.equal(calls, 3);
  });

  it("prefetches next id into cache", async () => {
    const seen: string[] = [];
    const resolveUrl: ResolveSongUrl = async (id) => {
      seen.push(id);
      return { ok: true, proxyUrl: `/proxy/${id}` };
    };
    const engine = new PlaybackSessionEngine({
      resolveUrl,
      now: () => 0,
    });
    const gen = engine.beginJump();
    const result = await engine.loadTrack("1", gen, { prefetchNextId: "2" });
    assert.equal(result.kind, "src");

    // wait microtasks for prefetch
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(seen, ["1", "2"]);
    assert.equal(engine.peekCached("2"), "/proxy/2");

    const next = await engine.loadTrack("2", gen);
    assert.equal(next.kind, "src");
    assert.deepEqual(seen, ["1", "2"]);
  });

  it("returns unplayable without poisoning cache", async () => {
    const resolveUrl: ResolveSongUrl = async () => ({ ok: false });
    const engine = new PlaybackSessionEngine({ resolveUrl, now: () => 0 });
    const gen = engine.beginJump();
    const result = await engine.loadTrack("9", gen);
    assert.equal(result.kind, "unplayable");
    assert.equal(engine.peekCached("9"), null);
    assert.equal(engine.cacheSize(), 0);
  });
});
