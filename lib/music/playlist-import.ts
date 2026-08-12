import { parseNeteasePlaylistId } from "./netease-url";
import type { MusicPlaylistIndex, PlaylistTrack } from "./playlist-types";

export type NeteasePlaylistClient = {
  playlistDetail: (
    id: string,
    cookie: string,
  ) => Promise<{ name: string; trackCount?: number }>;
  playlistTracks: (id: string, cookie: string) => Promise<PlaylistTrack[]>;
};

export class PlaylistImportError extends Error {
  readonly code: "bad_request" | "unauthorized" | "upstream";

  constructor(code: PlaylistImportError["code"], message: string) {
    super(message);
    this.name = "PlaylistImportError";
    this.code = code;
  }
}

/** 盘内文件名 = 网易云歌单数字 id（展示名用 yaml `name`，终端可中文匹配）。 */
export function playlistFileId(playlistId: string): string {
  const id = playlistId.trim();
  if (!/^\d+$/.test(id)) {
    throw new PlaylistImportError("bad_request", `非法歌单 id: ${playlistId}`);
  }
  return id;
}

export function resolveImportTarget(input: {
  url?: string;
  playlistId?: string;
}): { playlistId: string; sourceUrl: string; slug: string } {
  const fromUrl = input.url ? parseNeteasePlaylistId(input.url) : null;
  const playlistId = playlistFileId(input.playlistId ?? fromUrl ?? "");

  const sourceUrl =
    input.url?.trim() ||
    `https://music.163.com/#/playlist?id=${playlistId}`;

  return { playlistId, sourceUrl, slug: playlistId };
}

export async function buildPlaylistIndex(
  input: {
    url?: string;
    playlistId?: string;
    cookie: string;
    now?: string;
  },
  client: NeteasePlaylistClient,
): Promise<MusicPlaylistIndex> {
  if (!input.cookie.trim()) {
    throw new PlaylistImportError("unauthorized", "尚未写入网易云 Cookie");
  }

  const target = resolveImportTarget(input);
  let detail: { name: string; trackCount?: number };
  try {
    detail = await client.playlistDetail(target.playlistId, input.cookie);
  } catch (error) {
    throw new PlaylistImportError(
      "upstream",
      error instanceof Error ? error.message : "playlist_detail 失败",
    );
  }

  let tracks: PlaylistTrack[];
  try {
    tracks = await client.playlistTracks(target.playlistId, input.cookie);
  } catch (error) {
    throw new PlaylistImportError(
      "upstream",
      error instanceof Error ? error.message : "playlist_track_all 失败",
    );
  }

  return {
    slug: target.slug,
    neteasePlaylistId: target.playlistId,
    name: detail.name || target.slug,
    sourceUrl: target.sourceUrl,
    importedAt: input.now ?? new Date().toISOString(),
    tracks,
  };
}
