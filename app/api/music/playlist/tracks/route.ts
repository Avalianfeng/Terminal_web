import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import { buildPlaylistIndex } from "@/lib/music/playlist-import";
import {
  listPlaylistIndexes,
  writePlaylistData,
  writePlaylistCuration,
} from "@/lib/music/playlist-store";
import { indexToCuration, indexToData } from "@/lib/music/playlist-yaml";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/** 按需载入歌单曲目（stub → 全量 yaml 缓存）。 */
export async function GET(request: Request) {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  const playlistId = new URL(request.url).searchParams.get("playlistId")?.trim();
  if (!playlistId) {
    return jsonError(400, "bad_request", "缺少 playlistId");
  }

  const playlists = await listPlaylistIndexes();
  const existing = playlists.find(
    (item) => item.neteasePlaylistId === playlistId || item.slug === playlistId,
  );
  if (existing && existing.tracks.length > 0) {
    return NextResponse.json({
      ok: true,
      playlistId: existing.neteasePlaylistId,
      name: existing.name,
      trackCount: existing.tracks.length,
      tracks: existing.tracks,
      cached: true,
    });
  }

  try {
    const index = await buildPlaylistIndex(
      { playlistId, cookie },
      createLiveNeteaseClient(),
    );
    const curationExists = playlists.some(
      (item) => item.neteasePlaylistId === index.neteasePlaylistId,
    );
    void Promise.all([
      curationExists
        ? Promise.resolve()
        : writePlaylistCuration(indexToCuration(index)),
      writePlaylistData(index.neteasePlaylistId, indexToData(index)),
    ]).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      playlistId: index.neteasePlaylistId,
      name: index.name,
      trackCount: index.tracks.length,
      tracks: index.tracks,
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "load tracks failed";
    return jsonError(502, "upstream", message);
  }
}
