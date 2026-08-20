#!/usr/bin/env node
/**
 * 目录写 API smoke（ADR 0015）。
 *
 * 前置：`npm run dev`；token scope `thoughts/*`。
 * 用法：ARCHIVE_WRITE_TOKEN=<token> node scripts/smoke-directories-api.mjs
 */
const DEFAULT_BASE = "http://localhost:3000";
const SMOKE_DIR = "_smoke_dir_api/nested";
const FORBIDDEN_DIR = "projects/_smoke_forbidden_dir";

function parseArgs(argv) {
  let token = process.env.ARCHIVE_WRITE_TOKEN?.trim() || "";
  let base = process.env.ARCHIVE_API_BASE?.trim() || DEFAULT_BASE;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--token" && argv[i + 1]) {
      token = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--base" && argv[i + 1]) {
      base = argv[i + 1].replace(/\/$/, "");
      i += 1;
    }
  }
  return { token, base };
}

function dirUrl(base, group, path) {
  const q = new URLSearchParams({ group, path });
  return `${base}/api/v1/directories?${q}`;
}

async function req(method, url, { headers = {} } = {}) {
  const res = await fetch(url, { method, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

function assertStatus(label, got, expected) {
  if (got !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${got}`);
  }
  console.log(`ok  ${label} → ${got}`);
}

const { token, base } = parseArgs(process.argv.slice(2));
if (!token) {
  console.error("Missing ARCHIVE_WRITE_TOKEN");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${token}` };

async function main() {
  const thoughtsUrl = dirUrl(base, "thoughts", SMOKE_DIR);
  const forbiddenUrl = dirUrl(base, "projects", FORBIDDEN_DIR);

  assertStatus("mkdir no auth", (await req("PUT", thoughtsUrl)).status, 401);

  assertStatus(
    "mkdir forbidden scope",
    (await req("PUT", forbiddenUrl, { headers: auth })).status,
    403,
  );

  const created = await req("PUT", thoughtsUrl, { headers: auth });
  assertStatus("mkdir create", created.status, 201);
  assertStatus(
    "mkdir idempotent",
    (await req("PUT", thoughtsUrl, { headers: auth })).status,
    200,
  );

  assertStatus(
    "rmdir missing",
    (await req("DELETE", dirUrl(base, "thoughts", "_no_such_dir"))).status,
    401,
  );

  assertStatus(
    "rmdir delete",
    (await req("DELETE", thoughtsUrl, { headers: auth })).status,
    200,
  );

  console.log("\nAll directory write smoke checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
