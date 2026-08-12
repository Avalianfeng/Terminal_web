import { NextResponse } from "next/server";
import { isMusicBffEnabled } from "@/lib/music/bff-gate";
import { cookiePresence, readNeteaseCookie } from "@/lib/music/cookie-store";

export const runtime = "nodejs";

export async function GET() {
  if (!isMusicBffEnabled()) {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "音乐 BFF 仅 local-dev 可用" },
      { status: 403 },
    );
  }

  const cookie = await readNeteaseCookie();
  return NextResponse.json({
    ok: true,
    ...cookiePresence(cookie),
  });
}
