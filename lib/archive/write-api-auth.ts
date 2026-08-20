/**
 * HTTP 写 API 鉴权与错误响应（items / directories 共用）。
 */
import { jsonError } from "./api-http";
import { validateToken } from "./token";
import type { WriteError } from "./content-write";
import { can, grantFor, type ArchiveActionId } from "./permission";
import type { DocumentZone } from "./document-ref";

export function requireWriteScope(
  authorization: string | null,
  target: string,
):
  | { authorized: true }
  | { authorized: false; error: "unauthorized" | "forbidden" } {
  const token = authorization?.trim().match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { authorized: false, error: "unauthorized" };

  const result = validateToken(token, target);
  if (!result.valid) {
    return {
      authorized: false,
      error: result.scope !== undefined ? "forbidden" : "unauthorized",
    };
  }
  return { authorized: true };
}

/**
 * Bearer scope + permission.can(action, zone)（ADR 0019/0020 硬接）。
 * 当前有效 token → owner-agent（write:true）；can 为未来窄 grant 留 choke point。
 */
export function requireWritePermission(
  authorization: string | null,
  target: string,
  action: ArchiveActionId,
  zone: DocumentZone,
):
  | { authorized: true }
  | { authorized: false; error: "unauthorized" | "forbidden" } {
  const scope = requireWriteScope(authorization, target);
  if (!scope.authorized) return scope;
  if (!can(grantFor("owner-agent"), action, zone)) {
    return { authorized: false, error: "forbidden" };
  }
  return { authorized: true };
}

export function writeErrorResponse(error: WriteError, request: Request) {
  const status =
    error.code === "bad_request"
      ? 400
      : error.code === "not_found"
        ? 404
        : 409;
  return jsonError(error.code, error.message, status, undefined, {
    mode: "write",
    request,
  });
}

export function writeAuthFailure(
  error: "unauthorized" | "forbidden",
  request: Request,
) {
  if (error === "unauthorized") {
    return jsonError(
      "unauthorized",
      "Missing or invalid token. Use Authorization: Bearer <token>.",
      401,
      undefined,
      { mode: "write", request },
    );
  }
  return jsonError(
    "forbidden",
    "Token does not cover this path (scope insufficient).",
    403,
    undefined,
    { mode: "write", request },
  );
}
