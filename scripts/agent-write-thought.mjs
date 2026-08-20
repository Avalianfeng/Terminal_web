#!/usr/bin/env node
/**
 * 站外 Agent 写回实验：发现 → 详情 hash → If-Match PUT 一篇 thought。
 * 用法：ARCHIVE_WRITE_TOKEN=<明文> [BASE_URL=http://localhost:3000] node scripts/agent-write-thought.mjs
 * 需 dev 已启动且 token scope 含 thoughts/*（见 docs/10）。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.BASE_URL ?? "http://localhost:3000";
const token = process.env.ARCHIVE_WRITE_TOKEN;
const localKey = process.env.WRITE_LOCAL_KEY ?? "thoughts/digital-archive-entry";
const sourcePath =
  process.env.WRITE_SOURCE_PATH ??
  path.join(root, "content/thoughts/digital-archive-entry.md");

if (!token) {
  console.error("缺少 ARCHIVE_WRITE_TOKEN");
  process.exit(1);
}

function splitFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body: match[2].trim() };
}

async function main() {
  const raw = await readFile(sourcePath, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const title = frontmatter.title ?? "未命名";
  const summary = frontmatter.summary ?? "";
  const status = frontmatter.status ?? "可读";
  const tags = (frontmatter.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const detailUrl = `${base}/api/v1/items?source=local&localKey=${encodeURIComponent(localKey)}`;
  const getRes = await fetch(detailUrl);
  const isCreate = getRes.status === 404;
  let hash;
  if (getRes.status === 200) {
    const detail = await getRes.json();
    hash = detail.data?.hash;
  } else if (!isCreate) {
    console.error("GET failed", getRes.status, await getRes.text());
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(hash ? { "If-Match": hash } : {}),
  };

  const payload = { title, summary, status, tags, body };

  const putRes = await fetch(detailUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  const putBody = await putRes.json();
  if (!putRes.ok) {
    console.error("PUT failed", putRes.status, putBody);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: putRes.status,
        localKey,
        hash: putBody.data?.hash,
        created: putBody.data?.created ?? isCreate,
        source: path.relative(root, sourcePath),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
