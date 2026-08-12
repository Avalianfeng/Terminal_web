import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentRef } from "./document-ref";
import {
  isSafeAudioPublicPath,
  resolveResourceAudio,
  resolveResourceMedia,
} from "./resource-media";
import type { ArchiveDocument } from "./types";

function audioDoc(partial: Partial<ArchiveDocument>): ArchiveDocument {
  return {
    ref: documentRef("resources", "sample"),
    title: "Sample",
    summary: "",
    body: "",
    tags: [],
    resourceType: "audio",
    url: "https://music.163.com/#/song?id=1",
    audioSrc: "/resources/audio/demo.mp3",
    ...partial,
  };
}

describe("isSafeAudioPublicPath", () => {
  it("allows paths under /resources/audio/", () => {
    assert.equal(isSafeAudioPublicPath("/resources/audio/demo.mp3"), true);
  });

  it("rejects traversal and other prefixes", () => {
    assert.equal(isSafeAudioPublicPath("/resources/audio/../secret.mp3"), false);
    assert.equal(isSafeAudioPublicPath("https://evil.test/a.mp3"), false);
    assert.equal(isSafeAudioPublicPath("/audio/demo.mp3"), false);
  });
});

describe("resolveResourceAudio", () => {
  it("returns audio render for self-hosted track", () => {
    const media = resolveResourceAudio(audioDoc({}));
    assert.deepEqual(media, { kind: "audio", src: "/resources/audio/demo.mp3" });
  });

  it("respects embed false", () => {
    assert.equal(resolveResourceAudio(audioDoc({ embed: false })), null);
  });
});

describe("resolveResourceMedia", () => {
  it("prefers audio over video embed when both could apply", () => {
    const media = resolveResourceMedia(
      audioDoc({
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    );
    assert.equal(media?.kind, "audio");
  });
});
