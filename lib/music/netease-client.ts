import { createRequire } from "node:module";
import type { NeteasePlaylistClient } from "./playlist-import";
import type { PlaylistTrack } from "./playlist-types";
import type { PlaylistCatalogClient, NeteaseCatalogEntry } from "./playlist-sync";
import { mapSongUrlPayload, type NeteasePlaybackClient, type SongPlayResult } from "./song-url";

const require = createRequire(import.meta.url);

type NeteaseApi = {
  login_status: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  user_playlist: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  user_playlist_create: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  playlist_detail: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  playlist_track_all: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  song_url_v1: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  song_url: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
  lyric: (query: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function mapNeteaseTrack(raw: unknown): PlaylistTrack | null {
  const song = asRecord(raw);
  const id = Number(song.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const artistSource = song.ar ?? song.artists;
  const artists = Array.isArray(artistSource)
    ? artistSource
        .map((item) => asRecord(item).name)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];

  const duration =
    typeof song.dt === "number"
      ? song.dt
      : typeof song.duration === "number"
        ? song.duration
        : undefined;

  return {
    id,
    name: typeof song.name === "string" ? song.name : "",
    artists,
    durationMs: duration,
  };
}

function mapUserPlaylistEntry(raw: unknown): NeteaseCatalogEntry | null {
  const row = asRecord(raw);
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id: String(id),
    name: typeof row.name === "string" ? row.name : String(id),
    trackCount: typeof row.trackCount === "number" ? row.trackCount : 0,
  };
}

export function createLiveNeteaseClient(): NeteasePlaylistClient &
  NeteasePlaybackClient &
  PlaylistCatalogClient {
  const api = require("NeteaseCloudMusicApi") as NeteaseApi;

  return {
    async loginUserId(cookie) {
      const result = await api.login_status({
        cookie,
        timestamp: Date.now(),
      });
      const body = asRecord(result.body);
      const data = asRecord(body.data);
      const account = asRecord(data.account);
      const profile = asRecord(data.profile);
      const id = account.id ?? profile.userId;
      const numeric = Number(id);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      const code = typeof body.code === "number" ? body.code : result.status;
      if (code !== 200 && code !== 0 && !account.id) return null;
      return String(numeric);
    },

    async userPlaylists(uid, cookie) {
      const playlists: NeteaseCatalogEntry[] = [];
      const limit = 1000;
      let offset = 0;

      while (offset < 20_000) {
        const result = await api.user_playlist_create({
          uid,
          limit,
          offset,
          cookie,
          timestamp: Date.now(),
        });
        const body = asRecord(result.body);
        const batch = body.playlist;
        const rows = Array.isArray(batch) ? batch : [];
        for (const row of rows) {
          const mapped = mapUserPlaylistEntry(row);
          if (mapped) playlists.push(mapped);
        }
        if (rows.length < limit) break;
        offset += limit;
      }

      return playlists;
    },

    async playlistDetail(id, cookie) {
      const result = await api.playlist_detail({
        id,
        s: 0,
        cookie,
        timestamp: Date.now(),
      });
      const playlist = asRecord(result.body.playlist);
      const name = typeof playlist.name === "string" ? playlist.name : "";
      const trackCount =
        typeof playlist.trackCount === "number" ? playlist.trackCount : undefined;
      return { name, trackCount };
    },

    async playlistTracks(id, cookie) {
      const tracks: PlaylistTrack[] = [];
      const limit = 200;
      let offset = 0;

      while (offset < 30_000) {
        const result = await api.playlist_track_all({
          id,
          limit,
          offset,
          cookie,
          timestamp: Date.now(),
        });
        const body = asRecord(result.body);
        const batch = (body.songs ?? body.tracks) as unknown;
        const rows = Array.isArray(batch) ? batch : [];
        for (const row of rows) {
          const mapped = mapNeteaseTrack(row);
          if (mapped) tracks.push(mapped);
        }
        if (rows.length < limit) break;
        offset += limit;
      }

      return tracks;
    },

    async songUrl(id, cookie) {
      return fetchNeteaseSongUrl(api, id, cookie);
    },

    async songLyric(id, cookie) {
      const result = await api.lyric({
        id,
        cookie,
        timestamp: Date.now(),
      });
      const body = asRecord(result.body);
      const lrc = asRecord(body.lrc);
      const text = typeof lrc.lyric === "string" ? lrc.lyric : "";
      return text;
    },
  };
}

const QUALITY_LEVELS = ["exhigh", "standard"] as const;

async function fetchNeteaseSongUrl(
  api: NeteaseApi,
  id: string,
  cookie: string,
): Promise<SongPlayResult> {
  let last: SongPlayResult = {
    playable: false,
    trial: false,
    url: null,
    message: "无法获取播放地址",
  };

  for (const level of QUALITY_LEVELS) {
    try {
      let result: { body: Record<string, unknown> };
      try {
        result = await api.song_url_v1({
          id,
          level,
          cookie,
          timestamp: Date.now(),
        });
      } catch {
        result = await api.song_url({
          id,
          br: level === "exhigh" ? 320000 : 128000,
          cookie,
          timestamp: Date.now(),
        });
      }
      const data = Array.isArray(result.body.data) ? result.body.data[0] : undefined;
      const mapped = mapSongUrlPayload(data, level);
      if (mapped.playable && !mapped.trial) return mapped;
      if (mapped.playable) last = mapped;
    } catch {
      // try next quality
    }
  }

  return last;
}
