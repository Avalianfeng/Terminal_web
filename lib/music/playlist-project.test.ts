import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCAL_PLAYLIST_ID,
  assemblePlaylistCatalog,
  buildLocalPlaylist,
  playlistsForTrackSearch,
  projectPlaylistsForVisitor,
} from "./playlist-project.ts";
import type { MusicPlaylistIndex } from "./playlist-types.ts";

const a: MusicPlaylistIndex = {
  slug: "1",
  neteasePlaylistId: "1",
  name: "有缓存",
  sourceUrl: "https://music.163.com/#/playlist?id=1",
  importedAt: "2026-08-15T00:00:00.000Z",
  trackCount: 2,
  tracks: [
    { id: 10, name: "本地甲", artists: ["A"] },
    { id: 11, name: "仅流式", artists: ["B"] },
  ],
};

const b: MusicPlaylistIndex = {
  ...a,
  slug: "2",
  neteasePlaylistId: "2",
  name: "全无缓存",
  tracks: [{ id: 99, name: "没有文件", artists: ["C"] }],
};

describe("buildLocalPlaylist / visitor catalog", () => {
  it("builds a single local playlist of cached tracks", () => {
    const local = buildLocalPlaylist([a, b], new Set(["10"]));
    assert.equal(local?.neteasePlaylistId, LOCAL_PLAYLIST_ID);
    assert.equal(local?.tracks.length, 1);
    assert.equal(local?.tracks[0]?.id, 10);
  });

  it("visitor sees only the local playlist", () => {
    const next = projectPlaylistsForVisitor([a, b], new Set(["10"]));
    assert.equal(next.length, 1);
    assert.equal(next[0]?.neteasePlaylistId, LOCAL_PLAYLIST_ID);
    assert.equal(next[0]?.tracks[0]?.id, 10);
  });

  it("owner sees local first then yaml playlists", () => {
    const catalog = assemblePlaylistCatalog([a, b], new Set(["10"]), false);
    assert.equal(catalog[0]?.neteasePlaylistId, LOCAL_PLAYLIST_ID);
    assert.equal(catalog.length, 3);
  });

  it("returns empty for visitor when nothing is cached", () => {
    assert.deepEqual(assemblePlaylistCatalog([a, b], new Set(), true), []);
  });

  it("skips local playlist when yaml catalogs exist", () => {
    const catalog = assemblePlaylistCatalog([a, b], new Set(["10"]), false);
    const searchable = playlistsForTrackSearch(catalog);
    assert.equal(searchable.every((item) => item.neteasePlaylistId !== LOCAL_PLAYLIST_ID), true);
    assert.equal(playlistsForTrackSearch([catalog[0]!])[0]?.neteasePlaylistId, LOCAL_PLAYLIST_ID);
  });
});
