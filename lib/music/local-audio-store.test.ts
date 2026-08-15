import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  extFromCdnUrl,
  isSongId,
  listLocalAudioSongIds,
  parseLocalAudioExt,
  readLocalLyric,
  removeLocalAudio,
  resolveLocalAudio,
  writeLocalAudio,
  writeLocalLyric,
} from "./local-audio-store.ts";

describe("song id / ext", () => {
  it("accepts numeric ids only", () => {
    assert.equal(isSongId("357312"), true);
    assert.equal(isSongId("../etc"), false);
    assert.equal(isSongId("357312.mp3"), false);
  });

  it("parses allowed extensions and CDN urls", () => {
    assert.equal(parseLocalAudioExt("MP3"), "mp3");
    assert.equal(parseLocalAudioExt("wav"), null);
    assert.equal(
      extFromCdnUrl("https://m801.music.126.net/2026/foo.flac"),
      "flac",
    );
    assert.equal(
      extFromCdnUrl("https://m801.music.126.net/a.m4a?token=1"),
      "m4a",
    );
  });
});

describe("local audio store", () => {
  it("resolves, prefers mp3, and rejects traversal-like ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "music-cache-"));
    try {
      const audioDir = path.join(root, "audio");
      await mkdir(audioDir, { recursive: true });
      await writeFile(path.join(audioDir, "1.flac"), Buffer.from("flac"));
      await writeFile(path.join(audioDir, "1.mp3"), Buffer.from("mp3"));
      await writeFile(path.join(audioDir, "..secret.mp3"), Buffer.from("no"));

      const found = await resolveLocalAudio("1", root);
      assert.equal(found?.ext, "mp3");
      assert.equal(found?.contentType, "audio/mpeg");

      assert.equal(await resolveLocalAudio("../1", root), null);
      const ids = await listLocalAudioSongIds(root);
      assert.equal(ids.has("1"), true);

      const written = await writeLocalAudio("2", "m4a", Buffer.from("aa"), root);
      assert.equal(written.ext, "m4a");
      assert.equal((await resolveLocalAudio("2", root))?.ext, "m4a");

      await writeLocalAudio("2", "mp3", Buffer.from("bb"), root);
      assert.equal((await resolveLocalAudio("2", root))?.ext, "mp3");

      assert.equal(await removeLocalAudio("2", root), true);
      assert.equal(await resolveLocalAudio("2", root), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads and writes lyrics beside audio", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "music-lrc-"));
    try {
      await writeLocalLyric("9", "[00:00.00]hello", root);
      const raw = await readLocalLyric("9", root);
      assert.ok(raw?.includes("hello"));
      assert.equal(await readLocalLyric("8", root), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
