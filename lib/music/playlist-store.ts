import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { MusicPlaylistIndex } from "./playlist-types";
import { parsePlaylistIndex } from "./playlist-yaml";

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
