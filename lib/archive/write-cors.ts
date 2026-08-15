import { isLocalDevPosture } from "./site-principal";

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * 写 API CORS：不使用 *。允许配置 Origin、同 host、以及 local-dev 的 localhost。
 */
export function allowedWriteOrigin(input: {
  origin: string | null;
  requestUrl?: string;
  configuredOrigin?: string;
  nodeEnv?: string;
}): string | null {
  const configured = input.configuredOrigin?.replace(/\/$/, "") || undefined;
  const origin = input.origin?.trim() || null;

  if (origin) {
    if (configured && origin === configured) return origin;
    if (isLocalDevPosture(input.nodeEnv) && isLocalhostOrigin(origin)) {
      return origin;
    }
    if (input.requestUrl) {
      try {
        const req = new URL(input.requestUrl);
        const from = new URL(origin);
        if (from.host === req.host) return origin;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  return configured ?? null;
}
