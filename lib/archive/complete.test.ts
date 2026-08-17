import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeInput } from "./complete.ts";
import type { ArchiveDocument, ArchiveSnapshot } from "./types.ts";

function doc(
  group: "projects" | "thoughts" | "resources",
  slug: string,
): ArchiveDocument {
  return {
    ref: { group, slug },
    title: slug,
    summary: "",
    body: "body",
    tags: [],
  };
}

const emptySnapshot = {
  generatedAt: "2026-08-13T00:00:00.000Z",
  person: {
    name: "t",
    description: "",
    currentFocus: "",
  },
  projects: [],
  thoughts: [],
  resources: [],
  timeline: [],
} as ArchiveSnapshot;

const nestedSnapshot = {
  ...emptySnapshot,
  projects: [
    doc("projects", "my_web"),
    doc("projects", "my_web/log"),
    doc("projects", "my_web/notes"),
    doc("projects", "flat"),
  ],
} as ArchiveSnapshot;

describe("completeInput music", () => {
  it("completes music subcommands after music ", () => {
    const result = completeInput("music sh", emptySnapshot, "/");
    assert.ok(result.candidates.includes("shuffle"));
    assert.ok(result.candidates.includes("show"));
  });

  it("completes playlist second level", () => {
    const result = completeInput("music playlist n", emptySnapshot, "/");
    assert.deepEqual(result.candidates, ["next"]);
    assert.equal(result.input, "music playlist next");
    assert.equal(result.applied, true);
  });

  it("completes shuffle modes after trailing space", () => {
    const result = completeInput("music shuffle ", emptySnapshot, "/");
    assert.deepEqual(result.candidates, ["off", "on"]);
  });
});

describe("completeInput paths (ADR 0013)", () => {
  it("drills into nested directories from group root", () => {
    const result = completeInput("open projects/my_web/", nestedSnapshot, "/");
    assert.deepEqual(result.candidates, ["projects/my_web/log", "projects/my_web/notes"]);
  });

  it("completes nested dir name with trailing slash", () => {
    const result = completeInput("cd /projects/my", nestedSnapshot, "/");
    assert.deepEqual(result.candidates, ["/projects/my_web/"]);
  });

  it("lists group root with dual node as directory", () => {
    const result = completeInput("ls /projects/", nestedSnapshot, "/");
    // 补全按字母序；复合节点带 `/` 可下钻
    assert.deepEqual(result.candidates, ["/projects/flat", "/projects/my_web/"]);
  });

  it("cat drills the single nested dir then lists files", () => {
    const result = completeInput("cat /projects/my_web/", nestedSnapshot, "/");
    assert.deepEqual(result.candidates, ["/projects/my_web/log", "/projects/my_web/notes"]);
  });
});
