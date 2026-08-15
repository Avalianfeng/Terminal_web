import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { isSongId, resolveLocalAudio } from "@/lib/music/local-audio-store";

export const runtime = "nodejs";

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const startRaw = match[1];
  const endRaw = match[2];
  let start = startRaw ? Number(startRaw) : 0;
  let end = endRaw ? Number(endRaw) : size - 1;
  if (!startRaw && endRaw) {
    const suffix = Number(endRaw);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }
  return { start: Math.max(0, start), end: Math.min(size - 1, end) };
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!isSongId(id)) {
    return jsonError(400, "bad_request", "需要数字 song id");
  }

  const file = await resolveLocalAudio(id);
  if (!file) {
    return jsonError(404, "not_found", "没有本地音频文件");
  }

  const info = await stat(file.absolutePath);
  const range = parseRange(request.headers.get("range"), info.size);

  const headers = new Headers();
  headers.set("Content-Type", file.contentType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=3600");

  if (!range) {
    headers.set("Content-Length", String(info.size));
    const stream = createReadStream(file.absolutePath);
    return new NextResponse(
      Readable.toWeb(stream) as unknown as ReadableStream,
      {
        status: 200,
        headers,
      },
    );
  }

  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
  headers.set("Content-Length", String(range.end - range.start + 1));
  const stream = createReadStream(file.absolutePath, {
    start: range.start,
    end: range.end,
  });
  return new NextResponse(
    Readable.toWeb(stream) as unknown as ReadableStream,
    {
      status: 206,
      headers,
    },
  );
}
