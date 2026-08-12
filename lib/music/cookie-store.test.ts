import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  clearNeteaseCookie,
  cookieHasMusicU,
  cookiePresence,
  normalizeCookieHeader,
  readNeteaseCookie,
  writeNeteaseCookie,
} from "./cookie-store";

describe("normalizeCookieHeader", () => {
  it("keeps name=value pairs and drops attributes", () => {
    const raw =
      "MUSIC_U=abc123; Path=/; Domain=.music.163.com; __csrf=xyz; Secure; HttpOnly";
    assert.equal(normalizeCookieHeader(raw), "MUSIC_U=abc123; __csrf=xyz");
  });
});

describe("cookieHasMusicU", () => {
  it("requires MUSIC_U", () => {
    assert.equal(cookieHasMusicU("MUSIC_U=token; __csrf=x"), true);
    assert.equal(cookieHasMusicU("__csrf=x"), false);
  });
});

describe("cookiePresence", () => {
  it("treats MUSIC_U as logged in", () => {
    assert.deepEqual(cookiePresence(""), { hasCookie: false, loggedIn: false });
    assert.deepEqual(cookiePresence("__csrf=x"), {
      hasCookie: true,
      loggedIn: false,
    });
    assert.deepEqual(cookiePresence("MUSIC_U=u"), {
      hasCookie: true,
      loggedIn: true,
    });
  });
});

describe("read/write/clear cookie file", () => {
  it("persists to an injected path", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "netease-cookie-"));
    const filePath = path.join(dir, ".netease-cookie");

    assert.equal(await readNeteaseCookie(filePath), "");

    await writeNeteaseCookie("MUSIC_U=secret; Path=/; __csrf=tok", filePath);
    const stored = await readFile(filePath, "utf8");
    assert.match(stored, /MUSIC_U=secret/);
    assert.doesNotMatch(stored, /Path=/);
    assert.equal(await readNeteaseCookie(filePath), "MUSIC_U=secret; __csrf=tok");

    await assert.rejects(
      () => writeNeteaseCookie("__csrf=only", filePath),
      /MUSIC_U/,
    );

    await clearNeteaseCookie(filePath);
    assert.equal(await readNeteaseCookie(filePath), "");
  });
});
