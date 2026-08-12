import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** 仓根本机 Cookie 文件（gitignore；等同密钥，不进 Git）。 */
export const NETEASE_COOKIE_FILENAME = ".netease-cookie";

const COOKIE_ATTRIBUTE_NAMES = new Set([
  "path",
  "domain",
  "expires",
  "max-age",
  "samesite",
  "secure",
  "httponly",
]);

export function cookieFilePath(cwd = process.cwd()): string {
  return path.join(cwd, NETEASE_COOKIE_FILENAME);
}

export function parseCookiePairs(input: string): Record<string, string> {
  const picked = new Map<string, string>();
  for (const line of input.split(/\r?\n/)) {
    for (const part of line.split(";")) {
      const raw = part.trim();
      const idx = raw.indexOf("=");
      if (idx <= 0) continue;
      const key = raw.slice(0, idx).trim();
      const value = raw.slice(idx + 1).trim();
      if (!key || COOKIE_ATTRIBUTE_NAMES.has(key.toLowerCase())) continue;
      if (!value) continue;
      picked.set(key, value);
    }
  }
  return Object.fromEntries(picked);
}

export function normalizeCookieHeader(input: string): string {
  const pairs = parseCookiePairs(input);
  return Object.entries(pairs)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

export function cookieHasMusicU(cookie: string): boolean {
  return Boolean(parseCookiePairs(cookie).MUSIC_U);
}

export type CookiePresence = {
  hasCookie: boolean;
  loggedIn: boolean;
};

export function cookiePresence(cookie: string): CookiePresence {
  const trimmed = cookie.trim();
  const hasCookie = trimmed.length > 0;
  return {
    hasCookie,
    loggedIn: hasCookie && cookieHasMusicU(trimmed),
  };
}

export async function readNeteaseCookie(filePath = cookieFilePath()): Promise<string> {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    return "";
  }
}

export async function writeNeteaseCookie(
  cookie: string,
  filePath = cookieFilePath(),
): Promise<string> {
  const normalized = normalizeCookieHeader(cookie);
  if (!cookieHasMusicU(normalized)) {
    throw new Error("网易云 cookie 缺少 MUSIC_U");
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${normalized}\n`, "utf8");
  return normalized;
}

export async function clearNeteaseCookie(filePath = cookieFilePath()): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // already absent
  }
}
