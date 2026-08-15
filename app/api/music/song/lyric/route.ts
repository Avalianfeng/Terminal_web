import { NextResponse } from "next/server";
import { parseLrc } from "@/lib/music/lyric";
import { readLocalLyric } from "@/lib/music/local-audio-store";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import { resolveSongIdParam } from "@/lib/music/netease-url";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function GET(request: Request) {
  const id = resolveSongIdParam(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return jsonError(400, "bad_request", "需要 id（歌曲数字 id 或 song URL）");
  }

  const local = await readLocalLyric(id);
  if (local) {
    const lines = parseLrc(local);
    return NextResponse.json({
      ok: true,
      id,
      source: "local",
      lines,
      empty: lines.length === 0,
    });
  }

  const denied = await requireOwnerPrincipal();
  if (denied) {
    return NextResponse.json({
      ok: true,
      id,
      source: "none",
      lines: [],
      empty: true,
    });
  }

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  try {
    const raw = await createLiveNeteaseClient().songLyric(id, cookie);
    const lines = parseLrc(raw);
    return NextResponse.json({
      ok: true,
      id,
      source: "stream",
      lines,
      empty: lines.length === 0,
    });
  } catch (error) {
    return jsonError(
      502,
      "upstream",
      error instanceof Error ? error.message : "lyric 失败",
    );
  }
}
