import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import { cookiePresence, readNeteaseCookie } from "@/lib/music/cookie-store";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  const cookie = await readNeteaseCookie();
  return NextResponse.json({
    ok: true,
    ...cookiePresence(cookie),
  });
}
