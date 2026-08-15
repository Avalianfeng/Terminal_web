import type { MusicPlaylistIndex, PlaylistTrack } from "./playlist-types";

function quote(value: string): string {
  return JSON.stringify(value);
}

export function serializePlaylistIndex(index: MusicPlaylistIndex): string {
  const lines = [
    `slug: ${index.slug}`,
    `neteasePlaylistId: ${quote(index.neteasePlaylistId)}`,
    `name: ${quote(index.name)}`,
    `sourceUrl: ${quote(index.sourceUrl)}`,
    `importedAt: ${quote(index.importedAt)}`,
    ...(index.trackCount !== undefined ? [`trackCount: ${index.trackCount}`] : []),
    "tracks:",
  ];

  for (const track of index.tracks) {
    lines.push(`  - id: ${track.id}`);
    lines.push(`    name: ${quote(track.name)}`);
    lines.push(`    artists: [${track.artists.map((artist) => quote(artist)).join(", ")}]`);
    if (track.durationMs !== undefined) {
      lines.push(`    durationMs: ${track.durationMs}`);
    }
    if (track.localCachedAt) {
      lines.push(`    localCachedAt: ${quote(track.localCachedAt)}`);
    }
    if (track.localExt) {
      lines.push(`    localExt: ${track.localExt}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseArtists(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** 解析本模块写出的 yaml（非通用 YAML）。 */
export function parsePlaylistIndex(yaml: string): MusicPlaylistIndex {
  const lines = yaml.split(/\r?\n/);
  const index: Partial<MusicPlaylistIndex> & { tracks: PlaylistTrack[] } = {
    tracks: [],
  };
  let current: Partial<PlaylistTrack> | null = null;

  const flush = () => {
    if (current?.id && current.name) {
      const track: PlaylistTrack = {
        id: current.id,
        name: current.name,
        artists: current.artists ?? [],
      };
      if (typeof current.durationMs === "number" && Number.isFinite(current.durationMs)) {
        track.durationMs = current.durationMs;
      }
      if (current.localCachedAt) track.localCachedAt = current.localCachedAt;
      if (current.localExt) track.localExt = current.localExt;
      index.tracks.push(track);
    }
    current = null;
  };

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const trackId = line.match(/^\s+-\s+id:\s+(\d+)\s*$/);
    if (trackId) {
      flush();
      current = { id: Number(trackId[1]), name: "", artists: [] };
      continue;
    }

    const trackField = line.match(/^\s{4}(\w+):\s*(.*)$/);
    if (trackField && current) {
      const [, key, raw] = trackField;
      if (key === "name") current.name = unquote(raw);
      if (key === "artists") current.artists = parseArtists(raw);
      if (key === "durationMs") current.durationMs = Number(raw);
      if (key === "localCachedAt") current.localCachedAt = unquote(raw);
      if (key === "localExt") {
        const ext = unquote(raw);
        if (ext === "mp3" || ext === "m4a" || ext === "ogg" || ext === "flac") {
          current.localExt = ext;
        }
      }
      continue;
    }

    const top = line.match(/^(\w+):\s*(.*)$/);
    if (!top) continue;
    const [, key, raw] = top;
    if (key === "slug") index.slug = raw.trim();
    if (key === "neteasePlaylistId") index.neteasePlaylistId = unquote(raw);
    if (key === "name") index.name = unquote(raw);
    if (key === "sourceUrl") index.sourceUrl = unquote(raw);
    if (key === "importedAt") index.importedAt = unquote(raw);
    if (key === "trackCount") index.trackCount = Number(raw);
  }
  flush();

  if (!index.slug || !index.neteasePlaylistId || !index.name || !index.sourceUrl || !index.importedAt) {
    throw new Error("playlist yaml missing required fields");
  }

  return index as MusicPlaylistIndex;
}
