#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const once = path.join(root, "measure-snapshot-payload-once.mjs");
const sizes = [20, 50, 100];
const rows = [];

for (const n of sizes) {
  const result = spawnSync("npx", ["tsx", once, String(n)], {
    encoding: "utf8",
    cwd: path.join(root, ".."),
    shell: true,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  rows.push(JSON.parse(result.stdout.trim()));
}

console.log(JSON.stringify(rows, null, 2));
