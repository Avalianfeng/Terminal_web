import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { PlaylistCatalogClient } from "./playlist-sync";
import { syncPlaylistCatalog } from "./playlist-sync";
import {
  parsePlaylistCuration,
  parsePlaylistData,
  serializePlaylistCuration,
  serializePlaylistData,
} from "./playlist-yaml";

describe("syncPlaylistCatalog", () => {
  it("writes data stubs and preserves full imports without touching content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "playlist-sync-"));
    const contentRoot = path.join(dir, "content", "music", "playlists");
    const dataRoot = path.join(dir, "data", "music", "playlists");
    const prev = process.cwd();
    process.chdir(dir);
    try {
      const fs = await import("node:fs/promises");
      await fs.mkdir(contentRoot, { recursive: true });
      await fs.mkdir(dataRoot, { recursive: true });

      await fs.writeFile(
        path.join(contentRoot, "7590034564.yaml"),
        serializePlaylistCuration({
          slug: "7590034564",
          neteasePlaylistId: "7590034564",
          name: "旧名",
          sourceUrl: "https://music.163.com/#/playlist?id=7590034564",
        }),
        "utf8",
      );
      await fs.writeFile(
        path.join(dataRoot, "7590034564.yaml"),
        serializePlaylistData({
          importedAt: "2026-08-12T00:00:00.000Z",
          tracks: [{ id: 1, name: "已有曲", artists: ["A"] }],
        }),
        "utf8",
      );

      const client: PlaylistCatalogClient = {
        async loginUserId() {
          return "123";
        },
        async userPlaylists() {
          return [
            { id: "7590034564", name: "如人饮水", trackCount: 122 },
            { id: "999", name: "新歌单", trackCount: 3 },
          ];
        },
      };

      const result = await syncPlaylistCatalog("cookie", client, {
        now: "2026-08-12T12:00:00.000Z",
        root: dataRoot,
      });
      assert.equal(result.synced, 2);
      assert.equal(result.created, 1);
      assert.equal(result.preserved, 1);

      const contentRaw = await readFile(
        path.join(contentRoot, "7590034564.yaml"),
        "utf8",
      );
      assert.equal(parsePlaylistCuration(contentRaw).name, "旧名");

      const kept = parsePlaylistData(
        await readFile(path.join(dataRoot, "7590034564.yaml"), "utf8"),
      );
      assert.equal(kept.tracks.length, 1);
      assert.equal(kept.tracks[0]?.name, "已有曲");
      assert.equal(kept.importedAt, "2026-08-12T12:00:00.000Z");

      const stub = parsePlaylistData(
        await readFile(path.join(dataRoot, "999.yaml"), "utf8"),
      );
      assert.equal(stub.name, "新歌单");
      assert.equal(stub.trackCount, 3);
      assert.equal(stub.tracks.length, 0);
      assert.equal(
        await fs
          .access(path.join(contentRoot, "999.yaml"))
          .then(() => true)
          .catch(() => false),
        false,
      );
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prunes orphan data stubs not in remote catalog", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "playlist-sync-"));
    const dataRoot = path.join(dir, "data", "music", "playlists");
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(dataRoot, { recursive: true }),
    );
    const orphanStub = serializePlaylistData({
      importedAt: "2026-08-12T00:00:00.000Z",
      trackCount: 5,
      tracks: [],
      slug: "777",
      neteasePlaylistId: "777",
      name: "已删歌单",
      sourceUrl: "https://music.163.com/#/playlist?id=777",
    });
    const fullData = serializePlaylistData({
      importedAt: "2026-08-12T00:00:00.000Z",
      tracks: [{ id: 1, name: "曲", artists: ["A"] }],
    });
    await import("node:fs/promises").then((fs) =>
      Promise.all([
        fs.writeFile(path.join(dataRoot, "777.yaml"), orphanStub, "utf8"),
        fs.writeFile(path.join(dataRoot, "7590034564.yaml"), fullData, "utf8"),
      ]),
    );

    const client: PlaylistCatalogClient = {
      async loginUserId() {
        return "123";
      },
      async userPlaylists() {
        return [{ id: "999", name: "在账号内", trackCount: 1 }];
      },
    };

    const result = await syncPlaylistCatalog("cookie", client, {
      now: "2026-08-12T12:00:00.000Z",
      root: dataRoot,
    });
    assert.equal(result.pruned, 1);

    await assert.rejects(() => readFile(path.join(dataRoot, "777.yaml"), "utf8"));
    await readFile(path.join(dataRoot, "7590034564.yaml"), "utf8");
    await readFile(path.join(dataRoot, "999.yaml"), "utf8");
    await rm(dir, { recursive: true, force: true });
  });
});
