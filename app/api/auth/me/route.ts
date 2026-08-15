import { NextResponse } from "next/server";
import { resolveRequestCapabilities } from "@/lib/archive/site-auth";

export const runtime = "nodejs";

export async function GET() {
  const { principal, capabilities } = await resolveRequestCapabilities();
  return NextResponse.json({
    ok: true,
    role: principal.role,
    via: principal.via,
    capabilities,
  });
}
