import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PlaylistImportError,
  buildPlaylistIndex,
  playlistFileId,
  resolveImportTarget,
} from "./playlist-import";
import { parsePlaylistIndex, serializePlaylistIndex } from "./playlist-yaml";
import type { NeteasePlaylistClient } from "./playlist-import";
import { mapNeteaseTrack } from "./netease-client";
import { matchesPlaylist } from "./playlist-resolve";

const fakeClient: NeteasePlaylistClient = {
  async playlistDetail() {
    return { name: "如人饮水，冷暖自知", trackCount: 2 };
  },
  async playlistTracks() {
    return [
      { id: 1, name: "流川枫与苍井空", artists: ["黑撒"], durationMs: 303000 },
      { id: 2, name: "总有一天你会出现在我身边", artists: ["棱镜乐队"] },
    ];
  },
};

describe("resolveImportTarget", () => {
  it("uses numeric playlist id as file id", () => {
    const target = resolveImportTarget({
      url: "https://music.163.com/#/my/m/music/playlist?id=7590034564",
    });
    assert.equal(target.playlistId, "7590034564");
    assert.equal(target.slug, playlistFileId("7590034564"));
  });

  it("rejects non-numeric ids", () => {
    assert.throws(
      () => resolveImportTarget({ playlistId: "ru-ren-yin-shui" }),
      PlaylistImportError,
    );
  });
});

describe("buildPlaylistIndex", () => {
  it("builds yaml-ready index from a fake client", async () => {
    const index = await buildPlaylistIndex(
      {
        url: "https://music.163.com/#/my/m/music/playlist?id=7590034564",
        cookie: "MUSIC_U=test",
        now: "2026-08-12T00:00:00.000Z",
      },
      fakeClient,
    );
    assert.equal(index.name, "如人饮水，冷暖自知");
    assert.equal(index.slug, "7590034564");
    assert.equal(matchesPlaylist(index, "如人饮水"), true);
    assert.equal(matchesPlaylist(index, "7590034564"), true);
    const yaml = serializePlaylistIndex(index);
    assert.deepEqual(parsePlaylistIndex(yaml), index);
  });

  it("requires cookie", async () => {
    await assert.rejects(
      () => buildPlaylistIndex({ playlistId: "1", cookie: "" }, fakeClient),
      (error: unknown) =>
        error instanceof PlaylistImportError && error.code === "unauthorized",
    );
  });
});

describe("mapNeteaseTrack", () => {
  it("maps ar/dt fields", () => {
    assert.deepEqual(
      mapNeteaseTrack({
        id: 357312,
        name: "歌",
        ar: [{ name: "甲" }, { name: "乙" }],
        dt: 120000,
      }),
      { id: 357312, name: "歌", artists: ["甲", "乙"], durationMs: 120000 },
    );
  });
});
