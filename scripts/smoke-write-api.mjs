#!/usr/bin/env node
/**
 * 写 API 契约 smoke（docs/09 §1.1）。
 *
 * 前置：`npm run dev`；token 须覆盖 `thoughts/*`（推荐），以便用 `projects/…` 测 403。
 * 用法：
 *   ARCHIVE_WRITE_TOKEN=<token> node scripts/smoke-write-api.mjs
 *   node scripts/smoke-write-api.mjs --token <token> [--base http://localhost:3000]
 *   npm run smoke:write-api -- --token <token>
 *
 * 会创建并最终删除 `thoughts/_smoke_write_api`；
 * 若误用全权 token，403 步可能写到 `projects/_smoke_forbidden`，finally 也会尝试删。
 */
const DEFAULT_BASE = "http://localhost:3000";
const SMOKE_KEY = "thoughts/_smoke_write_api";
const FORBIDDEN_KEY = "projects/_smoke_forbidden";

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
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`Usage:
  ARCHIVE_WRITE_TOKEN=<token> node scripts/smoke-write-api.mjs
  node scripts/smoke-write-api.mjs --token <token> [--base ${DEFAULT_BASE}]

Token scope must cover thoughts/* (recommended) so 403 can hit projects/*.`);
      process.exit(0);
    }
  }
  return { token, base };
}

function itemsUrl(base, localKey) {
  const q = new URLSearchParams({ source: "local", localKey });
  return `${base}/api/v1/items?${q}`;
}

async function req(method, url, { headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, text, json };
}

