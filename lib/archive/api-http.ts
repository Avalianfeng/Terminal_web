/**
 * HTTP adapter — JSON envelopes and CORS for /api/v1 routes.
 * No Item domain logic or filesystem I/O (see discovery.ts, read-adapter.ts).
 */

import { NextResponse } from "next/server";
import { allowedWriteOrigin } from "./write-cors";

export const API_VERSION = 1 as const;

export type ApiErrorCode =
  | "not_found"
  | "bad_request"
  | "method_not_allowed"
  | "unauthorized"
  | "forbidden"
  | "conflict";

type CorsMode = "read" | "write";

function corsHeaders(
  generatedAt?: string,
  cors?: { mode?: CorsMode; request?: Request },
): HeadersInit {
  if (cors?.mode === "write") {
    const origin = allowedWriteOrigin({
      origin: cors.request?.headers.get("origin") ?? null,
      requestUrl: cors.request?.url,
      configuredOrigin: process.env.ARCHIVE_PUBLIC_ORIGIN,
      nodeEnv: process.env.NODE_ENV,
    });
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match",
      Vary: "Origin",
    };
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    if (generatedAt) headers["X-Archive-Generated-At"] = generatedAt;
    return headers;
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match",
  };
  if (generatedAt) {
    headers["X-Archive-Generated-At"] = generatedAt;
  }
  return headers;
}

export function jsonOk<T>(
  data: T,
  generatedAt: string,
  init?: { status?: number; request?: Request; cors?: CorsMode },
) {
  return NextResponse.json(
    {
      ok: true as const,
      apiVersion: API_VERSION,
      generatedAt,
      data,
    },
    {
      status: init?.status ?? 200,
      headers: corsHeaders(generatedAt, {
        mode: init?.cors ?? "read",
        request: init?.request,
      }),
    },
  );
}

export function jsonError(
  error: ApiErrorCode,
  message: string,
  status: number,
  extraHeaders?: HeadersInit,
  cors?: { mode?: CorsMode; request?: Request },
) {
  return NextResponse.json(
    {
      ok: false as const,
      apiVersion: API_VERSION,
      error,
      message,
    },
    {
      status,
      headers: {
        ...corsHeaders(undefined, cors),
        ...extraHeaders,
      },
    },
  );
}

export function methodNotAllowed(allow = "GET") {
  return jsonError(
    "method_not_allowed",
    `Method not allowed here. Allowed: ${allow}.`,
    405,
    { Allow: allow },
  );
}

export function optionsCors() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export function optionsCorsWrite(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(undefined, { mode: "write", request }),
  });
}
