import { zhCN } from "@/lib/archive/i18n";
import type { ReadingSurface } from "@/lib/archive/types";

/** rail 硬顶：超出丢最旧（数组末尾） */
export const RAIL_MAX = 8;

export function readingSurfaceKey(surface: ReadingSurface): string {
  return surface.kind === "document" ? surface.document.path : "/timeline";
}

export type ReadingState = {
  main: ReadingSurface | null;
  rail: ReadingSurface[];
};

export function emptyReadingState(): ReadingState {
  return { main: null, rail: [] };
}

export function surfaceTitle(surface: ReadingSurface): string {
  return surface.kind === "document"
    ? surface.document.title
    : zhCN.labels.timeline;
}

export function surfacePath(surface: ReadingSurface): string {
  return surface.kind === "document" ? surface.document.path : "/timeline";
}

export function surfaceMetaType(surface: ReadingSurface): string {
  return surface.kind === "document"
    ? zhCN.reading.typeDocument
    : zhCN.reading.typeTimeline;
}

function pushRail(rail: ReadingSurface[], item: ReadingSurface): ReadingSurface[] {
  const key = readingSurfaceKey(item);
  const filtered = rail.filter((entry) => readingSurfaceKey(entry) !== key);
  return [item, ...filtered].slice(0, RAIL_MAX);
}

/** 打开 / 换文 / 从 rail 提升 */
export function openReading(
  state: ReadingState,
  next: ReadingSurface,
): ReadingState {
  if (!state.main) {
    return { main: next, rail: state.rail };
  }

  const nextKey = readingSurfaceKey(next);
  const mainKey = readingSurfaceKey(state.main);

  if (nextKey === mainKey) {
    return { main: next, rail: state.rail };
  }

  const withoutNext = state.rail.filter(
    (entry) => readingSurfaceKey(entry) !== nextKey,
  );

  return {
    main: next,
    rail: pushRail(withoutNext, state.main),
  };
}

/**
 * 批量打开：`surfaces` 最后一项进 main，其余进 rail（去重保留最后一次）。
 * 调用方约定：多目标 open a b c → 按参数序；目录批量 → 把拟 main 放最后，或先排好再传入。
 */
export function openReadingMany(
  state: ReadingState,
  surfaces: ReadingSurface[],
): ReadingState {
  if (surfaces.length === 0) return state;
  if (surfaces.length === 1) {
    return openReading(state, surfaces[0]!);
  }

  const ordered: ReadingSurface[] = [];
  const seen = new Set<string>();
  for (let index = surfaces.length - 1; index >= 0; index -= 1) {
    const surface = surfaces[index]!;
    const key = readingSurfaceKey(surface);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.unshift(surface);
  }

  const main = ordered[ordered.length - 1]!;
  const batchRail = ordered.slice(0, -1);
  const mainKey = readingSurfaceKey(main);

  let rail = state.rail.filter((entry) => !seen.has(readingSurfaceKey(entry)));
  if (state.main) {
    const prevKey = readingSurfaceKey(state.main);
    if (prevKey !== mainKey && !seen.has(prevKey)) {
      rail = pushRail(rail, state.main);
    }
  }

  for (const item of batchRail) {
    rail = pushRail(rail, item);
  }

  return { main, rail: rail.slice(0, RAIL_MAX) };
}

/** 关闭主槽：有 rail 则晋升首位，否则清空 */
export function closeMain(state: ReadingState): ReadingState {
  if (state.rail.length === 0) {
    return emptyReadingState();
  }
  const [promoted, ...rest] = state.rail;
  return { main: promoted ?? null, rail: rest };
}

export function closeRailItem(
  state: ReadingState,
  key: string,
): ReadingState {
  return {
    main: state.main,
    rail: state.rail.filter((entry) => readingSurfaceKey(entry) !== key),
  };
}

export function clearReadingState(): ReadingState {
  return emptyReadingState();
}
