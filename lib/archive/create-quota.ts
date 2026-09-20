/**
 * Low-privilege create quota (ADR 0022): password session only.
 * ~10 creates / 5 minutes per IP (in-process, same caveats as login throttle).
 */

export const CREATE_WINDOW_MS = 5 * 60 * 1000;
export const CREATE_MAX_PER_WINDOW = 10;

export type CreateQuotaState = {
  count: number;
  windowStart: number;
};

const stores = new Map<string, CreateQuotaState>();

export function notePasswordCreate(
  ip: string,
  nowMs = Date.now(),
): { allowed: boolean; remaining: number } {
  const prev = stores.get(ip);
  if (!prev || nowMs - prev.windowStart >= CREATE_WINDOW_MS) {
    stores.set(ip, { count: 1, windowStart: nowMs });
    return { allowed: true, remaining: CREATE_MAX_PER_WINDOW - 1 };
  }
  if (prev.count >= CREATE_MAX_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }
  prev.count += 1;
  return { allowed: true, remaining: CREATE_MAX_PER_WINDOW - prev.count };
}

export function isPasswordCreateBlocked(
  ip: string,
  nowMs = Date.now(),
): boolean {
  const prev = stores.get(ip);
  if (!prev) return false;
  if (nowMs - prev.windowStart >= CREATE_WINDOW_MS) return false;
  return prev.count >= CREATE_MAX_PER_WINDOW;
}
