import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { readGroupTree } from "./content";
import { documentTemplateForGroup } from "./content-format";
import { parseDocument } from "./parse-document";
import { createVfs, createSession, resolveVfsPath, treeLines } from "./vfs";
import { runCommand } from "./commands";
import { completeInput } from "./complete";
import type { ArchiveDocument, ArchiveSnapshot, TerminalSession } from "./types";

/**
 * 盘 → 快照 → VFS → 终端命令 全链路夹具测试（npm run smoke:terminal）。
 * 用临时目录构造真实内容树，走与生产一致的收集/解析路径，杜绝「测试读现场 content/」。
 */
async function fixtureSnapshot(): Promise<{
  snapshot: ArchiveSnapshot;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "dsh-pipeline-"));
  const groups = ["projects", "thoughts", "resources"] as const;
  for (const group of groups) {
    await mkdir(path.join(root, group), { recursive: true });
  }
  await writeFile(
    path.join(root, "projects", "flat.md"),
    "---\ntitle: Flat\nsummary: flat summary\n---\nflat body\n",
    "utf8",
  );
  await mkdir(path.join(root, "projects", "my_web"), { recursive: true });
  await writeFile(
    path.join(root, "projects", "my_web", "log.md"),
    "---\ntitle: Log\n---\nlog body\n",
    "utf8",
  );
  await mkdir(path.join(root, "projects", "empty"), { recursive: true });
  await writeFile(
    path.join(root, "thoughts", "note.md"),
    "---\ntitle: Note\n---\nnote body\n",
    "utf8",
  );

  const [projects, thoughts, resources] = await Promise.all(
    groups.map((group) => readGroupTree(path.join(root, group))),
  );

  async function docs(group: (typeof groups)[number], files: string[]): Promise<ArchiveDocument[]> {
    const out: ArchiveDocument[] = [];
    for (const relative of files) {
      const slug = relative.replace(/\.md$/, "");
      const markdown = await readFile(path.join(root, group, relative), "utf8");
      const document = parseDocument(group, slug, markdown);
      if (document) out.push(document);
    }
    return out;
  }

  const snapshot: ArchiveSnapshot = {
    person: {
      name: "t",
      description: "",
      currentFocus: "",
      created: "",
      links: [],
    },
    projects: await docs("projects", projects.files),
    thoughts: await docs("thoughts", thoughts.files),
    resources: await docs("resources", resources.files),
    directories: {
      projects: projects.dirs,
      thoughts: thoughts.dirs,
      resources: resources.dirs,
      private: { projects: [], thoughts: [], resources: [] },
    },
    privateZoneMounted: false,
    timeline: [],
    generatedAt: "2026-08-19T00:00:00.000Z",
  };

  return {
    snapshot,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function plainLines(result: ReturnType<typeof runCommand>): string[] {
  return result.entries
    .flatMap((entry) => entry.lines)
    .map((line) => line.tokens.map((t) => t.text).join(""));
}

describe("disk → snapshot → VFS → commands (fixture chain)", () => {
  it("nested docs and empty dirs surface truthfully", async () => {
    const { snapshot, cleanup } = await fixtureSnapshot();
    try {
      // 目录树：嵌套链 + 空目录可见
      const lines = treeLines(createVfs(snapshot)).join("\n");
      assert.ok(lines.includes("my_web/"), lines);
      assert.ok(lines.includes("empty/"), lines);
      assert.ok(!lines.includes("//"), lines);

      // VFS 节点：嵌套文档可解析、空目录是目录
      const root = createVfs(snapshot);
      assert.equal(resolveVfsPath(root, "/", "/projects/my_web/log")?.refSlug, "my_web/log");
      assert.equal(resolveVfsPath(root, "/", "/projects/empty")?.type, "dir");

      // 发现层索引（localKey 多段）
      const slugs = [
        ...snapshot.projects,
        ...snapshot.thoughts,
        ...snapshot.resources,
      ].map((d) => `${d.ref.group}/${d.ref.slug}`).sort();
      assert.deepEqual(slugs, ["projects/flat", "projects/my_web/log", "thoughts/note"]);
    } finally {
      await cleanup();
    }
  });

  it("open/cat/find/search hit nested fixture docs", async () => {
    const { snapshot, cleanup } = await fixtureSnapshot();
    try {
      const opened = runCommand(snapshot, "open /projects/my_web/log");
      assert.ok(opened.reading && !Array.isArray(opened.reading));
      assert.equal(
        opened.reading.kind === "document" ? opened.reading.document.ref.slug : "",
        "my_web/log",
      );

      const catted = runCommand(snapshot, "cat /projects/my_web/log");
      assert.ok(catted.pager, "expected pager");
      assert.ok(catted.pager!.logicalLines.join("\n").includes("log body"));

      const found = runCommand(snapshot, "find my_web");
      assert.ok(plainLines(found).some((l) => l.includes("/projects/my_web")), plainLines(found).join("|"));

      const searched = runCommand(snapshot, "search log body");
      assert.ok(plainLines(searched).some((l) => l.includes("my_web/log")), plainLines(searched).join("|"));
    } finally {
      await cleanup();
    }
  });

  it("completion drills into nested fixture dirs", async () => {
    const { snapshot, cleanup } = await fixtureSnapshot();
    try {
      const result = completeInput("open projects/my_web/", snapshot, "/");
      assert.ok(
        result.candidates.includes("projects/my_web/log"),
        JSON.stringify(result.candidates),
      );
    } finally {
      await cleanup();
    }
  });
});

describe("scripted terminal session (docs/17 smoke)", () => {
  it("walks a realistic owner flow end to end", async () => {
    const { snapshot, cleanup } = await fixtureSnapshot();
    try {
      let session: TerminalSession = createSession();
      const run = (command: string): CommandResult => {
        const result = runCommand(snapshot, command, session);
        session = result.session;
        return result;
      };

      // 1. cd 成功静默（仅命令回显）
      const cd = run("cd /projects");
      assert.equal(session.cwd, "/projects");
      assert.equal(cd.entries.length, 1, "cd 应只输出命令回显");

      // 2. ls：目录带 /、嵌套与空目录可见
      const ls = run("ls");
      const lsText = plainLines(ls).join("|");
      assert.ok(lsText.includes("my_web/"), lsText);
      assert.ok(lsText.includes("empty/"), lsText);
      assert.ok(lsText.includes("flat"), lsText);

      // 3. 相对 mkdir + 嵌套 cwd 相对新建（edit 目标语义）
      const mkdir = run("mkdir my_web/notes");
      assert.deepEqual(mkdir.fs, { kind: "mkdir", path: "/projects/my_web/notes" });
      const editNested = run("edit my_web/notes");
      assert.ok(editNested.edit);
      assert.deepEqual(editNested.edit!.ref, {
        zone: "public",
        group: "projects",
        slug: "my_web/notes",
      });
      assert.equal(editNested.edit!.exists, false);

      // 4. cd 进空目录，open 提示空
      run("cd empty");
      assert.equal(session.cwd, "/projects/empty");
      const emptyOpen = run("open .");
      assert.ok(plainLines(emptyOpen).some((l) => l.includes("没有可打开")), plainLines(emptyOpen).join("|"));

      // 5. cd ~ 回根
      run("cd ~");
      assert.equal(session.cwd, "/");

      // 6. tree 根为单斜杠、嵌套正确
      const tree = run("tree");
      const treeText = plainLines(tree).join("\n");
      assert.ok(treeText.split("\n").some((l) => l.trim() === "/"), treeText);
      assert.ok(treeText.includes("my_web/"), treeText);

      // 7. .md 容错 + 真实终端语义（组前缀相对）
      const withMd = run("open projects/my_web/log.md");
      assert.ok(withMd.reading, "expected reading with .md suffix from root");
      const missing = run("cd /projects");
      assert.equal(missing.session.cwd, "/projects");
      const relativeMissing = run("open projects/my_web/log");
      assert.ok(
        plainLines(relativeMissing).some((l) => l.includes("路径不存在")),
        plainLines(relativeMissing).join("|"),
      );
      const viaTilde = run("open ~/projects/my_web/log");
      assert.ok(viaTilde.reading, "expected reading via ~/ from nested cwd");

      // 8. 新建模板标题 = 叶子文件名
      const template = documentTemplateForGroup("projects", "my_web/log");
      assert.ok(template.includes('title: "log"'), template);

      // 9. rmdir 相对语义（`rmdir .` 删当前目录）→ fs.path 指向自身
      const inEmpty = run("cd /projects/empty");
      assert.equal(inEmpty.session.cwd, "/projects/empty");
      const removed = run("rmdir .");
      assert.deepEqual(removed.fs, { kind: "rmdir", path: "/projects/empty" });
    } finally {
      await cleanup();
    }
  });
});
