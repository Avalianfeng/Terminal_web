import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlaylistDataLayer } from "./playlist-types";
import { playlistFileId } from "./playlist-import";
import {
  playlistsDataRoot,
  readPlaylistCuration,
} from "./playlist-store";
import { parsePlaylistData, serializePlaylistData } from "./playlist-yaml";

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
  /** 远程已不存在且仅为 stub 的 data yaml 已删除 */
  pruned: number;
};

async function readExistingData(
  id: string,
  root: string,
): Promise<PlaylistDataLayer | null> {
  const filePath = path.join(root, `${id}.yaml`);
  try {
    const raw = await readFile(filePath, "utf8");
    return parsePlaylistData(raw);
  } catch {
    return null;
  }
}

function mergeCatalogEntry(
  remote: NeteaseCatalogEntry,
  existing: PlaylistDataLayer | null,
  now: string,
  hasCuration: boolean,
): PlaylistDataLayer {
  const playlistId = playlistFileId(remote.id);
  const sourceUrl = `https://music.163.com/#/playlist?id=${playlistId}`;

  if (existing && existing.tracks.length > 0) {
    return {
      ...existing,
      trackCount: remote.trackCount,
      importedAt: now,
      ...(hasCuration
        ? {}
        : {
            slug: playlistId,
            neteasePlaylistId: playlistId,
            name: remote.name || existing.name || playlistId,
            sourceUrl,
          }),
    };
  }

  return {
    importedAt: now,
    trackCount: remote.trackCount,
    tracks: existing?.tracks ?? [],
    ...(hasCuration
      ? {}
      : {
          slug: playlistId,
          neteasePlaylistId: playlistId,
          name: remote.name || playlistId,
          sourceUrl,
        }),
  };
}

/** 从网易账号拉**自建**歌单目录，只写 data/（保留已载入全量 tracks；不碰 content/）。 */
export async function syncPlaylistCatalog(
  cookie: string,
  client: PlaylistCatalogClient,
  options?: { now?: string; root?: string },
): Promise<PlaylistCatalogSyncResult> {
  const now = options?.now ?? new Date().toISOString();
  const root = options?.root ?? playlistsDataRoot;
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
    const existing = await readExistingData(id, root);
    const curation = await readPlaylistCuration(id);
    const hasCuration = curation !== null;
    const next = mergeCatalogEntry(remote, existing, now, hasCuration);
    const filePath = path.join(root, `${id}.yaml`);

    if (!existing) created += 1;
    else if (existing.tracks.length > 0) preserved += 1;
    else updated += 1;

    await writeFile(
      filePath,
      serializePlaylistData(next, { includeIdentity: !hasCuration }),
      "utf8",
    );
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
    const existing = await readExistingData(id, root);
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
