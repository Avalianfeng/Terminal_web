import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import { syncPlaylistCatalog } from "@/lib/music/playlist-sync";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/** 从网易账号同步自建歌单目录（stub；保留已全量 import 的 tracks）。 */
export async function POST() {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  try {
    const result = await syncPlaylistCatalog(cookie, createLiveNeteaseClient());
    const playlists = await listPlaylistIndexes();
    return NextResponse.json({
      ok: true,
      ...result,
      playlistCount: playlists.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync failed";
    return jsonError(502, "upstream", message);
  }
}
