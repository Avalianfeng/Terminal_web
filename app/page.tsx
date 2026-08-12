import { ArchiveTerminal } from "@/components/archive-terminal";
import { getArchiveSnapshot } from "@/lib/archive/content";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export default async function Home() {
  const [snapshot, playlists] = await Promise.all([
    getArchiveSnapshot(),
    listPlaylistIndexes(),
  ]);

  return <ArchiveTerminal snapshot={snapshot} playlists={playlists} />;
}
