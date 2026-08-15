import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LocalAudioExt } from "./local-audio-store";
import type { MusicPlaylistIndex } from "./playlist-types";
import { parsePlaylistIndex, serializePlaylistIndex } from "./playlist-yaml";

export const playlistsRoot = path.join(
  process.cwd(),
  "content",
  "music",
  "playlists",
);

export async function listPlaylistIndexes(): Promise<MusicPlaylistIndex[]> {
  const entries = await readdir(playlistsRoot, { withFileTypes: true }).catch(
    () => [],
  );

  const indexes = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".yaml") &&
          !entry.name.startsWith("_"),
      )
      .map(async (entry) => {
        const raw = await readFile(path.join(playlistsRoot, entry.name), "utf8").catch(
          () => null,
        );
        if (!raw) return null;
        try {
          return { fileName: entry.name, index: parsePlaylistIndex(raw) };
        } catch {
          return null;
        }
      }),
  );

  const byId = new Map<string, MusicPlaylistIndex>();
  for (const row of indexes) {
    if (!row) continue;
    const id = row.index.neteasePlaylistId;
    const existing = byId.get(id);
    const preferred = row.fileName === `${id}.yaml`;
    if (!existing || preferred) {
      byId.set(id, row.index);
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );
}

export type TrackLocalPatch =
  | { localCachedAt: string; localExt: LocalAudioExt }
  | { localCachedAt?: undefined; localExt?: undefined };

/** 在所有 yaml 中给匹配 songId 的曲目写/清本地缓存字段。 */
export async function patchTracksLocalCache(
  songId: string,
  patch: TrackLocalPatch,
  root = playlistsRoot,
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
    let index: MusicPlaylistIndex;
    try {
      index = parsePlaylistIndex(raw);
    } catch {
      continue;
    }

    let dirty = false;
    const tracks = index.tracks.map((track) => {
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
    await writeFile(
      filePath,
      serializePlaylistIndex({ ...index, tracks }),
      "utf8",
    );
    updated += 1;
  }

  return updated;
}
