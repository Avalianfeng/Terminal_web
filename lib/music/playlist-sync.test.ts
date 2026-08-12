import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { PlaylistCatalogClient } from "./playlist-sync";
import { syncPlaylistCatalog } from "./playlist-sync";
import { parsePlaylistIndex } from "./playlist-yaml";

describe("syncPlaylistCatalog", () => {
  it("writes stubs and preserves full imports", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "playlist-sync-"));
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await import("node:fs/promises").then((fs) =>
        fs.mkdir("content/music/playlists", { recursive: true }),
      );
      const fullYaml = [
        "slug: 7590034564",
        'neteasePlaylistId: "7590034564"',
        'name: "旧名"',
        'sourceUrl: "https://music.163.com/#/playlist?id=7590034564"',
        'importedAt: "2026-08-12T00:00:00.000Z"',
        "tracks:",
        "  - id: 1",
        '    name: "已有曲"',
        "    artists: [\"A\"]",
        "",
      ].join("\n");
      await import("node:fs/promises").then((fs) =>
        fs.writeFile("content/music/playlists/7590034564.yaml", fullYaml, "utf8"),
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
        root: path.join(dir, "content", "music", "playlists"),
      });
      assert.equal(result.synced, 2);
      assert.equal(result.created, 1);
      assert.equal(result.preserved, 1);

      const kept = parsePlaylistIndex(
        await readFile("content/music/playlists/7590034564.yaml", "utf8"),
      );
      assert.equal(kept.name, "如人饮水");
      assert.equal(kept.tracks.length, 1);
      assert.equal(kept.tracks[0]?.name, "已有曲");

      const stub = parsePlaylistIndex(
        await readFile("content/music/playlists/999.yaml", "utf8"),
      );
      assert.equal(stub.name, "新歌单");
      assert.equal(stub.trackCount, 3);
      assert.equal(stub.tracks.length, 0);
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prunes orphan stubs not in remote catalog", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "playlist-sync-"));
    const root = path.join(dir, "content", "music", "playlists");
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(root, { recursive: true }),
    );
    const orphanStub = [
      "slug: 777",
      'neteasePlaylistId: "777"',
      'name: "已删歌单"',
      'sourceUrl: "https://music.163.com/#/playlist?id=777"',
      'importedAt: "2026-08-12T00:00:00.000Z"',
      "trackCount: 5",
      "tracks: []",
      "",
    ].join("\n");
    const fullYaml = [
      "slug: 7590034564",
      'neteasePlaylistId: "7590034564"',
      'name: "保留"',
      'sourceUrl: "https://music.163.com/#/playlist?id=7590034564"',
      'importedAt: "2026-08-12T00:00:00.000Z"',
      "tracks:",
      "  - id: 1",
      '    name: "曲"',
      "    artists: [\"A\"]",
      "",
    ].join("\n");
    await import("node:fs/promises").then((fs) =>
      Promise.all([
        fs.writeFile(path.join(root, "777.yaml"), orphanStub, "utf8"),
        fs.writeFile(path.join(root, "7590034564.yaml"), fullYaml, "utf8"),
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
      root,
    });
    assert.equal(result.pruned, 1);

    await assert.rejects(() => readFile(path.join(root, "777.yaml"), "utf8"));
    await readFile(path.join(root, "7590034564.yaml"), "utf8");
    await readFile(path.join(root, "999.yaml"), "utf8");
    await rm(dir, { recursive: true, force: true });
  });
});
