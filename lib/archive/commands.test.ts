import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCommand, splitVfsDirPath, cwdAfterRemoval } from "./commands";
import type { SitePrincipal } from "./site-principal";
import type { ArchiveDocument, ArchiveSnapshot } from "./types";

const VISITOR: SitePrincipal = { role: "visitor", via: "none" };

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
    directories: { projects: [], thoughts: [], resources: [] },
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

describe("commands mkdir/rmdir (ADR 0013)", () => {
  it("splitVfsDirPath parses absolute dir paths (glue regression)", () => {
    assert.deepEqual(splitVfsDirPath("/projects/my_web/notes"), {
      group: "projects",
      segments: ["my_web", "notes"],
    });
    assert.deepEqual(splitVfsDirPath("/thoughts/foo"), {
      group: "thoughts",
      segments: ["foo"],
    });
    assert.equal(splitVfsDirPath("/projects"), null);
    assert.equal(splitVfsDirPath("/timeline/x"), null);
    assert.equal(splitVfsDirPath("/projects/Bad/x"), null);
    assert.equal(splitVfsDirPath(""), null);
  });

  it("mkdir fs.path glue parses to group + segments", () => {
    const result = runCommand(snap, "mkdir /projects/my_web/new");
    const parsed = splitVfsDirPath(result.fs!.path);
    assert.deepEqual(parsed, {
      group: "projects",
      segments: ["my_web", "new"],
    });
  });

  it("mkdir requests fs side-effect with resolved path", () => {
    const result = runCommand(snap, "mkdir /projects/my_web/new");
    assert.deepEqual(result.fs, { kind: "mkdir", path: "/projects/my_web/new" });
  });

  it("mkdir resolves relative to cwd", () => {
    const cd = runCommand(snap, "cd /projects/my_web");
    const result = runCommand(snap, "mkdir notes", cd.session);
    assert.deepEqual(result.fs, { kind: "mkdir", path: "/projects/my_web/notes" });
  });

  it("mkdir absolute path ignores nested cwd", () => {
    const cd = runCommand(snap, "cd /projects/my_web");
    const result = runCommand(snap, "mkdir /thoughts/foo", cd.session);
    assert.deepEqual(result.fs, { kind: "mkdir", path: "/thoughts/foo" });
  });

  it("mkdir group-prefix target is absolute even from inside a group (regression)", () => {
    const cd = runCommand(snap, "cd /projects");
    const result = runCommand(snap, "mkdir projects/my_web", cd.session);
    // 不拼 cwd：用户实测曾得到 /projects/projects/my_web
    assert.deepEqual(result.fs, { kind: "mkdir", path: "/projects/my_web" });
    const thoughts = runCommand(snap, "mkdir thoughts/x/y", cd.session);
    assert.deepEqual(thoughts.fs, { kind: "mkdir", path: "/thoughts/x/y" });
  });

  it("cd into dual node (doc + real dir) works", () => {
    const dualSnap = snapshot([
      doc("projects", "my_web"),
      doc("projects", "my_web/log"),
    ]);
    dualSnap.directories = { projects: ["my_web"], thoughts: [], resources: [] };
    const result = runCommand(dualSnap, "cd /projects/my_web");
    assert.equal(result.session.cwd, "/projects/my_web");
  });

  it("mkdir without args shows usage", () => {
    const result = runCommand(snap, "mkdir");
    assert.equal(result.fs, undefined);
    assert.ok(plainLines(result).some((l) => l.includes("用法: mkdir")));
  });

  it("mkdir rejects non-group and bad segments", () => {
    assert.equal(runCommand(snap, "mkdir /timeline/x").fs, undefined);
    assert.equal(runCommand(snap, "mkdir /projects/Bad/x").fs, undefined);
    assert.equal(runCommand(snap, "mkdir /projects").fs, undefined);
  });

  it("mkdir/rmdir hard-reject visitors", () => {
    const mk = runCommand(snap, "mkdir /projects/x", undefined, [], VISITOR);
    assert.equal(mk.fs, undefined);
    assert.ok(plainLines(mk).some((l) => l.includes("主人")), plainLines(mk).join("|"));
    const rm = runCommand(snap, "rmdir /projects/x", undefined, [], VISITOR);
    assert.equal(rm.fs, undefined);
  });

  it("rmdir requests fs side-effect", () => {
    const result = runCommand(snap, "rmdir /projects/my_web/notes");
    assert.deepEqual(result.fs, { kind: "rmdir", path: "/projects/my_web/notes" });
  });
});

