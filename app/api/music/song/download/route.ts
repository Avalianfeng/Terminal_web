import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { cacheSongFromCdn, uncacheSong } from "@/lib/music/local-cache-sync";
import { isSongId } from "@/lib/music/local-audio-store";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import { resolveSongIdParam } from "@/lib/music/netease-url";
import type { NeteasePlaylistClient } from "@/lib/music/playlist-import";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

async function collectSongIds(
  body: { id?: unknown; playlistId?: unknown },
  options?: { cookie?: string; client?: NeteasePlaylistClient },
): Promise<string[] | { error: string }> {
  const rawId =
    typeof body.id === "string" || typeof body.id === "number"
      ? String(body.id)
      : "";
  const fromId = resolveSongIdParam(rawId || null);
  if (fromId) return [fromId];

  const playlistId =
    typeof body.playlistId === "string" ? body.playlistId.trim() : "";
  if (!playlistId || !isSongId(playlistId)) {
    return { error: "需要 id 或 playlistId" };
  }
  const playlists = await listPlaylistIndexes();
  const playlist = playlists.find(
    (item) => item.neteasePlaylistId === playlistId || item.slug === playlistId,
  );
  if (!playlist) {
    return { error: "歌单不存在" };
  }
  if (playlist.tracks.length > 0) {
    return playlist.tracks.map((track) => String(track.id));
  }
  if (options?.cookie && options.client) {
    const tracks = await options.client.playlistTracks(
      playlistId,
      options.cookie,
    );
    if (tracks.length > 0) {
      return tracks.map((track) => String(track.id));
    }
  }
  return { error: "歌单不存在或尚未载入曲目" };
}

export async function POST(request: Request) {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  let body: { id?: unknown; playlistId?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; playlistId?: unknown };
  } catch {
    return jsonError(400, "bad_request", "JSON body required");
  }

  const client = createLiveNeteaseClient();
  const ids = await collectSongIds(body, { cookie, client });
  if (!Array.isArray(ids)) {
    return jsonError(400, "bad_request", ids.error);
  }

  const results = [];
  for (const songId of ids) {
    results.push(await cacheSongFromCdn(songId, cookie, client));
  }
  const saved = results.filter((row) => row.ok).length;
  return NextResponse.json({
    ok: saved > 0,
    saved,
    failed: results.length - saved,
    results,
  });
}

export async function DELETE(request: Request) {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  let body: { id?: unknown; playlistId?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; playlistId?: unknown };
  } catch {
    return jsonError(400, "bad_request", "JSON body required");
  }

  const ids = await collectSongIds(body);
  if (!Array.isArray(ids)) {
    return jsonError(400, "bad_request", ids.error);
  }

  const results = [];
  for (const songId of ids) {
    results.push({ songId, ...(await uncacheSong(songId)) });
  }
  return NextResponse.json({ ok: true, removed: results.length, results });
}
