import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPlaylist,
  parseMusicArgs,
  resolveImportUrl,
  resolvePlayQuery,
  resolvePlayTarget,
  stepPlaylist,
} from "./music-command";
import type { MusicPlaylistIndex } from "./playlist-types";

const sample: MusicPlaylistIndex = {
  slug: "7590034564",
  neteasePlaylistId: "7590034564",
  name: "如人饮水，冷暖自知",
  sourceUrl: "https://music.163.com/#/playlist?id=7590034564",
  importedAt: "2026-08-12T00:00:00.000Z",
  tracks: [{ id: 42, name: "一点一滴", artists: ["不是土豆_"] }],
};

const other: MusicPlaylistIndex = {
  ...sample,
  slug: "1",
  neteasePlaylistId: "1",
  name: "测试歌单",
  tracks: [{ id: 7, name: "Soft Lips", artists: ["BlankCh3ck"] }],
};

describe("parseMusicArgs", () => {
  it("defaults to list", () => {
    assert.equal(parseMusicArgs([]).kind, "list");
    assert.equal(parseMusicArgs(["ls"]).kind, "list");
  });

  it("parses play with Chinese query", () => {
    assert.deepEqual(parseMusicArgs(["play", "如人饮水"]), {
      kind: "play",
      query: "如人饮水",
    });
  });

  it("parses lyric / shuffle", () => {
    assert.deepEqual(parseMusicArgs(["lyric"]), { kind: "lyric", query: "" });
    assert.deepEqual(parseMusicArgs(["lyric", "一点一滴"]), {
      kind: "lyric",
      query: "一点一滴",
    });
    assert.deepEqual(parseMusicArgs(["shuffle"]), {
      kind: "shuffle",
      mode: "toggle",
    });
    assert.deepEqual(parseMusicArgs(["shuffle", "on"]), {
      kind: "shuffle",
      mode: "on",
    });
    assert.deepEqual(parseMusicArgs(["random", "off"]), {
      kind: "shuffle",
      mode: "off",
    });
  });

  it("parses playlist switch commands", () => {
    assert.equal(parseMusicArgs(["playlist", "next"]).kind, "playlist-next");
    assert.equal(parseMusicArgs(["playlist", "prev"]).kind, "playlist-prev");
    assert.deepEqual(parseMusicArgs(["playlist", "如人饮水"]), {
      kind: "playlist-use",
      query: "如人饮水",
    });
    assert.deepEqual(parseMusicArgs(["pl", "use", "如人饮水"]), {
      kind: "playlist-use",
      query: "如人饮水",
    });
  });

  it("parses bare play as resume; pause is pause-only", () => {
    assert.equal(parseMusicArgs(["play"]).kind, "resume");
    assert.equal(parseMusicArgs(["resume"]).kind, "resume");
    assert.equal(parseMusicArgs(["pause"]).kind, "pause");
    assert.deepEqual(parseMusicArgs(["play", "如人饮水"]), {
      kind: "play",
      query: "如人饮水",
    });
  });
});

describe("resolvePlayQuery", () => {
  it("matches Chinese name or numeric id", () => {
    assert.equal(resolvePlayQuery([sample], "如人饮水").ok, true);
    assert.equal(resolvePlayQuery([sample], "7590034564").ok, true);
    assert.equal(resolvePlayQuery([sample], "不存在").ok, false);
  });
});

describe("resolvePlayTarget", () => {
  it("prefers unique playlist, else first track hit", () => {
    const asPlaylist = resolvePlayTarget([sample, other], "如人饮水");
    assert.equal(asPlaylist.ok && asPlaylist.kind === "playlist", true);

    const asTrack = resolvePlayTarget([sample, other], "Soft");
    assert.equal(asTrack.ok && asTrack.kind === "track", true);
    if (asTrack.ok && asTrack.kind === "track") {
      assert.equal(asTrack.hit.track.id, 7);
    }
  });
});

describe("defaultPlaylist / stepPlaylist", () => {
  it("returns first / cycles", () => {
    assert.equal(defaultPlaylist([sample, other])?.neteasePlaylistId, "7590034564");
    assert.equal(
      stepPlaylist([sample, other], "7590034564", 1)?.neteasePlaylistId,
      "1",
    );
    assert.equal(
      stepPlaylist([sample, other], "1", 1)?.neteasePlaylistId,
      "7590034564",
    );
  });
});

describe("resolveImportUrl", () => {
  it("accepts playlist hash URLs", () => {
    assert.ok(
      resolveImportUrl("https://music.163.com/#/my/m/music/playlist?id=7590034564"),
    );
    assert.equal(resolveImportUrl("https://example.com"), null);
  });
});
