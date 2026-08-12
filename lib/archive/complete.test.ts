import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeInput } from "./complete.ts";
import type { ArchiveSnapshot } from "./types.ts";

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
