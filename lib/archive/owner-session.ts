import { createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_COOKIE_NAME = "archive_owner";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCAL_DEV_SESSION_SECRET = "local-dev-session-secret";

export type OwnerSessionPayload = {
  readonly v: 1;
  readonly iat: number;
  readonly exp: number;
};

function base64UrlEncode(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf.toString("base64url");
}

function base64UrlDecodeToString(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function resolveSessionSecret(
  envSecret: string | undefined,
  nodeEnv?: string,
): string | null {
  if (envSecret && envSecret.trim()) return envSecret.trim();
  if ((nodeEnv ?? process.env.NODE_ENV) !== "production") {
    return LOCAL_DEV_SESSION_SECRET;
  }
  return null;
}

export function signOwnerSession(
  nowMs: number,
  secret: string,
  ttlMs = SESSION_TTL_MS,
): string {
  const payload: OwnerSessionPayload = {
    v: 1,
    iat: nowMs,
    exp: nowMs + ttlMs,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`v1.${encoded}`).digest();
  return `v1.${encoded}.${base64UrlEncode(sig)}`;
}

export function verifyOwnerSession(
  token: string,
  secret: string,
  nowMs: number,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const encoded = parts[1]!;
  const givenSig = parts[2]!;
  const expected = createHmac("sha256", secret)
    .update(`v1.${encoded}`)
    .digest();
  let given: Buffer;
  try {
    given = Buffer.from(givenSig, "base64url");
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  if (!timingSafeEqual(given, expected)) return false;

  const json = base64UrlDecodeToString(encoded);
  if (!json) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return false;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as OwnerSessionPayload).v !== 1 ||
    typeof (payload as OwnerSessionPayload).exp !== "number"
  ) {
    return false;
  }
  return (payload as OwnerSessionPayload).exp > nowMs;
}

export function sessionValidFromCookie(
  raw: string | undefined,
  secret: string | null,
  nowMs: number,
): boolean {
  if (!raw || !secret) return false;
  return verifyOwnerSession(raw, secret, nowMs);
}

export function ownerCookieSetOptions(secure: boolean): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure,
  };
}
