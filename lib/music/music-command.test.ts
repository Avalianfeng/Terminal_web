import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPlaylist,
  MUSIC_USAGE,
  musicArgCandidates,
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
      scope: "default",
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

  it("returns playlist usage when playlist subcommand lacks target", () => {
    assert.deepEqual(parseMusicArgs(["playlist"]), {
      kind: "usage",
      topic: "playlist",
    });
    assert.deepEqual(parseMusicArgs(["pl"]), {
      kind: "usage",
      topic: "playlist",
    });
    assert.deepEqual(parseMusicArgs(["playlist", "use"]), {
      kind: "usage",
      topic: "playlist",
    });
    assert.equal(
      MUSIC_USAGE.playlist,
      "music playlist next|prev|<name>",
    );
  });

  it("parses download / delete and search flags", () => {
    assert.deepEqual(parseMusicArgs(["download"]), {
      kind: "download",
      queries: [],
    });
    assert.deepEqual(parseMusicArgs(["download", "一点一滴", ",", "稳稳的幸福"]), {
      kind: "download",
      queries: ["一点一滴", "稳稳的幸福"],
    });
    assert.deepEqual(parseMusicArgs(["download", "甲，乙"]), {
      kind: "download",
      queries: ["甲", "乙"],
    });
    assert.equal(parseMusicArgs(["download", "--playlist", "x"]).kind, "flag-mismatch");
    assert.deepEqual(parseMusicArgs(["delete", "一点一滴"]), {
      kind: "delete",
      name: "一点一滴",
    });
    assert.equal(parseMusicArgs(["delete"]).kind, "flag-mismatch");
    assert.deepEqual(parseMusicArgs(["play", "--song", "一点一滴"]), {
      kind: "play",
      query: "一点一滴",
      scope: "song",
    });
    assert.deepEqual(parseMusicArgs(["play", "--playlist", "如人饮水"]), {
      kind: "play",
      query: "如人饮水",
      scope: "playlist",
    });
    assert.equal(parseMusicArgs(["play", "--song", "--playlist", "x"]).kind, "flag-conflict");
    assert.equal(parseMusicArgs(["lyric", "--playlist"]).kind, "flag-mismatch");
    assert.equal(parseMusicArgs(["playlist", "--song", "如人饮水"]).kind, "flag-mismatch");
  });

  it("parses bare play as resume; pause is pause-only", () => {
    assert.equal(parseMusicArgs(["play"]).kind, "resume");
    assert.equal(parseMusicArgs(["resume"]).kind, "resume");
    assert.equal(parseMusicArgs(["pause"]).kind, "pause");
    assert.deepEqual(parseMusicArgs(["play", "如人饮水"]), {
      kind: "play",
      query: "如人饮水",
      scope: "default",
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

    const songOnly = resolvePlayTarget([sample, other], "如人饮水", [sample, other], "song");
    assert.equal(songOnly.ok, false);

    const playlistOnly = resolvePlayTarget([sample, other], "Soft", [sample, other], "playlist");
    assert.equal(playlistOnly.ok, false);
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

describe("musicArgCandidates", () => {
  it("completes first-level subcommands", () => {
    assert.ok(musicArgCandidates([], "pl").includes("play"));
    assert.ok(musicArgCandidates([], "pl").includes("playlist"));
    assert.ok(musicArgCandidates([], "sh").includes("shuffle"));
    assert.ok(musicArgCandidates([], "do").includes("download"));
    assert.ok(musicArgCandidates([], "de").includes("delete"));
    assert.ok(musicArgCandidates(["play"], "--s").includes("--song"));
    assert.ok(musicArgCandidates(["download"], "--s").includes("--song"));
    assert.ok(!musicArgCandidates(["download"], "--p").includes("--playlist"));
  });

  it("completes playlist / shuffle second level", () => {
    assert.deepEqual(musicArgCandidates(["playlist"], "n"), ["next"]);
    assert.ok(musicArgCandidates(["pl"], "").includes("use"));
    assert.deepEqual(
      [...musicArgCandidates(["shuffle"], "o")].sort(),
      ["off", "on"],
    );
    assert.deepEqual(musicArgCandidates(["random"], "on"), ["on"]);
  });

  it("stops after free-text args", () => {
    assert.deepEqual(musicArgCandidates(["play"], "一"), []);
    assert.deepEqual(musicArgCandidates(["playlist", "use"], "如"), []);
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
