/**
 * HTTP adapter — JSON envelopes and CORS for /api/v1 routes.
 * No Item domain logic or filesystem I/O (see discovery.ts, read-adapter.ts).
 */

import { NextResponse } from "next/server";

export const API_VERSION = 1 as const;

export type ApiErrorCode =
  | "not_found"
  | "bad_request"
  | "method_not_allowed"
  | "unauthorized"
  | "forbidden"
  | "conflict";

function corsHeaders(generatedAt?: string): HeadersInit {
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
  init?: { status?: number },
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
      headers: corsHeaders(generatedAt),
    },
  );
}

export function jsonError(
  error: ApiErrorCode,
  message: string,
  status: number,
  extraHeaders?: HeadersInit,
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
        ...corsHeaders(),
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
