import { NextResponse } from "next/server";
import {
  audioContentType,
  audioProxyHeaders,
  isAllowedAudioProxyUrl,
} from "@/lib/music/audio-proxy";
import { isMusicBffEnabled } from "@/lib/music/bff-gate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isMusicBffEnabled()) {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "音乐 BFF 仅 local-dev 可用" },
      { status: 403 },
    );
  }

  const audioUrl = new URL(request.url).searchParams.get("url");
  if (!audioUrl || !isAllowedAudioProxyUrl(audioUrl)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "非法或不支持的音频 URL" },
      { status: 400 },
    );
  }

  const range = request.headers.get("range");
  const upstream = await fetch(audioUrl, {
    headers: audioProxyHeaders(range),
  });

  const headers = new Headers();
  headers.set("Content-Type", audioContentType(audioUrl, upstream.headers.get("content-type")));
  headers.set("Accept-Ranges", "bytes");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
