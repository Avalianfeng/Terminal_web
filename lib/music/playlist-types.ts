/** 盘内歌单索引：`content/music/playlists/<slug>.yaml`（ADR 0009）。 */

export type PlaylistTrack = {
  /** 网易云 song id */
  id: number;
  name: string;
  artists: string[];
  durationMs?: number;
};

export type MusicPlaylistIndex = {
  slug: string;
  neteasePlaylistId: string;
  name: string;
  sourceUrl: string;
  importedAt: string;
  /** 曲目未载入盘内时，网易返回的曲数（catalog stub）。 */
  trackCount?: number;
  tracks: PlaylistTrack[];
};

export function playlistTrackCount(playlist: MusicPlaylistIndex): number {
  if (playlist.tracks.length > 0) return playlist.tracks.length;
  return playlist.trackCount ?? 0;
}
