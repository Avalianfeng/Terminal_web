#!/usr/bin/env node
/** 单档测量（独立进程，避免 contentRoot 模块缓存）。 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const count = Number(process.argv[2] ?? "20");
const BODY_CHARS = 3500;

function makeBody(n) {
  const para = "这是一段用于测量 snapshot 体积的中文占位正文。".repeat(40);
  return `# 文档 ${n}\n\n${para.slice(0, BODY_CHARS)}\n`;
}

const dir = await mkdtemp(path.join(os.tmpdir(), "snapshot-payload-"));
const prev = process.cwd();
process.chdir(dir);
try {
  await mkdir("content/thoughts", { recursive: true });
  await mkdir("content/projects", { recursive: true });
  await mkdir("content/resources", { recursive: true });
  await writeFile(
    "content/person.json",
    JSON.stringify(
      {
        name: "测",
        description: "payload fixture",
        currentFocus: "—",
        created: "2026-01-01",
        links: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile("content/timeline.md", "## 2026-01-01 测\n\n", "utf8");

  for (let i = 0; i < count; i += 1) {
    const slug = `payload-doc-${String(i).padStart(3, "0")}`;
    const md = `---\ntitle: "${slug}"\nsummary: "fixture"\ntags: "fixture"\n---\n\n${makeBody(i)}`;
    await writeFile(`content/thoughts/${slug}.md`, md, "utf8");
  }

  const { getArchiveSnapshot } = await import("../lib/archive/content.ts");
  const snapshot = await getArchiveSnapshot();
  const json = JSON.stringify(snapshot);
  const bodyBytes = snapshot.thoughts.reduce(
    (sum, doc) => sum + Buffer.byteLength(doc.body, "utf8"),
    0,
  );
  console.log(
    JSON.stringify({
      count,
      snapshotJsonBytes: Buffer.byteLength(json, "utf8"),
      bodyBytes,
      docCount: snapshot.thoughts.length,
    }),
  );
} finally {
  process.chdir(prev);
  await rm(dir, { recursive: true, force: true });
}
