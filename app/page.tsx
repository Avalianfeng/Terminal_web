import { ArchiveTerminal } from "@/components/archive-terminal";
import { getArchiveSnapshot } from "@/lib/archive/content";

export default async function Home() {
  const snapshot = await getArchiveSnapshot();

  return <ArchiveTerminal snapshot={snapshot} />;
}
