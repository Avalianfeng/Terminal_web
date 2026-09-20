import type { SitePrincipal } from "./site-principal";
import { grantFor, type ArchiveActor, type PrincipalGrant } from "./permission";

export function actorFromSitePrincipal(principal: SitePrincipal): ArchiveActor {
  if (principal.role !== "owner") return "visitor";
  if (principal.via === "implicit-local-dev" || principal.deviceStepUp) {
    return "owner";
  }
  if (principal.via === "session") return "owner-password";
  return "visitor";
}

export function grantFromSitePrincipal(
  principal: SitePrincipal,
): PrincipalGrant {
  return grantFor(actorFromSitePrincipal(principal));
}
