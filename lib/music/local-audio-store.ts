import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { audioContentType } from "./audio-proxy";

export const LOCAL_AUDIO_EXTS = ["mp3", "m4a", "ogg", "flac"] as const;
export type LocalAudioExt = (typeof LOCAL_AUDIO_EXTS)[number];

export type LocalAudioFile = {
  songId: string;
  ext: LocalAudioExt;
  absolutePath: string;
  contentType: string;
};

export function musicDataRoot(cwd = process.cwd()): string {
  return path.join(cwd, "data", "music");
}

export function localAudioDir(root = musicDataRoot()): string {
  return path.join(root, "audio");
}

export function localLyricDir(root = musicDataRoot()): string {
  return path.join(root, "lyric");
}

export function isSongId(value: string): boolean {
  return /^\d+$/.test(value);
}

export function parseLocalAudioExt(value: string): LocalAudioExt | null {
  const ext = value.trim().toLowerCase().replace(/^\./, "");
  return (LOCAL_AUDIO_EXTS as readonly string[]).includes(ext)
    ? (ext as LocalAudioExt)
    : null;
}

export function extFromCdnUrl(url: string): LocalAudioExt {
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = url.toLowerCase();
  }
  if (pathname.endsWith(".flac")) return "flac";
  if (pathname.endsWith(".m4a") || pathname.endsWith(".mp4")) return "m4a";
  if (pathname.endsWith(".ogg")) return "ogg";
  return "mp3";
}

function contentTypeForFile(filePath: string): string {
  return audioContentType(`https://example.music.126.net/${path.basename(filePath)}`, null);
}

export async function resolveLocalAudio(
  songId: string,
  root = musicDataRoot(),
): Promise<LocalAudioFile | null> {
  if (!isSongId(songId)) return null;
  const dir = localAudioDir(root);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const matches: LocalAudioFile[] = [];
  for (const name of entries) {
    const match = name.match(/^(\d+)\.([a-z0-9]+)$/i);
    if (!match || match[1] !== songId) continue;
    const ext = parseLocalAudioExt(match[2] ?? "");
    if (!ext) continue;
    const absolutePath = path.join(dir, name);
    matches.push({
      songId,
      ext,
      absolutePath,
      contentType: contentTypeForFile(absolutePath),
    });
  }
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) => LOCAL_AUDIO_EXTS.indexOf(a.ext) - LOCAL_AUDIO_EXTS.indexOf(b.ext),
  );
  return matches[0] ?? null;
}

export async function listLocalAudioSongIds(
  root = musicDataRoot(),
): Promise<Set<string>> {
  const dir = localAudioDir(root);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const ids = new Set<string>();
  for (const name of entries) {
    const match = name.match(/^(\d+)\.([a-z0-9]+)$/i);
    if (!match) continue;
    if (!parseLocalAudioExt(match[2] ?? "")) continue;
    ids.add(match[1]!);
  }
  return ids;
}

export async function writeLocalAudio(
  songId: string,
  ext: LocalAudioExt,
  bytes: Uint8Array,
  root = musicDataRoot(),
): Promise<LocalAudioFile> {
  if (!isSongId(songId)) {
    throw new Error(`非法 song id: ${songId}`);
  }
  const dir = localAudioDir(root);
  await mkdir(dir, { recursive: true });
  const existing = await resolveLocalAudio(songId, root);
  if (existing && existing.ext !== ext) {
    await unlink(existing.absolutePath).catch(() => undefined);
  }
  const absolutePath = path.join(dir, `${songId}.${ext}`);
  await writeFile(absolutePath, bytes);
  return {
    songId,
    ext,
    absolutePath,
    contentType: contentTypeForFile(absolutePath),
  };
}

export async function removeLocalAudio(
  songId: string,
  root = musicDataRoot(),
): Promise<boolean> {
  const existing = await resolveLocalAudio(songId, root);
  if (!existing) return false;
  await unlink(existing.absolutePath).catch(() => undefined);
  return true;
}

export function localLyricPath(songId: string, root = musicDataRoot()): string {
  return path.join(localLyricDir(root), `${songId}.lrc`);
}

export async function readLocalLyric(
  songId: string,
  root = musicDataRoot(),
): Promise<string | null> {
  if (!isSongId(songId)) return null;
  try {
    const raw = await readFile(localLyricPath(songId, root), "utf8");
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export async function writeLocalLyric(
  songId: string,
  raw: string,
  root = musicDataRoot(),
): Promise<void> {
  if (!isSongId(songId)) {
    throw new Error(`非法 song id: ${songId}`);
  }
  const dir = localLyricDir(root);
  await mkdir(dir, { recursive: true });
  await writeFile(localLyricPath(songId, root), raw.endsWith("\n") ? raw : `${raw}\n`, "utf8");
}

export async function removeLocalLyric(
  songId: string,
  root = musicDataRoot(),
): Promise<boolean> {
  try {
    await unlink(localLyricPath(songId, root));
    return true;
  } catch {
    return false;
  }
}
