/** 已实现 iframe 嵌入的平台 id（与 inferPlatform / frontmatter platform 对齐）。 */
export const EMBED_PLATFORMS = ["youtube", "bilibili"] as const;

export type EmbedPlatformId = (typeof EMBED_PLATFORMS)[number];

export type ResolvedResourceEmbed = {
  platform: EmbedPlatformId;
  embedUrl: string;
  iframeAllow: string;
};

const DEFAULT_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

type PlatformSpec = {
  id: EmbedPlatformId;
  matchHost: (host: string) => boolean;
  buildEmbedUrl: (url: string) => string | null;
};

function normalizeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function youtubeStartSeconds(url: string): number | undefined {
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("t") ?? parsed.searchParams.get("start");
    if (!raw) return undefined;
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.floor(asNumber);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** 从常见 YouTube 分享链提取 video id（watch / youtu.be / embed / shorts）。 */
export function extractYouTubeVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/").filter(Boolean)[0];
      return id || undefined;
    }

    if (!host.includes("youtube.com")) {
      return undefined;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "embed" || segments[0] === "shorts") {
      return segments[1] || undefined;
    }

    const fromQuery = parsed.searchParams.get("v")?.trim();
    return fromQuery || undefined;
  } catch {
    return undefined;
  }
}

export function buildYouTubeEmbedUrl(videoId: string, sourceUrl?: string): string {
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  embed.searchParams.set("rel", "0");
  if (sourceUrl) {
    const start = youtubeStartSeconds(sourceUrl);
    if (start !== undefined) {
      embed.searchParams.set("start", String(start));
    }
  }
  return embed.toString();
}

/** B 站 BV / av 页面链；短链 b23.tv 无稳定 id 时不解析（需完整 video 链）。 */
export function extractBilibiliRef(
  url: string,
): { kind: "bvid"; id: string } | { kind: "aid"; id: string } | undefined {
  try {
    const parsed = new URL(url);
    const match =
      parsed.pathname.match(/\/video\/(BV[\w]+|av\d+)/i) ??
      parsed.pathname.match(/^\/(BV[\w]+|av\d+)$/i);
    if (!match?.[1]) return undefined;

    const token = match[1];
    if (/^BV/i.test(token)) {
      return { kind: "bvid", id: token };
    }
    if (/^av/i.test(token)) {
      return { kind: "aid", id: token.slice(2) };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function buildBilibiliEmbedUrl(sourceUrl: string): string | null {
  const ref = extractBilibiliRef(sourceUrl);
  if (!ref) return null;

  const embed = new URL("https://player.bilibili.com/player.html");
  if (ref.kind === "bvid") {
    embed.searchParams.set("bvid", ref.id);
  } else {
    embed.searchParams.set("aid", ref.id);
  }

  try {
    const parsed = new URL(sourceUrl);
    const page = parsed.searchParams.get("p")?.trim();
    if (page) embed.searchParams.set("page", page);
    const start = parsed.searchParams.get("t")?.trim();
    if (start) embed.searchParams.set("t", start);
  } catch {
    // ignore optional query params
  }

  return embed.toString();
}

const PLATFORM_SPECS: readonly PlatformSpec[] = [
  {
    id: "youtube",
    matchHost: (host) => host.includes("youtube.com") || host === "youtu.be",
    buildEmbedUrl: (url) => {
      const videoId = extractYouTubeVideoId(url);
      return videoId ? buildYouTubeEmbedUrl(videoId, url) : null;
    },
  },
  {
    id: "bilibili",
    matchHost: (host) => host.includes("bilibili.com") || host === "b23.tv",
    buildEmbedUrl: buildBilibiliEmbedUrl,
  },
];

export function isEmbedPlatform(platform: string | undefined): platform is EmbedPlatformId {
  return EMBED_PLATFORMS.includes(platform as EmbedPlatformId);
}

export function inferEmbedPlatform(url: string | undefined): EmbedPlatformId | undefined {
  const host = url ? normalizeHost(url) : undefined;
  if (!host) return undefined;
  return PLATFORM_SPECS.find((spec) => spec.matchHost(host))?.id;
}

export function resolvePlatformEmbed(
  platform: string | undefined,
  url: string,
): ResolvedResourceEmbed | null {
  if (!isEmbedPlatform(platform)) return null;
  const spec = PLATFORM_SPECS.find((entry) => entry.id === platform);
  if (!spec) return null;

  const embedUrl = spec.buildEmbedUrl(url);
  if (!embedUrl) return null;

  return {
    platform,
    embedUrl,
    iframeAllow: DEFAULT_IFRAME_ALLOW,
  };
}
