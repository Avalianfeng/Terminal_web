import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseNeteasePlaylistId,
  parseNeteaseSongId,
  parseNeteaseUrl,
  resolveSongIdParam,
} from "./netease-url";

describe("parseNeteaseUrl", () => {
  it("parses user playlist hash URL", () => {
    const url = "https://music.163.com/#/my/m/music/playlist?id=7590034564";
    assert.deepEqual(parseNeteaseUrl(url), {
      kind: "playlist",
      id: "7590034564",
      raw: url,
    });
    assert.equal(parseNeteasePlaylistId(url), "7590034564");
  });

  it("parses song hash URL", () => {
    const url = "https://music.163.com/#/song?id=357312";
    assert.deepEqual(parseNeteaseUrl(url), {
      kind: "song",
      id: "357312",
      raw: url,
    });
    assert.equal(parseNeteaseSongId(url), "357312");
    assert.equal(resolveSongIdParam("357312"), "357312");
    assert.equal(resolveSongIdParam(url), "357312");
    assert.equal(resolveSongIdParam("../x"), null);
  });

  it("parses bare hash fragments", () => {
    assert.equal(parseNeteasePlaylistId("#/playlist?id=42"), "42");
    assert.equal(parseNeteaseSongId("#/song?id=99"), "99");
  });

  it("returns null when id missing", () => {
    assert.equal(parseNeteaseUrl("https://music.163.com/#/discover"), null);
  });
});
