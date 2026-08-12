/** 跨歌单曲目检索（play / lyric 等共用）。 */

import type { MusicPlaylistIndex, PlaylistTrack } from "./playlist-types";

export type TrackHit = {
  playlist: MusicPlaylistIndex;
  track: PlaylistTrack;
  index: number;
};

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** 数字 id 精确；否则歌名包含，其次艺人包含。 */
export function matchesTrack(track: PlaylistTrack, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/^\d+$/.test(q) && String(track.id) === q) return true;
  const needle = normalizeQuery(q);
  if (track.name.toLowerCase().includes(needle)) return true;
  return track.artists.some((artist) => artist.toLowerCase().includes(needle));
}

/**
 * 在已载入曲目的歌单里扫描；playlist 顺序即优先级（首个命中优先）。
 * 不含 tracks 的 stub 会被跳过——调用方应先 hydrate。
 */
export function findTracks(
  playlists: readonly MusicPlaylistIndex[],
  query: string,
): TrackHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: TrackHit[] = [];
  for (const playlist of playlists) {
    playlist.tracks.forEach((track, index) => {
      if (matchesTrack(track, q)) {
        hits.push({ playlist, track, index });
      }
    });
  }
  return hits;
}

/** 取扫描到的第一首（歌单序 × 曲序）。 */
export function firstTrackHit(
  playlists: readonly MusicPlaylistIndex[],
  query: string,
): TrackHit | null {
  return findTracks(playlists, query)[0] ?? null;
}
