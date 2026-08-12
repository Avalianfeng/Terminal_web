export type SongPlayResult = {
  playable: boolean;
  trial: boolean;
  /** 网易云 CDN 直链（仅服务端 / 代理使用）。 */
  url: string | null;
  br?: number;
  level?: string;
  message?: string;
};

export type NeteasePlaybackClient = {
  songUrl: (id: string, cookie: string) => Promise<SongPlayResult>;
  songLyric: (id: string, cookie: string) => Promise<string>;
};

export function mapSongUrlPayload(data: unknown, level?: string): SongPlayResult {
  if (!data || typeof data !== "object") {
    return { playable: false, trial: false, url: null, message: "无播放数据" };
  }
  const row = data as Record<string, unknown>;
  const url = typeof row.url === "string" && row.url.length > 0 ? row.url : null;
  const trial = row.freeTrialInfo != null && row.freeTrialInfo !== false;
  const br = typeof row.br === "number" ? row.br : undefined;
  if (!url) {
    return {
      playable: false,
      trial: false,
      url: null,
      br,
      level,
      message: "当前账号无法获取播放地址（版权 / 需 VIP / 未登录）",
    };
  }
  return { playable: true, trial, url, br, level };
}

export function songProxyPath(cdnUrl: string): string {
  return `/api/music/audio?url=${encodeURIComponent(cdnUrl)}`;
}