describe("commands cwdAfterRemoval (rmdir self-consistency)", () => {
  it("keeps cwd when not inside the removed dir", () => {
    assert.equal(cwdAfterRemoval("/projects", "/projects/my_web"), "/projects");
    assert.equal(
      cwdAfterRemoval("/projects/my_web2", "/projects/my_web"),
      "/projects/my_web2",
    );
    assert.equal(cwdAfterRemoval("/", "/projects/my_web"), "/");
  });

  it("rebases to parent when cwd equals the removed dir", () => {
    assert.equal(
      cwdAfterRemoval("/projects/my_web", "/projects/my_web"),
      "/projects",
    );
  });

  it("rebases to parent when cwd is nested inside the removed dir", () => {
    assert.equal(
      cwdAfterRemoval("/projects/my_web/notes", "/projects/my_web"),
      "/projects",
    );
    assert.equal(
      cwdAfterRemoval("/projects/my_web/sub/deep", "/projects/my_web"),
      "/projects",
    );
  });

  it("guards degenerate root", () => {
    assert.equal(cwdAfterRemoval("/", "/"), "/");
  });
});

describe("commands path ergonomics (~ / .md / tree root)", () => {
  it("cd ~ returns to root from a nested cwd", () => {
    const result = runCommand(snap, "cd ~", { cwd: "/projects", commandHistory: [] });
    assert.equal(result.session.cwd, "/");
  });

  it("open accepts trailing .md suffix", () => {
    const result = runCommand(snap, "open projects/my_web/log.md");
    assert.ok(result.reading);
    const surfaces = Array.isArray(result.reading) ? result.reading : [result.reading];
    assert.equal(surfaces.length, 1);
    assert.equal(surfaces[0]!.kind, "document");
    assert.equal(
      surfaces[0]!.kind === "document" ? surfaces[0]!.document.ref.slug : "",
      "my_web/log",
    );
  });

  it("cat accepts trailing .md suffix", () => {
    const result = runCommand(snap, "cat projects/my_web/log.md");
    assert.ok(result.pager, "expected pager");
    assert.ok(
      result.pager!.logicalLines.join("\n").includes("body of my_web/log"),
    );
  });

  it("edit accepts trailing .md suffix and ~/ prefix", () => {
    const md = runCommand(snap, "edit projects/my_web/log.md");
    assert.ok(md.edit);
    assert.equal(md.edit!.ref.slug, "my_web/log");
    assert.equal(md.edit!.exists, true);
    const tilde = runCommand(snap, "edit ~/projects/my_web/log");
    assert.ok(tilde.edit);
    assert.equal(tilde.edit!.ref.slug, "my_web/log");
  });

  it("mkdir ~/... maps to root", () => {
    const result = runCommand(snap, "mkdir ~/projects/zzz");
    assert.deepEqual(result.fs, { kind: "mkdir", path: "/projects/zzz" });
  });

  it("tree root renders a single slash", () => {
    const result = runCommand(snap, "tree");
    const textLines = plainLines(result);
    assert.ok(textLines.includes("/"), textLines.join("|"));
    assert.ok(!textLines.includes("//"), textLines.join("|"));
  });

  it("open missing nested doc hints it is not on disk yet", () => {
    const withDir = snapshot([doc("projects", "my_web"), doc("projects", "flat")]);
    withDir.directories.projects = ["my_web"];
    const result = runCommand(withDir, "open projects/my_web/log");
    const text = plainLines(result).join("|");
    assert.ok(text.includes("尚未落盘"), text);
    assert.ok(text.includes("my_web/log"), text);
  });

  it("open/cat/cd/ls treat group prefix as absolute from nested cwd", () => {
    const nested = { cwd: "/projects", commandHistory: [] };
    const opened = runCommand(snap, "open projects/my_web/log", nested);
    assert.ok(opened.reading);
    const surfaces = Array.isArray(opened.reading)
      ? opened.reading
      : [opened.reading];
    assert.equal(
      surfaces[0]!.kind === "document" ? surfaces[0]!.document.ref.slug : "",
      "my_web/log",
    );
    const catted = runCommand(snap, "cat projects/my_web/log", nested);
    assert.ok(catted.pager, "expected pager for cat");
    const cded = runCommand(snap, "cd projects/my_web", nested);
    assert.equal(cded.session.cwd, "/projects/my_web");
    const listed = runCommand(snap, "ls projects/my_web", nested);
    assert.ok(
      plainLines(listed).some((l) => l.includes("log")),
      plainLines(listed).join("|"),
    );
    // .md 尾缀 + 组前缀 + 嵌套 cwd 组合
    const withMd = runCommand(snap, "open projects/my_web/log.md", nested);
    assert.ok(withMd.reading, "expected reading for .md suffix from nested cwd");
  });

  it("open missing path reports 路径不存在 (not 无法打开)", () => {
    const result = runCommand(snap, "open nope/nothing");
    const text = plainLines(result).join("|");
    assert.ok(text.includes("路径不存在"), text);
    assert.ok(!text.includes("无法打开"), text);
  });

  it("edit on a pure directory opens its entry document (new)", () => {
    const withDir = snapshot([doc("projects", "my_web/log")]);
    withDir.directories.projects = ["my_web"];
    const result = runCommand(withDir, "edit my_web", {
      cwd: "/projects",
      commandHistory: [],
    });
    assert.ok(result.edit, "expected edit target");
    assert.deepEqual(result.edit!.ref, { group: "projects", slug: "my_web" });
    assert.equal(result.edit!.exists, false);
  });

  it("edit on group root still refuses", () => {
    const result = runCommand(snap, "edit /projects");
    assert.equal(result.edit, undefined);
    const text = plainLines(result).join("|");
    assert.ok(text.includes("可读取"), text);
  });

  it("edit bare slug from nested cwd creates doc under cwd (not group root)", () => {
    const withDir = snapshot([doc("projects", "flat")]);
    withDir.directories.projects = ["my_web_dir"];
    const result = runCommand(withDir, "edit log", {
      cwd: "/projects/my_web_dir",
      commandHistory: [],
    });
    assert.ok(result.edit, "expected edit target");
    assert.deepEqual(result.edit!.ref, {
      group: "projects",
      slug: "my_web_dir/log",
    });
    assert.equal(result.edit!.exists, false);
  });

  it("edit multi-segment relative path from group root creates nested doc", () => {
    const withDir = snapshot([doc("projects", "flat")]);
    withDir.directories.projects = ["my_web_dir"];
    const result = runCommand(withDir, "edit my_web_dir/log", {
      cwd: "/projects",
      commandHistory: [],
    });
    assert.ok(result.edit, "expected edit target");
    assert.deepEqual(result.edit!.ref, {
      group: "projects",
      slug: "my_web_dir/log",
    });
    assert.equal(result.edit!.exists, false);
  });

  it("edit bare slug from root still defaults to projects group", () => {
    const result = runCommand(snap, "edit brand_new");
    assert.ok(result.edit);
    assert.deepEqual(result.edit!.ref, { group: "projects", slug: "brand_new" });
    assert.equal(result.edit!.exists, false);
  });
});
