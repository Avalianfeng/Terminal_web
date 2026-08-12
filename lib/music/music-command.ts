import { parseNeteaseUrl } from "./netease-url";
import type { MusicPlaylistIndex } from "./playlist-types";
import { findPlaylists } from "./playlist-resolve";
import { firstTrackHit, type TrackHit } from "./track-resolve";

export type MusicIntent =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "play"; query: string }
  | { kind: "show" }
  | { kind: "hide" }
  | { kind: "import"; url: string }
  | { kind: "sync" }
  | { kind: "stop" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "playlist-next" }
  | { kind: "playlist-prev" }
  | { kind: "playlist-use"; query: string }
  | { kind: "lyric"; query: string }
  | { kind: "shuffle"; mode: "toggle" | "on" | "off" };

export type MusicAction =
  | { type: "play"; playlist: MusicPlaylistIndex; trackIndex?: number }
  | { type: "play-search"; query: string }
  | { type: "show" }
  | { type: "hide" }
  | { type: "import"; url: string }
  | { type: "sync" }
  | { type: "stop" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "playlist-next" }
  | { type: "playlist-prev" }
  | { type: "playlist-use"; playlist: MusicPlaylistIndex }
  | { type: "lyric"; query: string }
  | { type: "shuffle"; mode: "toggle" | "on" | "off" };

export function parseMusicArgs(args: string[]): MusicIntent {
  const [sub = "", ...rest] = args;
  if (!sub || sub === "ls" || sub === "list") {
    return { kind: "list" };
  }
  if (sub === "help" || sub === "-h" || sub === "--help") {
    return { kind: "help" };
  }
  if (sub === "stop") return { kind: "stop" };
  if (sub === "pause") return { kind: "pause" };
  if (sub === "resume") return { kind: "resume" };
  if (sub === "next") return { kind: "next" };
  if (sub === "prev" || sub === "previous") return { kind: "prev" };
  if (sub === "show") return { kind: "show" };
  if (sub === "hide") return { kind: "hide" };
  if (sub === "lyric" || sub === "lyrics" || sub === "lrc") {
    return { kind: "lyric", query: rest.join(" ").trim() };
  }
  if (sub === "shuffle" || sub === "random") {
    const modeRaw = rest[0]?.trim().toLowerCase() ?? "";
    if (modeRaw === "on" || modeRaw === "1" || modeRaw === "true") {
      return { kind: "shuffle", mode: "on" };
    }
    if (modeRaw === "off" || modeRaw === "0" || modeRaw === "false") {
      return { kind: "shuffle", mode: "off" };
    }
    return { kind: "shuffle", mode: "toggle" };
  }
  if (sub === "playlist" || sub === "pl") {
    const [plSub = "", ...plRest] = rest;
    if (plSub === "next") return { kind: "playlist-next" };
    if (plSub === "prev" || plSub === "previous") return { kind: "playlist-prev" };
    const query = [plSub, ...plRest].join(" ").trim();
    if (!query || query === "use") {
      return { kind: "help" };
    }
    const useQuery = plSub === "use" ? plRest.join(" ").trim() : query;
    return { kind: "playlist-use", query: useQuery };
  }
  if (sub === "play") {
    const query = rest.join(" ").trim();
    if (!query) return { kind: "resume" };
    return { kind: "play", query };
  }
  if (sub === "import") {
    return { kind: "import", url: rest.join(" ").trim() };
  }
  if (sub === "sync") return { kind: "sync" };
  return { kind: "help" };
}

export function resolvePlayQuery(
  playlists: MusicPlaylistIndex[],
  query: string,
):
  | { ok: true; playlist: MusicPlaylistIndex }
  | {
      ok: false;
      reason: "missing" | "none" | "ambiguous";
      matches: MusicPlaylistIndex[];
    } {
  if (!query) {
    return { ok: false, reason: "missing", matches: [] };
  }
  const matches = findPlaylists(playlists, query);
  if (matches.length === 1) {
    return { ok: true, playlist: matches[0]! };
  }
  if (matches.length === 0) {
    return { ok: false, reason: "none", matches: [] };
  }
  return { ok: false, reason: "ambiguous", matches };
}

/**
 * play 目标：唯一歌单优先；否则曲目扫描首命中。
 * `tracksReady` 为已 hydrate 的歌单列表（可与 playlists 相同）。
 */
export function resolvePlayTarget(
  playlists: MusicPlaylistIndex[],
  query: string,
  tracksReady: MusicPlaylistIndex[] = playlists,
):
  | { ok: true; kind: "playlist"; playlist: MusicPlaylistIndex }
  | { ok: true; kind: "track"; hit: TrackHit }
  | {
      ok: false;
      reason: "missing" | "none" | "ambiguous";
      matches: MusicPlaylistIndex[];
    } {
  if (!query.trim()) {
    return { ok: false, reason: "missing", matches: [] };
  }

  const playlistMatches = findPlaylists(playlists, query);
  if (playlistMatches.length === 1) {
    return { ok: true, kind: "playlist", playlist: playlistMatches[0]! };
  }

  const hit = firstTrackHit(tracksReady, query);
  if (hit) {
    return { ok: true, kind: "track", hit };
  }

  if (playlistMatches.length > 1) {
    return { ok: false, reason: "ambiguous", matches: playlistMatches };
  }
  return { ok: false, reason: "none", matches: [] };
}

export function resolveImportUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseNeteaseUrl(trimmed);
  if (parsed?.kind !== "playlist") return null;
  return trimmed;
}

/** 默认热队列：排序后第一份（与 `music show` 无会话时一致）。 */
export function defaultPlaylist(
  playlists: MusicPlaylistIndex[],
): MusicPlaylistIndex | null {
  return playlists[0] ?? null;
}

/** 在已导入列表中按环切换（delta = ±1）。 */
export function stepPlaylist(
  playlists: MusicPlaylistIndex[],
  currentId: string,
  delta: number,
): MusicPlaylistIndex | null {
  if (playlists.length === 0) return null;
  const index = playlists.findIndex(
    (item) =>
      item.neteasePlaylistId === currentId || item.slug === currentId,
  );
  const from = index >= 0 ? index : 0;
  const next = (from + delta + playlists.length) % playlists.length;
  return playlists[next] ?? null;
}
