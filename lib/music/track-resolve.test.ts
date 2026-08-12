import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findTracks,
  firstTrackHit,
  matchesTrack,
} from "./track-resolve";
import type { MusicPlaylistIndex } from "./playlist-types";

const alpha: MusicPlaylistIndex = {
  slug: "1",
  neteasePlaylistId: "1",
  name: "歌单甲",
  sourceUrl: "https://example.com/1",
  importedAt: "2026-08-13T00:00:00.000Z",
  tracks: [
    { id: 10, name: "一点一滴", artists: ["不是土豆_"] },
    { id: 11, name: "稳稳的幸福", artists: ["派派"] },
  ],
};

const beta: MusicPlaylistIndex = {
  slug: "2",
  neteasePlaylistId: "2",
  name: "歌单乙",
  sourceUrl: "https://example.com/2",
  importedAt: "2026-08-13T00:00:00.000Z",
  tracks: [
    { id: 20, name: "Soft Lips", artists: ["BlankCh3ck"] },
    { id: 11, name: "稳稳的幸福", artists: ["派派"] },
  ],
};

describe("matchesTrack", () => {
  it("matches id / name / artist", () => {
    const track = alpha.tracks[0]!;
    assert.equal(matchesTrack(track, "10"), true);
    assert.equal(matchesTrack(track, "一点"), true);
    assert.equal(matchesTrack(track, "土豆"), true);
    assert.equal(matchesTrack(track, "不存在"), false);
  });
});

describe("findTracks / firstTrackHit", () => {
  it("prefers earlier playlist on duplicate names", () => {
    const hits = findTracks([alpha, beta], "稳稳的幸福");
    assert.equal(hits.length, 2);
    assert.equal(firstTrackHit([alpha, beta], "稳稳")?.playlist.neteasePlaylistId, "1");
    assert.equal(firstTrackHit([alpha, beta], "Soft")?.track.id, 20);
  });

  it("skips empty track lists", () => {
    const stub: MusicPlaylistIndex = { ...beta, tracks: [] };
    assert.equal(findTracks([stub, alpha], "一点一滴").length, 1);
  });
});
