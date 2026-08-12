import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentRef } from "./document-ref";
import { resourceOpenOriginalLabel, resolveResourceEmbed, shouldEmbedResource } from "./resource-present";
import {
  buildBilibiliEmbedUrl,
  buildYouTubeEmbedUrl,
  extractBilibiliRef,
  extractYouTubeVideoId,
  inferEmbedPlatform,
  resolvePlatformEmbed,
} from "./resource-platforms";
import type { ArchiveDocument } from "./types";

function resourceDoc(
  partial: Partial<ArchiveDocument> & Pick<ArchiveDocument, "url">,
): ArchiveDocument {
  return {
    ref: documentRef("resources", "sample"),
    title: "Sample",
    summary: "",
    body: "",
    tags: [],
    resourceType: "video",
    platform: "youtube",
    ...partial,
  };
}

describe("resourceOpenOriginalLabel", () => {
  it("maps resourceType to link copy", () => {
    assert.match(resourceOpenOriginalLabel("article"), /原文/);
    assert.match(resourceOpenOriginalLabel("video"), /视频/);
    assert.match(resourceOpenOriginalLabel("audio"), /音频/);
    assert.match(resourceOpenOriginalLabel("link"), /链接/);
  });
});

describe("extractYouTubeVideoId", () => {
  it("parses watch, youtu.be, embed, and shorts URLs", () => {
    assert.equal(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      "dQw4w9WgXcQ",
    );
    assert.equal(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });
});

describe("extractBilibiliRef", () => {
  it("parses BV and av video URLs", () => {
    assert.deepEqual(extractBilibiliRef("https://www.bilibili.com/video/BV1GJ411x7h7"), {
      kind: "bvid",
      id: "BV1GJ411x7h7",
    });
    assert.deepEqual(extractBilibiliRef("https://www.bilibili.com/video/av170001"), {
      kind: "aid",
      id: "170001",
    });
  });

  it("returns undefined for opaque short links", () => {
    assert.equal(extractBilibiliRef("https://b23.tv/mOEpMMo"), undefined);
  });
});

describe("inferEmbedPlatform", () => {
  it("detects youtube and bilibili hosts", () => {
    assert.equal(inferEmbedPlatform("https://youtu.be/x"), "youtube");
    assert.equal(inferEmbedPlatform("https://www.bilibili.com/video/BV1"), "bilibili");
  });
});

describe("shouldEmbedResource", () => {
  it("embeds video on registered platforms by default", () => {
    assert.equal(
      shouldEmbedResource(resourceDoc({ url: "https://youtu.be/dQw4w9WgXcQ" })),
      true,
    );
    assert.equal(
      shouldEmbedResource(
        resourceDoc({
          url: "https://www.bilibili.com/video/BV1GJ411x7h7",
          platform: "bilibili",
        }),
      ),
      true,
    );
  });

  it("skips articles unless embed is true", () => {
    assert.equal(
      shouldEmbedResource(
        resourceDoc({
          url: "https://youtu.be/dQw4w9WgXcQ",
          resourceType: "article",
        }),
      ),
      false,
    );
  });
});

describe("resolveResourceEmbed", () => {
  it("returns youtube nocookie embed URL with start time", () => {
    const resolved = resolveResourceEmbed(
      resourceDoc({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
      }),
    );
    assert.ok(resolved);
    assert.equal(resolved?.platform, "youtube");
    assert.match(resolved?.embedUrl ?? "", /start=42/);
  });

  it("returns bilibili player embed URL", () => {
    const url = "https://www.bilibili.com/video/BV1GJ411x7h7?p=2&t=30";
    const resolved = resolveResourceEmbed(
      resourceDoc({
        url,
        platform: "bilibili",
      }),
    );
    assert.ok(resolved);
    assert.equal(resolved?.platform, "bilibili");
    assert.equal(resolved?.embedUrl, buildBilibiliEmbedUrl(url));
    assert.match(resolved?.embedUrl ?? "", /bvid=BV1GJ411x7h7/);
    assert.match(resolved?.embedUrl ?? "", /page=2/);
  });

  it("resolvePlatformEmbed is the platform-layer entry", () => {
    const resolved = resolvePlatformEmbed(
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    assert.equal(
      resolved?.embedUrl,
      buildYouTubeEmbedUrl("dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    );
  });
});
