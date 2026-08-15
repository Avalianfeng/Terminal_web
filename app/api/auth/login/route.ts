import { NextResponse } from "next/server";
import {
  clearLoginFailures,
  clientIpFromHeaders,
  isLoginBlocked,
  recordLoginFailure,
  verifyOwnerPassword,
  type LoginThrottleState,
} from "@/lib/archive/owner-password";
import {
  OWNER_COOKIE_NAME,
  ownerCookieSetOptions,
  resolveSessionSecret,
  signOwnerSession,
} from "@/lib/archive/owner-session";
import { capabilitiesFrom, resolveSitePrincipal } from "@/lib/archive/site-principal";

export const runtime = "nodejs";

const loginFailures = new Map<string, LoginThrottleState>();

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const now = Date.now();
  if (isLoginBlocked(loginFailures, ip, now)) {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "尝试过多，请稍后再试" },
      { status: 429 },
    );
  }

  const stored = process.env.ARCHIVE_OWNER_PASSWORD_HASH?.trim();
  const secret = resolveSessionSecret(process.env.ARCHIVE_SESSION_SECRET);
  if (!stored || !secret) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "口令未配置" },
      { status: 401 },
    );
  }

  let password = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "password" in body) {
      password = String((body as { password?: unknown }).password ?? "");
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "JSON body required" },
      { status: 400 },
    );
  }

  if (!verifyOwnerPassword(password, stored)) {
    recordLoginFailure(loginFailures, ip, now);
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "口令错误" },
      { status: 401 },
    );
  }

  clearLoginFailures(loginFailures, ip);
  const token = signOwnerSession(now, secret);
  const principal = resolveSitePrincipal({ sessionValid: true, nodeEnv: process.env.NODE_ENV });
  const response = NextResponse.json({
    ok: true,
    role: principal.role,
    via: "session",
    capabilities: capabilitiesFrom(principal),
  });
  response.cookies.set(
    OWNER_COOKIE_NAME,
    token,
    ownerCookieSetOptions(process.env.NODE_ENV === "production"),
  );
  return response;
}
