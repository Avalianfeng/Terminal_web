#!/usr/bin/env node
/**
 * 生成主人口令哈希：明文只打印一次，`.env.local` 只存 scrypt 哈希。
 * 用法：
 *   node scripts/set-owner-password.mjs
 *   node scripts/set-owner-password.mjs --password <明文>（脚本/非交互）
 * 同时确保 ARCHIVE_SESSION_SECRET 存在。
 */
import { randomBytes, scryptSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const HASH_KEY = "ARCHIVE_OWNER_PASSWORD_HASH";
const SECRET_KEY = "ARCHIVE_SESSION_SECRET";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

function parseArgs(argv) {
  let password;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--password" && argv[i + 1]) {
      password = argv[i + 1];
      i += 1;
    }
  }
  return { password };
}

async function readEnv() {
  try {
    return await readFile(envPath, "utf8");
  } catch {
    return "";
  }
}

function envQuote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

async function upsertEnvKey(key, value) {
  const content = await readEnv();
  const line = `${key}=${envQuote(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = content.match(pattern)
    ? content.replace(pattern, line)
    : `${content.trimEnd() ? `${content.trimEnd()}\n` : ""}${line}\n`;
  await writeFile(envPath, next);
}

function hashPassword(password) {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

function writeOut(text) {
  try {
    process.stdout.write(text);
  } catch {
    // Windows 部分终端对 stdout 瞬时 EPIPE；口令仍要收下。
  }
}

/** 交互口令：raw 模式，只往 stdout 打 `*`。禁止写 stdin（Win32 上会 EPIPE）。 */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (typeof stdin.setRawMode !== "function") {
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    writeOut(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          stdin.setRawMode(false);
          stdin.removeListener("data", onData);
          writeOut("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          writeOut("\n");
          process.exit(130);
        }
        if (char === "\u0008" || char === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            writeOut("\b \b");
          }
          continue;
        }
        if (char < " ") continue;
        value += char;
        writeOut("*");
      }
    };
    stdin.on("data", onData);
  });
}

const { password: argPassword } = parseArgs(process.argv.slice(2));
let password = argPassword;
if (!password) {
  if (!process.stdin.isTTY) {
    console.error("非 TTY：请使用 --password <明文>");
    process.exit(1);
  }
  password = await askHidden("主人口令: ");
}
if (!password || !password.trim()) {
  console.error("口令不能为空");
  process.exit(1);
}

const hash = hashPassword(password.trim());
await upsertEnvKey(HASH_KEY, hash);

const env = await readEnv();
if (!new RegExp(`^${SECRET_KEY}=.+$`, "m").test(env)) {
  await upsertEnvKey(SECRET_KEY, randomBytes(32).toString("base64url"));
  console.log(`已生成 ${SECRET_KEY}`);
}

console.log("");
console.log("口令已哈希写入 .env.local（明文不会再显示）。");
console.log(`键: ${HASH_KEY}`);
console.log("请记住你刚才输入的口令；必须重启 dev，终端 login 才会读到新哈希。");
