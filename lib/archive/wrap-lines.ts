import { codePointWidth, displayWidth } from "./display-width";

/** 将单行按显示列宽软换行（不拆开宽字符）。 */
export function wrapLine(text: string, cols: number): string[] {
  const width = Math.max(1, cols);
  if (text.length === 0) return [""];

  const result: string[] = [];
  let rest = text;

  while (rest.length > 0) {
    if (displayWidth(rest) <= width) {
      result.push(rest);
      break;
    }

    let i = 0;
    let col = 0;
    let splitAt = 0;
    while (i < rest.length) {
      const cp = rest.codePointAt(i)!;
      const w = codePointWidth(cp);
      if (col + w > width) break;
      col += w;
      i += cp > 0xffff ? 2 : 1;
      splitAt = i;
    }

    if (splitAt === 0) {
      const cp = rest.codePointAt(0)!;
      splitAt = cp > 0xffff ? 2 : 1;
    }

    result.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt);
  }

  return result;
}

/** 逻辑行 → 终端物理行（列宽软换行）。 */
export function wrapLogicalLines(logicalLines: string[], cols: number): string[] {
  return logicalLines.flatMap((line) => wrapLine(line, cols));
}
