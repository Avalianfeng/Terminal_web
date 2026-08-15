import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt:N:r:p:salt:hash — 不用 `$`，避免 Next/.env 把 `$16384` 当变量展开。 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export type LoginThrottleState = {
  failures: number;
  windowStart: number;
};

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;

export function hashOwnerPassword(password: string, salt = randomBytes(SALT_LEN)): string {
  const key = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

function parseStoredHash(stored: string): string[] | null {
  const raw = stored.trim().replace(/^"(.*)"$/, "$1");
  const parts = raw.startsWith("scrypt:")
    ? raw.split(":")
    : raw.startsWith("scrypt$")
      ? raw.split("$")
      : null;
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return null;
  return parts;
}

export function verifyOwnerPassword(password: string, stored: string): boolean {
  const parts = parseStoredHash(stored);
  if (!parts) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64url");
    expected = Buffer.from(parts[5]!, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, { N, r, p });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function recordLoginFailure(
  store: Map<string, LoginThrottleState>,
  ip: string,
  nowMs: number,
  windowMs = LOGIN_WINDOW_MS,
  maxFailures = LOGIN_MAX_FAILURES,
): { blocked: boolean; failures: number } {
  const prev = store.get(ip);
  if (!prev || nowMs - prev.windowStart >= windowMs) {
    store.set(ip, { failures: 1, windowStart: nowMs });
    return { blocked: false, failures: 1 };
  }
  const failures = prev.failures + 1;
  store.set(ip, { failures, windowStart: prev.windowStart });
  return { blocked: failures > maxFailures, failures };
}

export function isLoginBlocked(
  store: Map<string, LoginThrottleState>,
  ip: string,
  nowMs: number,
  windowMs = LOGIN_WINDOW_MS,
  maxFailures = LOGIN_MAX_FAILURES,
): boolean {
  const prev = store.get(ip);
  if (!prev) return false;
  if (nowMs - prev.windowStart >= windowMs) return false;
  return prev.failures >= maxFailures;
}

export function clearLoginFailures(
  store: Map<string, LoginThrottleState>,
  ip: string,
): void {
  store.delete(ip);
}

export function clientIpFromHeaders(headers: {
  get(name: string): string | null;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "local";
}
