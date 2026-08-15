import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  entryPlainText,
  formatProgressLine,
  musicNoPlaylist,
  musicNoTrack,
  musicPlaying,
  musicPlaylistUsage,
  musicSaved,
  musicSwitchedBrowse,
  renderCliEvent,
} from "./cli-emit";
import { MUSIC_USAGE } from "../music/music-command";

function entriesPlainText(
  entries: ReturnType<typeof musicPlaying>,
): string {
  return entries.map(entryPlainText).join("\n");
}

describe("formatProgressLine", () => {
  it("renders wget-style progress at 45%", () => {
    assert.equal(
      formatProgressLine("爱情.mp3", 45),
      "爱情.mp3  45% [=====>    ]",
    );
  });

  it("renders full bar at 100% without arrow", () => {
    assert.equal(
      formatProgressLine("爱情.mp3", 100),
      "爱情.mp3  100% [==========]",
    );
  });

  it("clamps percent to 0–100", () => {
    assert.equal(
      formatProgressLine("x", -5),
      "x  0% [>         ]",
    );
    assert.equal(
      formatProgressLine("x", 150),
      "x  100% [==========]",
    );
  });
});

describe("renderCliEvent", () => {
  it("maps usage to muted lines entry", () => {
    const entry = renderCliEvent({
      genre: "usage",
      syntax: "music playlist next|prev|<name>",
    });
    assert.equal(entry.kind, "lines");
    assert.equal(entryPlainText(entry), "usage: music playlist next|prev|<name>");
    assert.equal(entry.lines[0]?.tokens[0]?.tone, "muted");
  });

  it("maps status to status entry with hint tone", () => {
    const entry = renderCliEvent({
      genre: "status",
      text: "爱情.mp3  45% [=====>    ]",
    });
    assert.equal(entry.kind, "status");
    assert.equal(entry.lines[0]?.tokens[0]?.tone, "hint");
  });

  it("maps error with optional hint line", () => {
    const entry = renderCliEvent({
      genre: "error",
      prog: "music",
      message: "no playlist matches 'my'",
      hint: "Try 'music ls' or 'music play --song my'.",
    });
    assert.equal(entry.kind, "lines");
    assert.equal(
      entryPlainText(entry),
      "music: no playlist matches 'my'\nTry 'music ls' or 'music play --song my'.",
    );
    assert.equal(entry.lines[0]?.tokens[0]?.tone, "error");
    assert.equal(entry.lines[1]?.tokens[0]?.tone, "hint");
  });
});

describe("music golden samples", () => {
  it("A. musicPlaying with playlist", () => {
    assert.equal(
      entriesPlainText(musicPlaying("Take My Hand", "策月帘风喜欢的音乐")),
      "playing Take My Hand\nin 策月帘风喜欢的音乐",
    );
  });

  it("A. musicPlaying without playlist", () => {
    assert.equal(
      entriesPlainText(musicPlaying("Take My Hand")),
      "playing Take My Hand",
    );
  });

  it("B. musicNoPlaylist", () => {
    assert.equal(
      entryPlainText(musicNoPlaylist("my")),
      "music: no playlist matches 'my'\nTry 'music ls' or 'music play --song my'.",
    );
  });

  it("C. musicPlaylistUsage", () => {
    assert.equal(
      entryPlainText(musicPlaylistUsage()),
      "usage: music playlist next|prev|<name>",
    );
    assert.equal(
      entryPlainText(musicPlaylistUsage()),
      `usage: ${MUSIC_USAGE.playlist}`,
    );
  });

  it("D. musicSwitchedBrowse", () => {
    assert.equal(
      entryPlainText(musicSwitchedBrowse("本地")),
      "switched browse playlist to '本地'",
    );
  });

  it("E. musicSaved", () => {
    assert.equal(
      entryPlainText(musicSaved("阴天", "277775.mp3")),
      "saved '阴天' (277775.mp3)",
    );
  });

  it("F. musicNoTrack", () => {
    assert.equal(
      entryPlainText(musicNoTrack("爱请")),
      "music: no track matches '爱请'",
    );
  });
});
