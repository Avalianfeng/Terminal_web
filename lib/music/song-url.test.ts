import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audioContentType, isAllowedAudioProxyUrl } from "./audio-proxy";
import { mapSongUrlPayload, songProxyPath } from "./song-url";

describe("isAllowedAudioProxyUrl", () => {
  it("allows NetEase music CDN hosts", () => {
    assert.equal(
      isAllowedAudioProxyUrl("https://m801.music.126.net/2026/foo.mp3"),
      true,
    );
  });

  it("rejects open-proxy targets", () => {
    assert.equal(isAllowedAudioProxyUrl("https://example.com/a.mp3"), false);
    assert.equal(isAllowedAudioProxyUrl("https://music.163.com/"), false);
  });
});

describe("mapSongUrlPayload", () => {
  it("marks trial clips", () => {
    const mapped = mapSongUrlPayload({
      url: "https://m801.music.126.net/a.mp3",
      freeTrialInfo: { start: 0, end: 30 },
      br: 128000,
    });
    assert.equal(mapped.playable, true);
    assert.equal(mapped.trial, true);
  });

  it("returns unplayable when url missing", () => {
    assert.equal(mapSongUrlPayload({ url: null }).playable, false);
  });
});

describe("songProxyPath", () => {
  it("wraps CDN url", () => {
    const cdn = "https://m801.music.126.net/a.mp3";
    assert.equal(
      songProxyPath(cdn),
      `/api/music/audio?url=${encodeURIComponent(cdn)}`,
    );
  });
});

describe("audioContentType", () => {
  it("infers mp3", () => {
    assert.equal(
      audioContentType("https://m801.music.126.net/a.mp3", null),
      "audio/mpeg",
    );
  });
});
