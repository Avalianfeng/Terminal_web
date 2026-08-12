import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MusicPlaylistIndex } from "./playlist-types";
import { playlistFileId } from "./playlist-import";
import { playlistsRoot } from "./playlist-store";
import { parsePlaylistIndex, serializePlaylistIndex } from "./playlist-yaml";

export type NeteaseCatalogEntry = {
  id: string;
  name: string;
  trackCount: number;
};

export type PlaylistCatalogClient = {
  loginUserId: (cookie: string) => Promise<string | null>;
  userPlaylists: (uid: string, cookie: string) => Promise<NeteaseCatalogEntry[]>;
};

export type PlaylistCatalogSyncResult = {
  synced: number;
  created: number;
  updated: number;
  preserved: number;
  /** 远程已不存在且仅为 stub 的本地 yaml 已删除 */
  pruned: number;
};

async function readExistingIndex(
  id: string,
  root: string,
): Promise<MusicPlaylistIndex | null> {
  const filePath = path.join(root, `${id}.yaml`);
  try {
    const raw = await readFile(filePath, "utf8");
    return parsePlaylistIndex(raw);
  } catch {
    return null;
  }
}

function mergeCatalogEntry(
  remote: NeteaseCatalogEntry,
  existing: MusicPlaylistIndex | null,
  now: string,
): MusicPlaylistIndex {
  const playlistId = playlistFileId(remote.id);
  const sourceUrl = `https://music.163.com/#/playlist?id=${playlistId}`;

  if (existing && existing.tracks.length > 0) {
    return {
      ...existing,
      name: remote.name || existing.name,
      sourceUrl,
      trackCount: remote.trackCount,
      importedAt: now,
    };
  }

  return {
    slug: playlistId,
    neteasePlaylistId: playlistId,
    name: remote.name || playlistId,
    sourceUrl,
    importedAt: now,
    trackCount: remote.trackCount,
    tracks: existing?.tracks ?? [],
  };
}

/** 从网易账号拉**自建**歌单目录，写入/更新盘内 stub（保留已载入全量 tracks 的文件）。 */
export async function syncPlaylistCatalog(
  cookie: string,
  client: PlaylistCatalogClient,
  options?: { now?: string; root?: string },
): Promise<PlaylistCatalogSyncResult> {
  const now = options?.now ?? new Date().toISOString();
  const root = options?.root ?? playlistsRoot;
  const uid = await client.loginUserId(cookie);
  if (!uid) {
    throw new Error("尚未登录或无法读取账号 uid");
  }

  const remoteList = await client.userPlaylists(uid, cookie);
  await mkdir(root, { recursive: true });

  let created = 0;
  let updated = 0;
  let preserved = 0;

  for (const remote of remoteList) {
    const id = playlistFileId(remote.id);
    const existing = await readExistingIndex(id, root);
    const next = mergeCatalogEntry(remote, existing, now);
    const filePath = path.join(root, `${id}.yaml`);

    if (!existing) created += 1;
    else if (existing.tracks.length > 0) preserved += 1;
    else updated += 1;

    await writeFile(filePath, serializePlaylistIndex(next), "utf8");
  }

  const remoteIds = new Set(
    remoteList.map((remote) => playlistFileId(remote.id)),
  );
  let pruned = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".yaml") ||
      entry.name.startsWith("_")
    ) {
      continue;
    }
    const id = entry.name.slice(0, -".yaml".length);
    if (remoteIds.has(id)) continue;
    const existing = await readExistingIndex(id, root);
    if (!existing || existing.tracks.length > 0) continue;
    await unlink(path.join(root, entry.name));
    pruned += 1;
  }

  return {
    synced: remoteList.length,
    created,
    updated,
    preserved,
    pruned,
  };
}
