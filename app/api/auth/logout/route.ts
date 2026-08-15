import { NextResponse } from "next/server";
import { OWNER_COOKIE_NAME } from "@/lib/archive/owner-session";
import { capabilitiesFrom, resolveSitePrincipal } from "@/lib/archive/site-principal";

export const runtime = "nodejs";

export async function POST() {
  const principal = resolveSitePrincipal({
    sessionValid: false,
    nodeEnv: process.env.NODE_ENV,
  });
  const response = NextResponse.json({
    ok: true,
    role: principal.role,
    via: principal.via,
    capabilities: capabilitiesFrom(principal),
  });
  response.cookies.set(OWNER_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
