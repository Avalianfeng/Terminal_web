#!/usr/bin/env node
/**
 * 一次性迁移：legacy 全量 yaml → content 策展 + data 曲目（ADR 0014 方案 B）。
 * 用法：node scripts/migrate-playlist-split.mjs
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  indexToCuration,
  indexToData,
  parsePlaylistIndex,
  serializePlaylistCuration,
  serializePlaylistData,
} from "../lib/music/playlist-yaml.ts";

const contentRoot = path.join(process.cwd(), "content", "music", "playlists");
const dataRoot = path.join(process.cwd(), "data", "music", "playlists");

async function main() {
  await mkdir(dataRoot, { recursive: true });
  const entries = await readdir(contentRoot, { withFileTypes: true });
  let migrated = 0;

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".yaml") ||
      entry.name.startsWith("_")
    ) {
      continue;
    }
    const filePath = path.join(contentRoot, entry.name);
    const raw = await readFile(filePath, "utf8");
    const index = parsePlaylistIndex(raw);
    const id = index.neteasePlaylistId;

    await writeFile(
      filePath,
      serializePlaylistCuration(indexToCuration(index)),
      "utf8",
    );
    await writeFile(
      path.join(dataRoot, `${id}.yaml`),
      serializePlaylistData(indexToData(index)),
      "utf8",
    );
    migrated += 1;
    console.log(`migrated ${entry.name} → slim content + data/${id}.yaml`);
  }

  console.log(`done: ${migrated} playlist(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
