import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isMusicBffEnabled } from "@/lib/music/bff-gate";
import { cookieHasMusicU, readNeteaseCookie } from "@/lib/music/cookie-store";
import { createLiveNeteaseClient } from "@/lib/music/netease-client";
import {
  PlaylistImportError,
  buildPlaylistIndex,
} from "@/lib/music/playlist-import";
import { serializePlaylistIndex } from "@/lib/music/playlist-yaml";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(request: Request) {
  if (!isMusicBffEnabled()) {
    return jsonError(403, "forbidden", "音乐 BFF 仅 local-dev 可用");
  }

  const cookie = await readNeteaseCookie();
  if (!cookieHasMusicU(cookie)) {
    return jsonError(401, "unauthorized", "尚未登录：先 POST /api/music/login/cookie");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "bad_request", "JSON body required");
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const index = await buildPlaylistIndex(
      {
        url: typeof payload.url === "string" ? payload.url : undefined,
        playlistId:
          typeof payload.playlistId === "string" ? payload.playlistId : undefined,
        cookie,
      },
      createLiveNeteaseClient(),
    );

    const dir = path.join(process.cwd(), "content", "music", "playlists");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${index.slug}.yaml`);
    await writeFile(filePath, serializePlaylistIndex(index), "utf8");

    return NextResponse.json({
      ok: true,
      slug: index.slug,
      name: index.name,
      neteasePlaylistId: index.neteasePlaylistId,
      trackCount: index.tracks.length,
      path: `content/music/playlists/${index.slug}.yaml`,
    });
  } catch (error) {
    if (error instanceof PlaylistImportError) {
      const status =
        error.code === "unauthorized" ? 401 : error.code === "bad_request" ? 400 : 502;
      return jsonError(status, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "import failed";
    return jsonError(502, "upstream", message);
  }
}
