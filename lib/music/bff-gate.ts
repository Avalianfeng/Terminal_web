import { requireOwnerPrincipal } from "@/lib/archive/site-auth";

/** @deprecated 用 requireOwnerPrincipal；保留别名以免旧 import 断裂。 */
export { requireOwnerPrincipal };

export async function isMusicBffEnabled(): Promise<boolean> {
  const denied = await requireOwnerPrincipal();
  return denied === null;
}
