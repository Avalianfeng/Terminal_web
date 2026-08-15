/** 解析网易云 hash 路由 URL 中的 playlist / song id（ADR 0009）。 */

export type NeteaseUrlParse =
  | { kind: "playlist"; id: string; raw: string }
  | { kind: "song"; id: string; raw: string };

function idFromHashParams(hash: string, key: string): string | undefined {
  const queryStart = hash.indexOf("?");
  if (queryStart === -1) return undefined;
  const params = new URLSearchParams(hash.slice(queryStart + 1));
  const value = params.get(key)?.trim();
  return value || undefined;
}

/**
 * 从完整 URL 或裸 hash 提取歌单/单曲 id。
 * 支持：`https://music.163.com/#/playlist?id=1`、`#/song?id=2`、query 在 hash 内。
 */
export function parseNeteaseUrl(input: string): NeteaseUrlParse | null {
  const raw = input.trim();
  if (!raw) return null;

  let hash = raw;
  if (raw.includes("#")) {
    hash = raw.slice(raw.indexOf("#"));
  } else if (!raw.startsWith("#")) {
    try {
      const parsed = new URL(raw);
      if (parsed.searchParams.has("id")) {
        const id = parsed.searchParams.get("id")?.trim();
        if (!id) return null;
        if (parsed.pathname.includes("playlist") || raw.includes("playlist")) {
          return { kind: "playlist", id, raw };
        }
        if (parsed.pathname.includes("song") || raw.includes("song")) {
          return { kind: "song", id, raw };
        }
      }
      hash = parsed.hash || "";
    } catch {
      return null;
    }
  }

  if (!hash.startsWith("#")) {
    hash = `#${hash}`;
  }

  const path = hash.split("?")[0] ?? "";
  const id = idFromHashParams(hash, "id");
  if (!id) return null;

  if (path.includes("playlist")) {
    return { kind: "playlist", id, raw };
  }
  if (path.includes("song")) {
    return { kind: "song", id, raw };
  }

  return null;
}

export function parseNeteasePlaylistId(input: string): string | null {
  const parsed = parseNeteaseUrl(input);
  return parsed?.kind === "playlist" ? parsed.id : null;
}

export function parseNeteaseSongId(input: string): string | null {
  const parsed = parseNeteaseUrl(input);
  return parsed?.kind === "song" ? parsed.id : null;
}

/** 数字 id 或 song URL → songId。 */
export function resolveSongIdParam(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return parseNeteaseSongId(trimmed);
}
