import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNoLyricText,
  lyricIndexAt,
  lyricWindow,
  parseLrc,
  usableLyricLines,
} from "./lyric";

describe("parseLrc", () => {
  it("parses timed lines and ignores empty", () => {
    const lines = parseLrc(`[00:01.00]第一行\n[00:02.50]第二行\n[ti:x]\n`);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.text, "第一行");
    assert.equal(lines[0]?.timeMs, 1000);
    assert.equal(lines[1]?.timeMs, 2500);
  });

  it("drops no-lyric placeholders", () => {
    const lines = parseLrc(`[00:00.00]无歌词\n[00:01.00]纯音乐，请欣赏\n`);
    assert.equal(lines.length, 0);
  });
});

describe("isNoLyricText / usableLyricLines", () => {
  it("recognizes common placeholders", () => {
    assert.equal(isNoLyricText("无歌词"), true);
    assert.equal(isNoLyricText(" 暂无歌词 "), true);
    assert.equal(isNoLyricText("纯音乐，请欣赏"), true);
    assert.equal(isNoLyricText("真正的歌词"), false);
  });

  it("collapses placeholder-only lists", () => {
    assert.deepEqual(usableLyricLines([{ timeMs: 0, text: "无歌词" }]), []);
  });
});

describe("lyricIndexAt / lyricWindow", () => {
  const lines = parseLrc(`[00:00.00]a\n[00:10.00]b\n[00:20.00]c\n`);

  it("picks current by time", () => {
    assert.equal(lyricIndexAt(lines, 0), 0);
    assert.equal(lyricIndexAt(lines, 10_000), 1);
    assert.equal(lyricIndexAt(lines, 19_999), 1);
    assert.equal(lyricIndexAt(lines, 20_000), 2);
  });

  it("builds three-line window", () => {
    assert.deepEqual(lyricWindow(lines, 1), {
      prev: "a",
      current: "b",
      next: "c",
    });
  });
});
