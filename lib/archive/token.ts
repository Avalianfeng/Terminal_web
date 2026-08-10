import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * 写操作鉴权基础（C · 路 1）。
 * 设计：随机 token → 只存 SHA-256 哈希（环境变量），校验时 timing-safe 比较。
 * 范围模型：`*` 全权；`prefix/*` 覆盖该前缀下的目标；具体路径等于该路径。
 * HTTP 写端点（`items` PUT/DELETE）直接调用本模块；终端 `edit` 走 server actions，不经 token。
 */

export type TokenScope = string;

export type TokenValidation = {
  valid: boolean;
  /** 命中 token 声明的范围；invalid 时为 undefined。 */
  scope?: TokenScope;
};

const SCOPE_ALL = "*";

/** 环境变量：JSON 对象 `{ "<sha256-hex>": "<scope>" }`。 */
const ENV_TOKENS_KEY = "ARCHIVE_WRITE_TOKENS";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function loadTokens(): Record<string, string> {
  const raw = process.env[ENV_TOKENS_KEY];
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* 环境变量格式错误：视为无 token，校验失败 */
  }
  return {};
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 声明的 scope 是否覆盖目标（`*` 全权；`prefix/*` 覆盖前缀；其余精确匹配）。 */
export function scopeCovers(scope: TokenScope, target: string): boolean {
  if (scope === SCOPE_ALL) return true;
  if (scope.endsWith("/*")) {
    return target.startsWith(scope.slice(0, -1));
  }
  return scope === target;
}

/**
 * 校验 token。
 * @param requiredScope 可选：调用方要求的写入目标（如 `thoughts/foo`、`projects/*`），
 *   不传则只验证 token 是否存在且合法。
 */
export function validateToken(
  token: string,
  requiredScope?: string,
): TokenValidation {
  if (!token) return { valid: false };
  const digest = Buffer.from(hashToken(token), "hex");
  const tokens = loadTokens();

  let declared: string | undefined;
  for (const [hash, scope] of Object.entries(tokens)) {
    if (safeEqual(digest, Buffer.from(hash, "hex"))) {
      declared = scope;
      break;
    }
  }
  if (!declared) return { valid: false };
  if (requiredScope !== undefined && !scopeCovers(declared, requiredScope)) {
    return { valid: false, scope: declared };
  }
  return { valid: true, scope: declared };
}
