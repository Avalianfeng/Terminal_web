/**
 * 播放顺序：顺序环播 / 随机（避开当前曲）。
 * UI 与 CLI 共用；prefetch 的下一首 id 亦走此函数。
 */

export type PlayOrder = "sequential" | "shuffle";

export function stepTrackIndex(
  length: number,
  index: number,
  delta: number,
  order: PlayOrder,
  random: () => number = Math.random,
): number {
  if (length <= 0) return 0;
  if (length === 1) return 0;
  if (order === "sequential") {
    return (index + delta + length) % length;
  }
  // shuffle：任意方向都抽另一首
  let next = index;
  let guard = 0;
  while (next === index && guard < 16) {
    next = Math.floor(random() * length);
    guard += 1;
  }
  return next;
}

export function nextSongIdForPrefetch(
  tracks: ReadonlyArray<{ id: number }>,
  index: number,
  order: PlayOrder,
  random: () => number = Math.random,
): string | undefined {
  if (tracks.length === 0) return undefined;
  const nextIndex = stepTrackIndex(tracks.length, index, 1, order, random);
  const track = tracks[nextIndex];
  return track ? String(track.id) : undefined;
}
