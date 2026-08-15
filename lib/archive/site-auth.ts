import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  capabilitiesFrom,
  principalFromCookieValue,
  type SiteCapabilities,
  type SitePrincipal,
} from "./site-principal";
import { OWNER_COOKIE_NAME } from "./owner-session";

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
