import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LocalAudioExt } from "./local-audio-store";
import { musicDataRoot } from "./local-audio-store";
import type { MusicPlaylistIndex, PlaylistCuration, PlaylistDataLayer } from "./playlist-types";
import {
  indexToCuration,
  indexToData,
  mergePlaylistLayers,
  parsePlaylistCuration,
  parsePlaylistData,
  serializePlaylistCuration,
  serializePlaylistData,
} from "./playlist-yaml";

/** Git 跟踪：策展意图（ADR 0014）。 */
export const playlistsContentRoot = path.join(
  process.cwd(),
  "content",
  "music",
  "playlists",
);

/** gitignore：sync / import 曲目与缓存元数据（ADR 0014）。 */
export const playlistsDataRoot = path.join(musicDataRoot(), "playlists");

/** @deprecated 使用 playlistsContentRoot / playlistsDataRoot */
export const playlistsRoot = playlistsContentRoot;

function playlistIdFromFileName(fileName: string): string {
  return fileName.slice(0, -".yaml".length);
}

async function readYamlFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch(() => null);
}

async function listYamlIds(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yaml") &&
        !entry.name.startsWith("_"),
    )
    .map((entry) => playlistIdFromFileName(entry.name));
}

export async function readPlaylistCuration(
  id: string,
): Promise<PlaylistCuration | null> {
  const raw = await readYamlFile(path.join(playlistsContentRoot, `${id}.yaml`));
  if (!raw) return null;
  try {
    return parsePlaylistCuration(raw);
  } catch {
    return null;
  }
}

export async function readPlaylistData(
  id: string,
): Promise<PlaylistDataLayer | null> {
  const raw = await readYamlFile(path.join(playlistsDataRoot, `${id}.yaml`));
  if (!raw) return null;
  try {
    return parsePlaylistData(raw);
  } catch {
    return null;
  }
}

export async function writePlaylistCuration(curation: PlaylistCuration): Promise<void> {
  await mkdir(playlistsContentRoot, { recursive: true });
  await writeFile(
    path.join(playlistsContentRoot, `${curation.neteasePlaylistId}.yaml`),
    serializePlaylistCuration(curation),
    "utf8",
  );
}

export async function writePlaylistData(
  id: string,
  data: PlaylistDataLayer,
  options?: { includeIdentity?: boolean },
): Promise<void> {
  await mkdir(playlistsDataRoot, { recursive: true });
  await writeFile(
    path.join(playlistsDataRoot, `${id}.yaml`),
    serializePlaylistData(data, options),
    "utf8",
  );
}

/** 显式 import：策展进 content，曲目进 data。 */
export async function writePlaylistIndex(index: MusicPlaylistIndex): Promise<void> {
  await writePlaylistCuration(indexToCuration(index));
  await writePlaylistData(index.neteasePlaylistId, indexToData(index));
}

export async function listPlaylistIndexes(): Promise<MusicPlaylistIndex[]> {
  const [contentIds, dataIds] = await Promise.all([
    listYamlIds(playlistsContentRoot),
    listYamlIds(playlistsDataRoot),
  ]);
  const ids = new Set([...contentIds, ...dataIds]);

  const indexes = await Promise.all(
    [...ids].map(async (id) => {
      const [curation, data] = await Promise.all([
        readPlaylistCuration(id),
        readPlaylistData(id),
      ]);
      return mergePlaylistLayers(curation, data);
    }),
  );

  const byId = new Map<string, MusicPlaylistIndex>();
  for (const index of indexes) {
    if (!index) continue;
    byId.set(index.neteasePlaylistId, index);
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );
}

export type TrackLocalPatch =
  | { localCachedAt: string; localExt: LocalAudioExt }
  | { localCachedAt?: undefined; localExt?: undefined };

/** 在所有 data yaml 中给匹配 songId 的曲目写/清本地缓存字段。 */
export async function patchTracksLocalCache(
  songId: string,
  patch: TrackLocalPatch,
  root = playlistsDataRoot,
): Promise<number> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  let updated = 0;

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".yaml") ||
      entry.name.startsWith("_")
    ) {
      continue;
    }
    const filePath = path.join(root, entry.name);
    const raw = await readFile(filePath, "utf8").catch(() => null);
    if (!raw) continue;
    let data: PlaylistDataLayer;
    try {
      data = parsePlaylistData(raw);
    } catch {
      continue;
    }

    let dirty = false;
    const tracks = data.tracks.map((track) => {
      if (String(track.id) !== songId) return track;
      dirty = true;
      if (!patch.localCachedAt) {
        const next = { ...track };
        delete next.localCachedAt;
        delete next.localExt;
        return next;
      }
      return {
        ...track,
        localCachedAt: patch.localCachedAt,
        localExt: patch.localExt,
      };
    });
    if (!dirty) continue;

    const id = playlistIdFromFileName(entry.name);
    const curation = await readPlaylistCuration(id);
    await writeFile(
      filePath,
      serializePlaylistData(
        { ...data, tracks },
        { includeIdentity: !curation },
      ),
      "utf8",
    );
    updated += 1;
  }

  return updated;
}
