import type {
  MusicPlaylistIndex,
  PlaylistCuration,
  PlaylistDataLayer,
  PlaylistTrack,
} from "./playlist-types";

function quote(value: string): string {
  return JSON.stringify(value);
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

function parseTracksBlock(lines: string[]): PlaylistTrack[] {
  const tracks: PlaylistTrack[] = [];
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
      tracks.push(track);
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
    }
  }
  flush();
  return tracks;
}

export function serializePlaylistCuration(curation: PlaylistCuration): string {
  const lines = [
    `slug: ${curation.slug}`,
    `neteasePlaylistId: ${quote(curation.neteasePlaylistId)}`,
    `name: ${quote(curation.name)}`,
    `sourceUrl: ${quote(curation.sourceUrl)}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function parsePlaylistCuration(yaml: string): PlaylistCuration {
  const lines = yaml.split(/\r?\n/);
  const partial: Partial<PlaylistCuration> = {};

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (!top) continue;
    const [, key, raw] = top;
    if (key === "slug") partial.slug = raw.trim();
    if (key === "neteasePlaylistId") partial.neteasePlaylistId = unquote(raw);
    if (key === "name") partial.name = unquote(raw);
    if (key === "sourceUrl") partial.sourceUrl = unquote(raw);
  }

  if (
    !partial.slug ||
    !partial.neteasePlaylistId ||
    !partial.name ||
    !partial.sourceUrl
  ) {
    throw new Error("playlist curation yaml missing required fields");
  }
  return partial as PlaylistCuration;
}

export function serializePlaylistData(
  data: PlaylistDataLayer,
  options?: { includeIdentity?: boolean },
): string {
  const lines: string[] = [];
  if (options?.includeIdentity) {
    if (data.slug) lines.push(`slug: ${data.slug}`);
    if (data.neteasePlaylistId) {
      lines.push(`neteasePlaylistId: ${quote(data.neteasePlaylistId)}`);
    }
    if (data.name) lines.push(`name: ${quote(data.name)}`);
    if (data.sourceUrl) lines.push(`sourceUrl: ${quote(data.sourceUrl)}`);
  }
  lines.push(`importedAt: ${quote(data.importedAt)}`);
  if (data.trackCount !== undefined) {
    lines.push(`trackCount: ${data.trackCount}`);
  }
  lines.push("tracks:");
  for (const track of data.tracks) {
    lines.push(`  - id: ${track.id}`);
    lines.push(`    name: ${quote(track.name)}`);
    lines.push(
      `    artists: [${track.artists.map((artist) => quote(artist)).join(", ")}]`,
    );
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

export function parsePlaylistData(yaml: string): PlaylistDataLayer {
  const lines = yaml.split(/\r?\n/);
  const partial: Partial<PlaylistDataLayer> & { tracks: PlaylistTrack[] } = {
    tracks: [],
  };
  const trackLines: string[] = [];
  let inTracks = false;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^tracks:\s*$/.test(line.trim())) {
      inTracks = true;
      continue;
    }
    if (inTracks) {
      trackLines.push(line);
      continue;
    }
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (!top) continue;
    const [, key, raw] = top;
    if (key === "slug") partial.slug = raw.trim();
    if (key === "neteasePlaylistId") partial.neteasePlaylistId = unquote(raw);
    if (key === "name") partial.name = unquote(raw);
    if (key === "sourceUrl") partial.sourceUrl = unquote(raw);
    if (key === "importedAt") partial.importedAt = unquote(raw);
    if (key === "trackCount") partial.trackCount = Number(raw);
  }

  partial.tracks = parseTracksBlock(trackLines);
  if (!partial.importedAt) {
    throw new Error("playlist data yaml missing importedAt");
  }
  return partial as PlaylistDataLayer;
}

export function mergePlaylistLayers(
  curation: PlaylistCuration | null,
  data: PlaylistDataLayer | null,
): MusicPlaylistIndex | null {
  if (!curation && !data) return null;
  const playlistId =
    curation?.neteasePlaylistId ?? data?.neteasePlaylistId ?? data?.slug;
  if (!playlistId) return null;

  return {
    slug: curation?.slug ?? data?.slug ?? playlistId,
    neteasePlaylistId: playlistId,
    name: curation?.name ?? data?.name ?? playlistId,
    sourceUrl:
      curation?.sourceUrl ??
      data?.sourceUrl ??
      `https://music.163.com/#/playlist?id=${playlistId}`,
    importedAt: data?.importedAt ?? "1970-01-01T00:00:00.000Z",
    ...(data?.trackCount !== undefined ? { trackCount: data.trackCount } : {}),
    tracks: data?.tracks ?? [],
  };
}

/** 解析 legacy 全量 yaml（迁移 / 单测）。 */
export function parsePlaylistIndex(yaml: string): MusicPlaylistIndex {
  const lines = yaml.split(/\r?\n/);
  const hasTracksSection = lines.some((line) => /^tracks:\s*$/.test(line.trim()));
  const hasImportedAt = lines.some((line) => /^importedAt:/.test(line.trim()));
  const hasSlug = lines.some((line) => /^slug:/.test(line.trim()));

  if (hasImportedAt && !hasSlug) {
    const data = parsePlaylistData(yaml);
    const merged = mergePlaylistLayers(null, data);
    if (!merged) throw new Error("playlist data yaml invalid");
    return merged;
  }

  if (hasSlug && !hasTracksSection && !hasImportedAt) {
    const curation = parsePlaylistCuration(yaml);
    const merged = mergePlaylistLayers(curation, null);
    if (!merged) throw new Error("playlist curation yaml invalid");
    return merged;
  }

  if (hasSlug && (hasTracksSection || hasImportedAt)) {
    try {
      const curation = parsePlaylistCuration(yaml);
      const data = parsePlaylistData(yaml);
      const merged = mergePlaylistLayers(curation, data);
      if (!merged) throw new Error("playlist yaml invalid");
      return merged;
    } catch {
      // fall through to legacy parser
    }
  }

  const index: Partial<MusicPlaylistIndex> & { tracks: PlaylistTrack[] } = {
    tracks: [],
  };
  let inTracks = false;
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
      index.tracks!.push(track);
    }
    current = null;
  };

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^tracks:\s*$/.test(line.trim())) {
      inTracks = true;
      continue;
    }
    if (inTracks) {
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

  if (
    !index.slug ||
    !index.neteasePlaylistId ||
    !index.name ||
    !index.sourceUrl ||
    !index.importedAt
  ) {
    throw new Error("playlist yaml missing required fields");
  }

  return index as MusicPlaylistIndex;
}

export function serializePlaylistIndex(index: MusicPlaylistIndex): string {
  const curation = serializePlaylistCuration({
    slug: index.slug,
    neteasePlaylistId: index.neteasePlaylistId,
    name: index.name,
    sourceUrl: index.sourceUrl,
  });
  const data = serializePlaylistData({
    importedAt: index.importedAt,
    trackCount: index.trackCount,
    tracks: index.tracks,
  });
  return curation + data;
}

export function indexToCuration(index: MusicPlaylistIndex): PlaylistCuration {
  return {
    slug: index.slug,
    neteasePlaylistId: index.neteasePlaylistId,
    name: index.name,
    sourceUrl: index.sourceUrl,
  };
}

export function indexToData(index: MusicPlaylistIndex): PlaylistDataLayer {
  return {
    importedAt: index.importedAt,
    trackCount: index.trackCount,
    tracks: index.tracks,
  };
}
