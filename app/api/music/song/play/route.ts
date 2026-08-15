import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { resolveLocalAudio } from "@/lib/music/local-audio-store";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import { resolveSongIdParam } from "@/lib/music/netease-url";
import { songProxyPath } from "@/lib/music/song-url";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function GET(request: Request) {
  const id = resolveSongIdParam(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return jsonError(400, "bad_request", "需要 id（歌曲数字 id 或 song URL）");
  }

  const local = await resolveLocalAudio(id);
  if (local) {
    return NextResponse.json({
      ok: true,
      playable: true,
      source: "local",
      id,
      proxyUrl: `/api/music/local?id=${encodeURIComponent(id)}`,
    });
  }

  const denied = await requireOwnerPrincipal();
  if (denied) {
    return jsonError(404, "not_found", "没有本地音频（访客仅可播放已下载曲目）");
  }

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  const play = await createLiveNeteaseClient().songUrl(id, cookie);
  if (!play.playable || !play.url) {
    return NextResponse.json(
      {
        ok: false,
        error: "unplayable",
        message: play.message ?? "无法获取播放地址",
        playable: false,
        trial: play.trial,
        source: "stream",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    playable: true,
    trial: play.trial,
    source: "stream",
    id,
    br: play.br,
    level: play.level,
    proxyUrl: songProxyPath(play.url),
  });
}
