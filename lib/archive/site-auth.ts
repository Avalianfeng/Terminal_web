import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  capabilitiesFrom,
  principalFromCookieValue,
  type SiteCapabilities,
  type SitePrincipal,
} from "./site-principal";
import { OWNER_COOKIE_NAME } from "./owner-session";
import { validateToken } from "./token";
import {
  grantFor,
  type ArchiveActor,
  type PrincipalGrant,
} from "./permission";

export async function resolveRequestPrincipal(): Promise<SitePrincipal> {
  const jar = await cookies();
  return principalFromCookieValue(jar.get(OWNER_COOKIE_NAME)?.value, {
    sessionSecret: process.env.ARCHIVE_SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

export async function resolveRequestCapabilities(): Promise<{
  principal: SitePrincipal;
  capabilities: SiteCapabilities;
}> {
  const principal = await resolveRequestPrincipal();
  return { principal, capabilities: capabilitiesFrom(principal) };
}

export async function requireOwnerPrincipal(
  message = "需要主人身份",
): Promise<NextResponse | null> {
  const { capabilities } = await resolveRequestCapabilities();
  if (!capabilities.musicBff) {
    return NextResponse.json(
      { ok: false, error: "forbidden", message },
      { status: 403 },
    );
  }
  return null;
}

export async function requireUiWrite(): Promise<boolean> {
  const { capabilities } = await resolveRequestCapabilities();
  return capabilities.uiWrite;
}

export function actorFromSitePrincipal(principal: SitePrincipal): ArchiveActor {
  return principal.role === "owner" ? "owner" : "visitor";
}

export function grantFromSitePrincipal(
  principal: SitePrincipal,
): PrincipalGrant {
  return grantFor(actorFromSitePrincipal(principal));
}

/**
 * HTTP → Grant (ADR 0019).
 * Bearer (any valid token) → owner-agent: read ALL; write still gated by scope elsewhere.
 * Else cookie / local-dev → site principal grant.
 * Else visitor.
 */
export function resolveApiGrant(request: Request): PrincipalGrant {
  const authorization = request.headers.get("authorization");
  const token = authorization?.trim().match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const result = validateToken(token);
    if (result.valid) {
      return grantFor("owner-agent");
    }
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(
      `(?:^|;\\s*)${OWNER_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  const raw = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  const principal = principalFromCookieValue(raw, {
    sessionSecret: process.env.ARCHIVE_SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
  return grantFromSitePrincipal(principal);
}

/** Page / Server Action path: cookie jar → grant. */
export async function resolvePageGrant(): Promise<PrincipalGrant> {
  const principal = await resolveRequestPrincipal();
  return grantFromSitePrincipal(principal);
}
