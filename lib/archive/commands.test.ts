import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCommand } from "./commands";
import type { ArchiveDocument, ArchiveSnapshot } from "./types";

function doc(
  group: "projects" | "thoughts" | "resources",
  slug: string,
): ArchiveDocument {
  return {
    ref: { group, slug },
    title: slug,
    summary: "",
    body: `body of ${slug}`,
    tags: [],
  };
}

function snapshot(docs: ArchiveDocument[]): ArchiveSnapshot {
  return {
    person: {
      name: "t",
      description: "",
      currentFocus: "",
      created: "",
      links: [],
    },
    projects: docs.filter((d) => d.ref.group === "projects"),
    thoughts: docs.filter((d) => d.ref.group === "thoughts"),
    resources: docs.filter((d) => d.ref.group === "resources"),
    timeline: [],
    generatedAt: "2026-08-17T00:00:00.000Z",
  };
}

const snap = snapshot([
  doc("projects", "my_web"),
  doc("projects", "my_web/log"),
  doc("projects", "my_web/notes"),
  doc("projects", "flat"),
]);

function plainLines(result: { entries: { lines: { tokens: { text: string }[] }[] }[] }) {
  return result.entries
    .flatMap((entry) => entry.lines)
    .map((line) => line.tokens.map((t) => t.text).join(""));
}

describe("commands nested paths (ADR 0013)", () => {
  it("ls group root lists dir with slash and flat doc", () => {
    const result = runCommand(snap, "ls /projects");
    const lines = plainLines(result);
    assert.ok(lines.some((l) => l.includes("my_web/")), lines.join("|"));
    assert.ok(lines.some((l) => l.includes("flat")), lines.join("|"));
  });

  it("cd into nested dir and relative ls", () => {
    const cd = runCommand(snap, "cd /projects/my_web");
    assert.equal(cd.session.cwd, "/projects/my_web");
    const ls = runCommand(snap, "ls", cd.session);
    const lines = plainLines(ls);
    assert.ok(lines.some((l) => l.includes("log")), lines.join("|"));
    assert.ok(lines.some((l) => l.includes("notes")), lines.join("|"));
  });

  it("open nested document opens single surface", () => {
    const result = runCommand(snap, "open /projects/my_web/log");
    assert.ok(result.reading && !Array.isArray(result.reading));
    assert.equal(result.reading.kind, "document");
    assert.equal(
      result.reading.kind === "document" && result.reading.document.ref.slug,
      "my_web/log",
    );
  });

  it("open dual node batches entry plus direct children (main = entry)", () => {
    const result = runCommand(snap, "open /projects/my_web");
    assert.ok(Array.isArray(result.reading));
    const surfaces = result.reading as { kind: string; document?: ArchiveDocument }[];
    const slugs = surfaces
      .filter((s) => s.kind === "document" && s.document)
      .map((s) => s.document!.ref.slug)
      .sort();
    assert.deepEqual(slugs, ["my_web", "my_web/log", "my_web/notes"]);
    // 批量主槽 = 入口篇（首项移到末位）
    const last = surfaces[surfaces.length - 1];
    assert.equal(last.kind === "document" && last.document?.ref.slug, "my_web");
  });

  it("open pure dir batches direct children only", () => {
    const result = runCommand(snap, "open /projects");
    assert.ok(Array.isArray(result.reading));
    const surfaces = result.reading as { kind: string; document?: ArchiveDocument }[];
    const slugs = surfaces
      .filter((s) => s.kind === "document" && s.document)
      .map((s) => s.document!.ref.slug)
      .sort();
    // 直接子文档（含复合节点入口篇）；嵌套文档需再进一层
    assert.deepEqual(slugs, ["flat", "my_web"]);
  });

  it("cat nested document pagers its body", () => {
    const result = runCommand(snap, "cat /projects/my_web/log");
    assert.ok(result.pager);
    assert.ok(
      result.pager.logicalLines.some((l) => l.includes("body of my_web/log")),
      result.pager.logicalLines.join("|"),
    );
  });

  it("find hits nested paths", () => {
    const result = runCommand(snap, "find log");
    const lines = plainLines(result);
    assert.ok(lines.some((l) => l.includes("/projects/my_web/log")), lines.join("|"));
  });

  it("tree shows nested hierarchy", () => {
    const result = runCommand(snap, "tree /projects/my_web");
    const lines = plainLines(result);
    assert.ok(lines.some((l) => l.includes("log")), lines.join("|"));
    assert.ok(lines.some((l) => l.includes("notes")), lines.join("|"));
  });
});
