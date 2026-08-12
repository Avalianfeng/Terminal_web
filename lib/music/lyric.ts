/** LRC 解析与按进度取当前行（BGM 歌词滚动用 index；lyricWindow 仍可供测试/兼容）。 */

export type LyricLine = {
  timeMs: number;
  text: string;
};

const LRC_LINE = /^\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\](.*)$/;

/** 网易云等常见「无歌词 / 纯音乐」占位句（去空白与轻标点后比对）。 */
export function isNoLyricText(text: string): boolean {
  const compact = text
    .replace(/\s+/g, "")
    .replace(/[，,。.!！?？、~～\-—_]/g, "");
  if (!compact) return true;
  return (
    compact === "无歌词" ||
    compact === "暂无歌词" ||
    compact === "暂无歌词敬请期待" ||
    compact === "纯音乐" ||
    compact === "纯音乐请欣赏" ||
    compact === "此歌曲为没有填词的纯音乐请您欣赏"
  );
}

/** 去掉占位句；若只剩占位则返回空数组，供 UI 走空态。 */
export function usableLyricLines(lines: LyricLine[]): LyricLine[] {
  return lines.filter((line) => !isNoLyricText(line.text));
}

export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of raw.split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed.startsWith("[")) continue;
    const match = LRC_LINE.exec(trimmed);
    if (!match) continue;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const frac = match[3] ?? "0";
    const fracMs =
      frac.length === 1
        ? Number(frac) * 100
        : frac.length === 2
          ? Number(frac) * 10
          : Number(frac.padEnd(3, "0").slice(0, 3));
    const text = (match[4] ?? "").trim();
    if (!text) continue;
    const timeMs = minutes * 60_000 + seconds * 1000 + fracMs;
    if (!Number.isFinite(timeMs)) continue;
    lines.push({ timeMs, text });
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return usableLyricLines(lines);
}

/** 返回当前应高亮的行下标；无匹配时 -1。 */
export function lyricIndexAt(lines: LyricLine[], timeMs: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = lines[mid]!.timeMs;
    if (t <= timeMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function lyricWindow(
  lines: LyricLine[],
  index: number,
): { prev: string; current: string; next: string } {
  if (index < 0) {
    return {
      prev: "",
      current: lines[0]?.text ?? "",
      next: lines[1]?.text ?? "",
    };
  }
  return {
    prev: lines[index - 1]?.text ?? "",
    current: lines[index]?.text ?? "",
    next: lines[index + 1]?.text ?? "",
  };
}
