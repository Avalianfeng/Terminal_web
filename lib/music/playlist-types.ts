/** 盘内歌单索引：策展 content/music/playlists/ + 曲目 data/music/playlists/（ADR 0014）。 */

export type PlaylistCuration = {
  slug: string;
  neteasePlaylistId: string;
  name: string;
  sourceUrl: string;
};

/** data 层：曲目与 sync 元数据；无 content 时 sync stub 可带展示字段。 */
export type PlaylistDataLayer = {
  importedAt: string;
  trackCount?: number;
  tracks: PlaylistTrack[];
  slug?: string;
  neteasePlaylistId?: string;
  name?: string;
  sourceUrl?: string;
};

export type PlaylistTrack = {
  /** 网易云 song id */
  id: number;
  name: string;
  artists: string[];
  durationMs?: number;
  /** 最近一次成功 download 的时间（展示用；存在性以盘上文件为准）。 */
  localCachedAt?: string;
  localExt?: "mp3" | "m4a" | "ogg" | "flac";
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
