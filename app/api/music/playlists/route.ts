import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

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
