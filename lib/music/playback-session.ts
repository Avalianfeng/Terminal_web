/**
 * BGM 播放会话引擎（ADR 0009 · B）：
 * 切歌世代令牌 + Abort、URL 内存缓存（TTL）、下一首预取。
 * React 只接线；不持有 <audio>、不做 sessionStorage。
 */

export const URL_CACHE_TTL_MS = 10 * 60 * 1000;

export type CachedSongUrl = {
  proxyUrl: string;
  fetchedAt: number;
};

export type ResolveSongUrlResult =
  | { ok: true; proxyUrl: string }
  | { ok: false };

export type ResolveSongUrl = (
  songId: string,
  signal: AbortSignal,
) => Promise<ResolveSongUrlResult>;

export type PlaybackLoadResult =
  | { kind: "src"; generation: number; songId: string; proxyUrl: string }
  | { kind: "unplayable"; generation: number; songId: string }
  | { kind: "aborted"; generation: number }
  | { kind: "empty" };

export type PlaybackSessionEngineOptions = {
  resolveUrl: ResolveSongUrl;
  now?: () => number;
  ttlMs?: number;
};

export function isCacheFresh(
  fetchedAt: number,
  now: number,
  ttlMs: number = URL_CACHE_TTL_MS,
): boolean {
  return now - fetchedAt <= ttlMs;
}

/** 环形下一首 song id；空列表返回 undefined。 */
export function nextTrackSongId(
  tracks: ReadonlyArray<{ id: number }>,
  index: number,
): string | undefined {
  if (tracks.length === 0) return undefined;
  const next = tracks[(index + 1) % tracks.length];
  return next ? String(next.id) : undefined;
}

export class PlaybackSessionEngine {
  private generation = 0;
  private cache = new Map<string, CachedSongUrl>();
  private abort: AbortController | null = null;
  private readonly resolveUrl: ResolveSongUrl;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: PlaybackSessionEngineOptions) {
    this.resolveUrl = options.resolveUrl;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? URL_CACHE_TTL_MS;
  }

  currentGeneration(): number {
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  /**
   * 切歌 / 停播前调用：抬世代并 Abort 进行中的 URL 请求。
   * 返回新世代，供后续 loadTrack / 歌词请求对照。
   */
  beginJump(): number {
    this.generation += 1;
    this.abort?.abort();
    this.abort = new AbortController();
    return this.generation;
  }

  /** 播放失败（CDN 过期等）时作废缓存，迫使重取。 */
  invalidate(songId: string): void {
    this.cache.delete(songId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  peekCached(songId: string): string | null {
    const entry = this.cache.get(songId);
    if (!entry) return null;
    if (!isCacheFresh(entry.fetchedAt, this.now(), this.ttlMs)) {
      this.cache.delete(songId);
      return null;
    }
    return entry.proxyUrl;
  }

  /** 测试 / 诊断用。 */
  cacheSize(): number {
    return this.cache.size;
  }

  /**
   * 解析当前曲 URL（命中缓存则跳过网络）；成功后预取下一首。
   * `bypassCache`：失败重取时跳过缓存。
   */
  async loadTrack(
    songId: string,
    generation: number,
    options?: { prefetchNextId?: string; bypassCache?: boolean },
  ): Promise<PlaybackLoadResult> {
    if (!songId) return { kind: "empty" };
    if (!this.isCurrent(generation)) {
      return { kind: "aborted", generation };
    }

    let proxyUrl =
      options?.bypassCache === true ? null : this.peekCached(songId);

    if (!proxyUrl) {
      if (!this.abort) {
        this.abort = new AbortController();
      }
      const signal = this.abort.signal;
      try {
        const result = await this.resolveUrl(songId, signal);
        if (!this.isCurrent(generation) || signal.aborted) {
          return { kind: "aborted", generation };
        }
        if (!result.ok) {
          return { kind: "unplayable", generation, songId };
        }
        proxyUrl = result.proxyUrl;
        this.cache.set(songId, {
          proxyUrl,
          fetchedAt: this.now(),
        });
      } catch {
        if (!this.isCurrent(generation) || signal.aborted) {
          return { kind: "aborted", generation };
        }
        return { kind: "unplayable", generation, songId };
      }
    }

    const prefetchId = options?.prefetchNextId;
    if (prefetchId && prefetchId !== songId) {
      void this.prefetch(prefetchId, generation);
    }

    return { kind: "src", generation, songId, proxyUrl };
  }

  private async prefetch(songId: string, generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    if (this.peekCached(songId)) return;
    if (!this.abort) return;

    const signal = this.abort.signal;
    try {
      const result = await this.resolveUrl(songId, signal);
      if (!this.isCurrent(generation) || signal.aborted || !result.ok) return;
      this.cache.set(songId, {
        proxyUrl: result.proxyUrl,
        fetchedAt: this.now(),
      });
    } catch {
      // 预取失败静默；点播时再取
    }
  }
}

/** 浏览器：带 AbortSignal 取代理播放地址。 */
export async function fetchSongProxyUrl(
  songId: string,
  signal: AbortSignal,
): Promise<ResolveSongUrlResult> {
  const response = await fetch(`/api/music/song/url?id=${encodeURIComponent(songId)}`, {
    signal,
  });
  const body = (await response.json()) as {
    ok?: boolean;
    proxyUrl?: string;
  };
  if (!body.ok || typeof body.proxyUrl !== "string" || !body.proxyUrl) {
    return { ok: false };
  }
  return { ok: true, proxyUrl: body.proxyUrl };
}
