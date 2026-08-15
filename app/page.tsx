import { cookies } from "next/headers";
import { ArchiveTerminal } from "@/components/archive-terminal";
import { getArchiveSnapshot } from "@/lib/archive/content";
import { OWNER_COOKIE_NAME } from "@/lib/archive/owner-session";
import { principalFromCookieValue } from "@/lib/archive/site-principal";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export default async function Home() {
  const jar = await cookies();
  const principal = principalFromCookieValue(jar.get(OWNER_COOKIE_NAME)?.value, {
    sessionSecret: process.env.ARCHIVE_SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
  const [snapshot, playlists] = await Promise.all([
    getArchiveSnapshot(),
    listPlaylistIndexes(),
  ]);

  return (
    <ArchiveTerminal
      snapshot={snapshot}
      playlists={playlists}
      initialPrincipal={principal}
    />
  );
}
