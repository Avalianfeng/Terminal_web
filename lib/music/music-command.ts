import { parseNeteaseUrl } from "./netease-url";
import type { MusicPlaylistIndex } from "./playlist-types";
import { findPlaylists } from "./playlist-resolve";
import { firstTrackHit, type TrackHit } from "./track-resolve";

export type SearchScope = "default" | "playlist" | "song";

export const MUSIC_USAGE = {
  playlist: "music playlist next|prev|<name>",
} as const;

export type MusicIntent =
  | { kind: "help" }
  | { kind: "usage"; topic: "playlist" }
  | { kind: "list" }
  | { kind: "play"; query: string; scope: SearchScope }
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
  | { kind: "shuffle"; mode: "toggle" | "on" | "off" }
  | { kind: "download"; queries: string[] }
  | { kind: "delete"; name: string }
  | { kind: "flag-conflict" }
  | { kind: "flag-mismatch"; messageKey: "downloadPlaylistOnly" | "lyricPlaylistOnly" | "deleteNeedsName" | "playlistSongOnly" };

export type MusicAction =
  | { type: "play"; playlist: MusicPlaylistIndex; trackIndex?: number }
  | { type: "play-search"; query: string; scope: SearchScope }
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
  | { type: "shuffle"; mode: "toggle" | "on" | "off" }
  | { type: "download-now" }
  | { type: "download-queries"; queries: string[] }
  | { type: "delete"; name: string };

/** Tab 第一参候选（与 `parseMusicArgs` 可识别子命令同源；含别名）。 */
export const MUSIC_SUBCOMMANDS = [
  "ls",
  "list",
  "help",
  "play",
  "pause",
  "resume",
  "stop",
  "next",
  "prev",
  "previous",
  "show",
  "hide",
  "lyric",
  "lyrics",
  "lrc",
  "shuffle",
  "random",
  "playlist",
  "pl",
  "import",
  "sync",
  "download",
  "delete",
] as const;

export const MUSIC_PLAYLIST_SUBS = [
  "next",
  "prev",
  "previous",
  "use",
] as const;

export const MUSIC_SHUFFLE_MODES = ["on", "off"] as const;

export const MUSIC_SEARCH_FLAGS = ["--playlist", "--song"] as const;

export function takeSearchScope(args: readonly string[]): {
  scope: SearchScope;
  rest: string[];
  conflict: boolean;
} {
  let playlist = false;
  let song = false;
  const rest: string[] = [];
  for (const arg of args) {
    const lower = arg.toLowerCase();
    if (lower === "--playlist") playlist = true;
    else if (lower === "--song") song = true;
    else rest.push(arg);
  }
  if (playlist && song) {
    return { scope: "default", rest, conflict: true };
  }
  if (playlist) return { scope: "playlist", rest, conflict: false };
  if (song) return { scope: "song", rest, conflict: false };
  return { scope: "default", rest, conflict: false };
}

/** 多个歌名用逗号（含中文逗号）分隔；无逗号则整段一首。 */
export function splitSongQueries(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function filterMusicPrefix(values: readonly string[], partial: string) {
  const needle = partial.toLowerCase();
  return values.filter((value) => value.toLowerCase().startsWith(needle));
}

/**
 * `music` 参数 Tab 候选。
 * `completedArgs` = 命令后、当前 partial 之前已敲完的词（不含 trailing partial）。
 * 歌名/歌单名需运行时目录，此处只补静态子命令与二级开关。
 */
export function musicArgCandidates(
  completedArgs: readonly string[],
  partial: string,
): string[] {
  if (completedArgs.length === 0) {
    return filterMusicPrefix(MUSIC_SUBCOMMANDS, partial);
  }

  const sub = completedArgs[0]?.toLowerCase() ?? "";
  if (
    (sub === "playlist" || sub === "pl") &&
    completedArgs.length === 1
  ) {
    if (partial.startsWith("-")) {
      return filterMusicPrefix(["--playlist"], partial);
    }
    return filterMusicPrefix(MUSIC_PLAYLIST_SUBS, partial);
  }
  if (
    (sub === "shuffle" || sub === "random") &&
    completedArgs.length === 1
  ) {
    return filterMusicPrefix(MUSIC_SHUFFLE_MODES, partial);
  }
  if (
    (sub === "play" ||
      sub === "lyric" ||
      sub === "lyrics" ||
      sub === "lrc" ||
      sub === "download") &&
    completedArgs.length === 1 &&
    partial.startsWith("-")
  ) {
    if (sub === "download") {
      return filterMusicPrefix(["--song"], partial);
    }
    if (sub === "lyric" || sub === "lyrics" || sub === "lrc") {
      return filterMusicPrefix(["--song"], partial);
    }
    return filterMusicPrefix(MUSIC_SEARCH_FLAGS, partial);
  }

  return [];
}

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
    const flags = takeSearchScope(rest);
    if (flags.conflict) return { kind: "flag-conflict" };
    if (flags.scope === "playlist") {
      return { kind: "flag-mismatch", messageKey: "lyricPlaylistOnly" };
    }
    return { kind: "lyric", query: flags.rest.join(" ").trim() };
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
    const [plSub = ""] = rest;
    if (plSub === "next") return { kind: "playlist-next" };
    if (plSub === "prev" || plSub === "previous") return { kind: "playlist-prev" };
    const flags = takeSearchScope(rest);
    if (flags.conflict) return { kind: "flag-conflict" };
    if (flags.scope === "song") {
      return { kind: "flag-mismatch", messageKey: "playlistSongOnly" };
    }
    const query = flags.rest.join(" ").trim();
    if (!query || query === "use") {
      return { kind: "usage", topic: "playlist" };
    }
    const useQuery =
      flags.rest[0]?.toLowerCase() === "use"
        ? flags.rest.slice(1).join(" ").trim()
        : query;
    return { kind: "playlist-use", query: useQuery };
  }
  if (sub === "play") {
    const flags = takeSearchScope(rest);
    if (flags.conflict) return { kind: "flag-conflict" };
    const query = flags.rest.join(" ").trim();
    if (!query) return { kind: "resume" };
    return { kind: "play", query, scope: flags.scope };
  }
  if (sub === "import") {
    return { kind: "import", url: rest.join(" ").trim() };
  }
  if (sub === "sync") return { kind: "sync" };
  if (sub === "download") {
    const flags = takeSearchScope(rest);
    if (flags.conflict) return { kind: "flag-conflict" };
    if (flags.scope === "playlist") {
      return { kind: "flag-mismatch", messageKey: "downloadPlaylistOnly" };
    }
    return { kind: "download", queries: splitSongQueries(flags.rest.join(" ")) };
  }
  if (sub === "delete") {
    const flags = takeSearchScope(rest);
    if (flags.conflict) return { kind: "flag-conflict" };
    const name = flags.rest.join(" ").trim();
    if (!name) {
      return { kind: "flag-mismatch", messageKey: "deleteNeedsName" };
    }
    return { kind: "delete", name };
  }
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
  scope: SearchScope = "default",
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

  const playlistMatches =
    scope === "song" ? [] : findPlaylists(playlists, query);
  if (scope !== "song" && playlistMatches.length === 1) {
    return { ok: true, kind: "playlist", playlist: playlistMatches[0]! };
  }

  if (scope !== "playlist") {
    const hit = firstTrackHit(tracksReady, query);
    if (hit) {
      return { ok: true, kind: "track", hit };
    }
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
