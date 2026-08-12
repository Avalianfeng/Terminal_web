import type { MusicPlaylistIndex } from "./playlist-types";

/** 终端 / UI 查询：数字 id 精确匹配，否则按中文名包含匹配。 */
export function matchesPlaylist(index: MusicPlaylistIndex, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (index.neteasePlaylistId === q || index.slug === q) return true;
  return index.name.includes(q);
}

export function findPlaylists(
  playlists: MusicPlaylistIndex[],
  query: string,
): MusicPlaylistIndex[] {
  return playlists.filter((playlist) => matchesPlaylist(playlist, query));
}
