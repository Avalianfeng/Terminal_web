import { NextResponse } from "next/server";
import { isMusicBffEnabled } from "@/lib/music/bff-gate";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export const runtime = "nodejs";

export async function GET() {
  if (!isMusicBffEnabled()) {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "音乐 BFF 仅 local-dev 可用" },
      { status: 403 },
    );
  }

  const playlists = await listPlaylistIndexes();
  return NextResponse.json({
    ok: true,
    playlists: playlists.map((playlist) => ({
      id: playlist.neteasePlaylistId,
      name: playlist.name,
      trackCount: playlist.tracks.length,
    })),
  });
}
