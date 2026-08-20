import { cookies } from "next/headers";
import { ArchiveTerminal } from "@/components/archive-terminal";
import { getArchiveSnapshotFor } from "@/lib/archive/content";
import { OWNER_COOKIE_NAME } from "@/lib/archive/owner-session";
import {
  capabilitiesFrom,
  principalFromCookieValue,
} from "@/lib/archive/site-principal";
import { grantFromSitePrincipal } from "@/lib/archive/site-auth";
import { listLocalAudioSongIds } from "@/lib/music/local-audio-store";
import { assemblePlaylistCatalog } from "@/lib/music/playlist-project";
import { listPlaylistIndexes } from "@/lib/music/playlist-store";

export default async function Home() {
  const jar = await cookies();
  const principal = principalFromCookieValue(jar.get(OWNER_COOKIE_NAME)?.value, {
    sessionSecret: process.env.ARCHIVE_SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
  const grant = grantFromSitePrincipal(principal);
  const [snapshot, playlists, localIds] = await Promise.all([
    getArchiveSnapshotFor(grant),
    listPlaylistIndexes(),
    listLocalAudioSongIds(),
  ]);
  const catalog = assemblePlaylistCatalog(
    playlists,
    localIds,
    !capabilitiesFrom(principal).musicBff,
  );

  return (
    <ArchiveTerminal
      snapshot={snapshot}
      playlists={catalog}
      initialPrincipal={principal}
    />
  );
}
