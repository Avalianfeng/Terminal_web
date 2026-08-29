/**
 * 仅列出 content/ 下可 publish 的相对路径（JSON 数组，stdout）。
 * 供本机运维控制台 D:\VPS\my_web 调用；不含 push/pull。
 *
 *   npx tsx scripts/list-publish-paths.ts
 *   npx tsx scripts/list-publish-paths.ts --all   # 全部文件（含 private / music yaml）
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectPublishPaths } from "../lib/archive/publish-paths";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(root, "content");
const wantAll = process.argv.includes("--all");

function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...walkFiles(abs, base));
    } else if (st.isFile()) {
      out.push(path.relative(base, abs).replace(/\\/g, "/"));
    }
  }
  return out;
}

if (!existsSync(contentRoot)) {
  console.error(JSON.stringify({ error: `missing content/: ${contentRoot}` }));
  process.exit(1);
}

const all = walkFiles(contentRoot).sort();
const paths = wantAll ? all : selectPublishPaths(all).sort();
process.stdout.write(`${JSON.stringify(paths)}\n`);
