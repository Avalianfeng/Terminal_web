import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { audioProxyHeaders } from "./audio-proxy";
import {
  extFromCdnUrl,
  localAudioDir,
  musicDataRoot,
  removeLocalAudio,
  removeLocalLyric,
  resolveLocalAudio,
  writeLocalLyric,
  type LocalAudioExt,
} from "./local-audio-store";
import type { NeteasePlaybackClient } from "./song-url";
import { patchTracksLocalCache } from "./playlist-store";

export type CacheSongResult =
  | { ok: true; songId: string; ext: LocalAudioExt; lyric: boolean }
  | { ok: false; songId: string; message: string };

export async function cacheSongFromCdn(
  songId: string,
  cookie: string,
  client: NeteasePlaybackClient,
  options?: { root?: string; now?: string },
): Promise<CacheSongResult> {
  const play = await client.songUrl(songId, cookie);
  if (!play.playable || !play.url) {
    return {
      ok: false,
      songId,
      message: play.message ?? "无法获取播放地址",
    };
  }

  const ext = extFromCdnUrl(play.url);
  const root = options?.root ?? musicDataRoot();
  const dir = localAudioDir(root);
  await mkdir(dir, { recursive: true });

  const existing = await resolveLocalAudio(songId, root);
  if (existing && existing.ext !== ext) {
    await unlink(existing.absolutePath).catch(() => undefined);
  }

  const dest = path.join(dir, `${songId}.${ext}`);
  const tmp = `${dest}.part`;
  try {
    const upstream = await fetch(play.url, { headers: audioProxyHeaders() });
    if (!upstream.ok || !upstream.body) {
      return { ok: false, songId, message: `下载失败 HTTP ${upstream.status}` };
    }

    await pipeline(
      Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream),
      createWriteStream(tmp),
    );
    await rename(tmp, dest);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    return {
      ok: false,
      songId,
      message: error instanceof Error ? error.message : "下载失败",
    };
  }

  let lyric = false;
  try {
    const raw = await client.songLyric(songId, cookie);
    if (raw.trim()) {
      await writeLocalLyric(songId, raw, root);
      lyric = true;
    }
  } catch {
    // 歌词失败不挡媒体
  }

  const now = options?.now ?? new Date().toISOString();
  await patchTracksLocalCache(songId, { localCachedAt: now, localExt: ext });
  return { ok: true, songId, ext, lyric };
}

export async function uncacheSong(
  songId: string,
  options?: { root?: string },
): Promise<{ audio: boolean; lyric: boolean }> {
  const root = options?.root ?? musicDataRoot();
  const audio = await removeLocalAudio(songId, root);
  const lyric = await removeLocalLyric(songId, root);
  await patchTracksLocalCache(songId, {});
  return { audio, lyric };
}
