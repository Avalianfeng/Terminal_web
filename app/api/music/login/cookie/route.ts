import { NextResponse } from "next/server";
import { requireOwnerPrincipal } from "@/lib/music/bff-gate";
import {
  clearNeteaseCookie,
  cookiePresence,
  writeNeteaseCookie,
} from "@/lib/music/cookie-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "JSON body required" },
      { status: 400 },
    );
  }

  const cookie =
    body && typeof body === "object" && "cookie" in body
      ? String((body as { cookie?: unknown }).cookie ?? "")
      : "";

  try {
    await writeNeteaseCookie(cookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid cookie";
    return NextResponse.json(
      { ok: false, error: "bad_request", message, loggedIn: false, hasCookie: false },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    ...cookiePresence(cookie),
  });
}

export async function DELETE() {
  const denied = await requireOwnerPrincipal();
  if (denied) return denied;
  await clearNeteaseCookie();
  return NextResponse.json({
    ok: true,
    saved: false,
    loggedIn: false,
    hasCookie: false,
  });
}
