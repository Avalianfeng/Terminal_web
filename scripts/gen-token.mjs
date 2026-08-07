#!/usr/bin/env node
/**
 * 生成写 API token：只打印明文一次，`.env.local` 只存 SHA-256 哈希。
 * 用法：node scripts/gen-token.mjs [--scope <scope>]
 *   scope 默认 `*`（全权）；可用 `thoughts/*`、`projects/archive-system` 等限制。
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const envKey = "ARCHIVE_WRITE_TOKENS";

function parseArgs(argv) {
  let scope = "*";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--scope" && argv[i + 1]) {
      scope = argv[i + 1];
      i += 1;
    }
  }
  return { scope };
}

async function readEnv() {
  try {
    return await readFile(envPath, "utf8");
  } catch {
    return "";
  }
}

/** 找到该 key 所在行，替换；没有则追加。保持其余内容不动。 */
async function upsertEnvKey(existingTokensJson) {
  const content = await readEnv();
  const line = `${envKey}=${JSON.stringify(existingTokensJson)}`;
  const pattern = new RegExp(`^${envKey}=.*$`, "m");
  const next = content.match(pattern)
    ? content.replace(pattern, line)
    : `${content.trimEnd() ? `${content.trimEnd()}\n` : ""}${line}\n`;
  await writeFile(envPath, next);
  return next;
}

const { scope } = parseArgs(process.argv.slice(2));
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest("hex");

let existing = {};
const raw = await readEnv();
const match = raw.match(new RegExp(`^${envKey}=(.*)$`, "m"));
if (match) {
  try {
    existing = JSON.parse(match[1]);
  } catch {
    existing = {};
  }
}
existing[hash] = scope;

await upsertEnvKey(existing);

console.log("新 token（仅显示一次，请立即保存）:");
console.log("");
console.log(token);
console.log("");
console.log(`已写入 ${path.relative(root, envPath)}: ${envKey}（仅存 SHA-256 哈希）`);
console.log(`范围: ${scope}`);