function assertStatus(label, got, expected) {
  if (got !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${got}`);
  }
  console.log(`ok  ${label} → ${got}`);
}

const { token, base } = parseArgs(process.argv.slice(2));
if (!token) {
  console.error(
    "Missing token. Set ARCHIVE_WRITE_TOKEN or pass --token <token>.\n" +
      "Generate: npm run token:generate -- --scope thoughts/*\n" +
      "Then restart `npm run dev` so .env.local hashes reload.",
  );
  process.exit(1);
}

const auth = { Authorization: `Bearer ${token}` };
const jsonHeaders = {
  ...auth,
  "Content-Type": "application/json",
};

let failed = false;
try {
  // --- 读路径（playbook 前半）---
  {
    const r = await req("GET", `${base}/api/v1`);
    assertStatus("GET /api/v1 discovery", r.status, 200);
    if (!r.json?.ok || !r.json?.data?.capabilities) {
      throw new Error("discovery payload missing capabilities");
    }
    if (!r.json?.data?.capabilities?.filters) {
      throw new Error("discovery payload missing capabilities.filters");
    }
  }
  {
    const r = await req("GET", `${base}/api/v1/items`);
    assertStatus("GET /api/v1/items index", r.status, 200);
    if (!r.json?.ok || !Array.isArray(r.json?.data?.items)) {
      throw new Error("index payload missing items[]");
    }
  }

  // --- 鉴权 ---
  {
    const r = await req("PUT", itemsUrl(base, SMOKE_KEY), {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "noauth", body: "x" }),
    });
    assertStatus("PUT without token", r.status, 401);
  }
  {
    const r = await req("PUT", itemsUrl(base, FORBIDDEN_KEY), {
      headers: jsonHeaders,
      body: JSON.stringify({ title: "forbidden", body: "x" }),
    });
    assertStatus("PUT out-of-scope", r.status, 403);
  }

  // --- 创建 / 详情 hash / 冲突 / 覆盖 ---
  let hash;
  {
    const r = await req("PUT", itemsUrl(base, SMOKE_KEY), {
      headers: jsonHeaders,
      body: JSON.stringify({
        title: "smoke write api",
        summary: "disposable",
        status: "draft",
        tags: ["smoke"],
        body: "smoke v1",
      }),
    });
    assertStatus("PUT create", r.status, 201);
    hash = r.json?.data?.hash;
    if (!hash || typeof hash !== "string") {
      throw new Error("create response missing data.hash");
    }
    if (
      r.json?.data?.body !== "smoke v1" ||
      r.json?.data?.status !== "draft" ||
      r.json?.data?.created !== true
    ) {
      throw new Error("PUT create response should be full document");
    }
  }
  {
    const r = await req("GET", itemsUrl(base, SMOKE_KEY));
    assertStatus("GET detail with hash", r.status, 200);
    if (r.json?.data?.hash !== hash) {
      throw new Error("detail hash mismatch vs create");
    }
    if (
      r.json?.data?.status !== "draft" ||
      !r.json?.data?.tags?.includes("smoke")
    ) {
      throw new Error("detail should include status/tags written via PUT");
    }
  }

  // --- 索引过滤 / 投影（status/tags 已进索引）---
  {
    const hits = async (qs) => {
      const r = await req("GET", `${base}/api/v1/items${qs}`);
      assertStatus(`index ${qs}`, r.status, 200);
      return (
        r.json?.data?.items?.some((item) => item.localKey === SMOKE_KEY) ??
        false
      );
    };
    if (!(await hits("?status=draft"))) {
      throw new Error("?status= filter should hit smoke key");
    }
    if (await hits("?status=zzz")) {
      throw new Error("?status= filter should not hit");
    }
    if (!(await hits("?tag=smoke"))) {
      throw new Error("?tag= filter should hit");
    }
    if (!(await hits("?status=draft&tag=smoke"))) {
      throw new Error("combined status+tag filter should hit");
    }
    if (await hits("?tag=smoke&tag=zzz")) {
      throw new Error("?tag= repeat should be AND (all must match)");
    }
  }
  {
    const r = await req("GET", `${base}/api/v1/items?status=a&status=b`);
    assertStatus("GET duplicate ?status=", r.status, 400);
  }
  {
    const r = await req("GET", `${base}/api/v1/items?fields=localKey,title`);
    const keys = Object.keys(r.json?.data?.items?.[0] ?? {}).sort();
    if (keys.length !== 2 || keys[0] !== "localKey" || keys[1] !== "title") {
      throw new Error(
        `?fields= projection should only return requested fields, got ${JSON.stringify(keys)}`,
      );
    }
  }

  // --- PATCH：部分更新 / null 删除 / no-op / 边界 ---
  {
    const r = await req("PATCH", itemsUrl(base, SMOKE_KEY), {
      headers: jsonHeaders,
      body: JSON.stringify({ body: "smoke patched v1" }),
    });
    assertStatus("PATCH body only", r.status, 200);
    const d = r.json?.data;
    if (d?.body !== "smoke patched v1") {
      throw new Error("PATCH should update body");
    }
    if (d?.status !== "draft" || !d?.tags?.includes("smoke")) {
      throw new Error("PATCH should keep untouched status/tags");
    }
    if (d?.created !== false || typeof d?.hash !== "string") {
      throw new Error(
        "PATCH response should be full document with created=false",
      );
    }
    hash = d.hash;
  }
  {
    let r = await req("PATCH", itemsUrl(base, SMOKE_KEY), {
      headers: jsonHeaders,
      body: JSON.stringify({ status: null }),
    });
    assertStatus("PATCH status null", r.status, 200);
    if (r.json?.data?.status !== undefined) {
      throw new Error("PATCH null should remove status");
    }
    hash = r.json?.data?.hash;
    r = await req("PATCH", itemsUrl(base, SMOKE_KEY), {
      headers: jsonHeaders,
      body: JSON.stringify({ status: null }),
    });
    assertStatus("PATCH status null no-op", r.status, 200);
    r = await req("PATCH", itemsUrl(base, SMOKE_KEY), {
      headers: jsonHeaders,
      body: JSON.stringify({ summary: null }),
    });
    assertStatus("PATCH summary null", r.status, 200);
    if (r.json?.data?.summary !== undefined) {
      throw new Error("PATCH null should remove summary");
    }
    hash = r.json?.data?.hash;
  }
  {
    const bad = async (label, body) => {
      const r = await req("PATCH", itemsUrl(base, SMOKE_KEY), {
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      assertStatus(label, r.status, 400);
    };
    await bad("PATCH title null", { title: null });
    await bad("PATCH unknown key", { foo: "bar" });
    await bad("PATCH empty body", {});
  }
  {
    const r = await req("PATCH", itemsUrl(base, SMOKE_KEY), {
      headers: { ...jsonHeaders, "If-Match": "0".repeat(64) },
      body: JSON.stringify({ body: "x" }),
    });
    assertStatus("PATCH bad If-Match", r.status, 409);
  }
  {
    const r = await req(
      "PATCH",
      itemsUrl(base, "thoughts/_smoke_write_api_nonexistent"),
      { headers: jsonHeaders, body: JSON.stringify({ body: "x" }) },
    );
    assertStatus("PATCH nonexistent", r.status, 404);
  }
  {
    const r = await req("PUT", itemsUrl(base, SMOKE_KEY), {
      headers: { ...jsonHeaders, "If-Match": "0".repeat(64) },
      body: JSON.stringify({ title: "smoke write api", body: "conflict" }),
    });
    assertStatus("PUT bad If-Match", r.status, 409);
  }
  {
    const r = await req("PUT", itemsUrl(base, SMOKE_KEY), {
      headers: { ...jsonHeaders, "If-Match": hash },
      body: JSON.stringify({ title: "smoke write api", body: "smoke v2" }),
    });
    assertStatus("PUT If-Match", r.status, 200);
    hash = r.json?.data?.hash;
  }

  // --- 方法 / 删除 ---
  {
    const r = await req("POST", `${base}/api/v1/items`, {
      headers: jsonHeaders,
      body: JSON.stringify({ title: "nope" }),
    });
    assertStatus("POST items", r.status, 405);
  }
  {
    const r = await req("DELETE", itemsUrl(base, SMOKE_KEY), {
      headers: auth,
    });
    assertStatus("DELETE", r.status, 200);
  }
  {
    const r = await req("GET", itemsUrl(base, SMOKE_KEY));
    assertStatus("GET after delete", r.status, 404);
  }

  console.log("\nAll smoke checks passed.");
} catch (error) {
  failed = true;
  console.error(`\nFAIL  ${error instanceof Error ? error.message : error}`);
} finally {
  // best-effort cleanup（即使中途失败也尽量删掉烟雾文件）
  for (const key of [SMOKE_KEY, FORBIDDEN_KEY]) {
    try {
      await req("DELETE", itemsUrl(base, key), { headers: auth });
    } catch {
      /* ignore */
    }
  }
}

process.exit(failed ? 1 : 0);
