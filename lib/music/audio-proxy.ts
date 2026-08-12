const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 仅允许网易云音频 CDN，避免开放代理。 */
export function isAllowedAudioProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "music.126.net" || host.endsWith(".music.126.net");
  } catch {
    return false;
  }
}

export function audioProxyHeaders(range?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://music.163.com/",
  };
  if (range) headers.Range = range;
  return headers;
}

export function audioContentType(audioUrl: string, upstreamType: string | null): string {
  let pathname = "";
  try {
    pathname = new URL(audioUrl).pathname.toLowerCase();
  } catch {
    pathname = "";
  }
  if (/\.flac$/.test(pathname)) return "audio/flac";
  if (/\.mp3$/.test(pathname)) return "audio/mpeg";
  if (/\.(m4a|mp4)$/.test(pathname)) return "audio/mp4";
  if (/\.ogg$/.test(pathname)) return "audio/ogg";
  return upstreamType || "audio/mpeg";
}
