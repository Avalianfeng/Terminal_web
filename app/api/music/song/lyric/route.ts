import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { parseLrc } from "@/lib/music/lyric";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import { parseNeteaseSongId } from "@/lib/music/netease-url";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

function resolveSongId(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return parseNeteaseSongId(trimmed);
}

export async function GET(request: Request) {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  const id = resolveSongId(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return jsonError(400, "bad_request", "需要 id（歌曲数字 id 或 song URL）");
  }

  try {
    const raw = await createLiveNeteaseClient().songLyric(id, cookie);
    const lines = parseLrc(raw);
    return NextResponse.json({
      ok: true,
      id,
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
