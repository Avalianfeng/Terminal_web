/**
 * 终端显示列宽（近似 East Asian Width / wcwidth）。
 * 用于行编辑光标定位：中日韩等宽字符计 2 列。
 */

export function codePointWidth(cp: number): 0 | 1 | 2 {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;

  // 常见宽字符区间（CJK / 全角 / emoji 等）
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }

  return 1;
}

/** 字符串在等宽终端中的显示列数。 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += codePointWidth(ch.codePointAt(0)!);
  }
  return width;
}

/** 按 Unicode 码点左移一格，返回新的 UTF-16 索引。 */
export function moveIndexLeft(text: string, index: number): number {
  if (index <= 0) return 0;
  const before = [...text.slice(0, index)];
  before.pop();
  return before.join("").length;
}

/** 按 Unicode 码点右移一格，返回新的 UTF-16 索引。 */
export function moveIndexRight(text: string, index: number): number {
  if (index >= text.length) return text.length;
  const cp = text.codePointAt(index);
  if (cp === undefined) return text.length;
  return index + (cp > 0xffff ? 2 : 1);
}

/**
 * 将显示列映射到 UTF-16 索引（列落在宽字符中间时停在该字符起点）。
 */
export function indexAtDisplayColumn(text: string, column: number): number {
  if (column <= 0) return 0;
  let col = 0;
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    const w = codePointWidth(cp);
    if (col + w > column) return i;
    col += w;
    i += cp > 0xffff ? 2 : 1;
    if (col >= column) return i;
  }
  return text.length;
}
