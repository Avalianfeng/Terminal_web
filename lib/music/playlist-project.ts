import type { MusicPlaylistIndex, PlaylistTrack } from "./playlist-types";

export const LOCAL_PLAYLIST_ID = "local";
export const LOCAL_PLAYLIST_NAME = "本地";

export function isLocalPlaylist(
  playlist: Pick<MusicPlaylistIndex, "neteasePlaylistId" | "slug">,
): boolean {
  return (
    playlist.neteasePlaylistId === LOCAL_PLAYLIST_ID ||
    playlist.slug === LOCAL_PLAYLIST_ID
  );
}

/** 跨 yaml 歌单去重后的「本地」热队列。 */
export function buildLocalPlaylist(
  playlists: MusicPlaylistIndex[],
  localSongIds: ReadonlySet<string>,
): MusicPlaylistIndex | null {
  const byId = new Map<number, PlaylistTrack>();
  for (const playlist of playlists) {
    if (isLocalPlaylist(playlist)) continue;
    for (const track of playlist.tracks) {
      if (!localSongIds.has(String(track.id))) continue;
      if (!byId.has(track.id)) byId.set(track.id, { ...track });
    }
  }
  const tracks = [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );
  if (tracks.length === 0) return null;
  return {
    slug: LOCAL_PLAYLIST_ID,
    neteasePlaylistId: LOCAL_PLAYLIST_ID,
    name: LOCAL_PLAYLIST_NAME,
    sourceUrl: "local://music",
    importedAt: "1970-01-01T00:00:00.000Z",
    trackCount: tracks.length,
    tracks,
  };
}

export function assemblePlaylistCatalog(
  playlists: MusicPlaylistIndex[],
  localSongIds: ReadonlySet<string>,
  visitor: boolean,
): MusicPlaylistIndex[] {
  const yamlOnly = playlists.filter((item) => !isLocalPlaylist(item));
  const local = buildLocalPlaylist(yamlOnly, localSongIds);
  if (visitor) return local ? [local] : [];
  return local ? [local, ...yamlOnly] : yamlOnly;
}

/** @deprecated 访客现只见「本地」歌单；保留给旧测试对照。 */
export function projectPlaylistsForVisitor(
  playlists: MusicPlaylistIndex[],
  localSongIds: ReadonlySet<string>,
): MusicPlaylistIndex[] {
  return assemblePlaylistCatalog(playlists, localSongIds, true);
}

/** 单曲搜索跳过合成「本地」歌单，以免打乱 yaml 序；访客目录只有本地时仍用它。 */
export function playlistsForTrackSearch(
  playlists: MusicPlaylistIndex[],
): MusicPlaylistIndex[] {
  const yaml = playlists.filter((item) => !isLocalPlaylist(item));
  return yaml.length > 0 ? yaml : playlists;
}

export function trackHasLocalAudio(
  track: PlaylistTrack,
  localSongIds: ReadonlySet<string>,
): boolean {
  return localSongIds.has(String(track.id));
}
