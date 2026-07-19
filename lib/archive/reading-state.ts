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

/** 打开 / 换文 / 从 rail 提升（命令层仍只给一篇） */
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
