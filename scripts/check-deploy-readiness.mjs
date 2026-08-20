#!/usr/bin/env node
/**
 * 部署前本地自检（不代替真机/公网验收）。
 * 用法：node scripts/check-deploy-readiness.mjs
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const requiredEnv = [
  "ARCHIVE_OWNER_PASSWORD_HASH",
  "ARCHIVE_SESSION_SECRET",
  "ARCHIVE_WRITE_TOKENS",
  "ARCHIVE_PUBLIC_ORIGIN",
];

const checks = [];

async function fileExists(rel) {
  try {
    await access(path.join(process.cwd(), rel));
    return true;
  } catch {
    return false;
  }
}

for (const key of requiredEnv) {
  checks.push({
    name: `env:${key}`,
    ok: Boolean(process.env[key]?.trim()),
    hint: "生产环境 Secrets / 面板配置",
  });
}

checks.push({
  name: "content:long-thought",
  ok: await fileExists("content/thoughts/digital-archive-entry.md"),
  hint: "至少一篇可读中文长文",
});

checks.push({
  name: "data:music-audio-dir",
  ok: await fileExists("data/music/audio"),
  hint: "访客气候可选；部署时 rsync data/music/",
});

checks.push({
  name: "netease:cookie",
  ok: await fileExists(".netease-cookie"),
  hint: "owner BFF 可选；部署机需 MUSIC_U",
});

let verifyOk = false;
try {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  verifyOk = Boolean(pkg.scripts?.verify);
} catch {
  verifyOk = false;
}
checks.push({ name: "script:verify", ok: verifyOk });

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "OK" : "MISS"} ${c.name}${c.hint ? ` — ${c.hint}` : ""}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} 项未就绪。详见 docs/13 与 docs/19 §4.9。`);
  process.exit(1);
}

console.log("\n本地自检通过。下一步：按 docs/13 部署 cylf.me，陌生浏览器 + 真机走 docs/12/14。");
