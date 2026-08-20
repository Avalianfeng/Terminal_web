#!/usr/bin/env node
/** 按注释区块拆分 app/globals.css → app/styles/*.css（一次性工具）。 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const src = path.join("app", "globals.css");
const lines = (await readFile(src, "utf8")).split(/\r?\n/);

function slice(from, to) {
  return `${lines.slice(from - 1, to).join("\n")}\n`;
}

const stylesDir = path.join("app", "styles");
await mkdir(stylesDir, { recursive: true });

const files = {
  "palettes-production.css": slice(3, 44),
  "palettes-lab.css": slice(46, 315),
  "workspace.css": `${slice(316, 348)}\n${slice(1051, 1428)}`,
  "reading.css": slice(349, 1050),
  "terminal.css": slice(1429, 1839),
  "editor.css": slice(1840, 1991),
  "bgm.css": slice(1992, lines.length),
};

for (const [name, body] of Object.entries(files)) {
  await writeFile(path.join(stylesDir, name), body, "utf8");
}

const globals = `@import "tailwindcss";

@import "./styles/palettes-production.css";
@import "./styles/palettes-lab.css";
@import "./styles/workspace.css";
@import "./styles/reading.css";
@import "./styles/terminal.css";
@import "./styles/editor.css";
@import "./styles/bgm.css";
`;

await writeFile(src, globals, "utf8");
console.log("split globals.css → app/styles/");
