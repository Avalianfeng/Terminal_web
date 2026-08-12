export const motionSpec = {
  outputFadeMs: 420,
  outputDistancePx: 8,
  /** 阅读面板进场（自顶展开 + 淡入） */
  cardFadeMs: 720,
  /** 阅读面板退场（向上收起 + 淡出） */
  panelLeaveMs: 480,
  /** 旧主槽 demote 进 rail（scale + 位移；位移感最强，宜偏慢） */
  demoteMs: 520,
  /**
   * BGM 曲目列表开合：与阅读面板同源（进场 cardFadeMs / 退场 panelLeaveMs）。
   * 真高度仍用 grid 0fr→1fr；观感对齐 scaleY + 淡入淡出。
   */
  bgmExpandMs: 720,
  /** BGM 列表收起（对齐阅读面板退场） */
  bgmCollapseMs: 480,
  /** BGM 歌单覆盖层进场（略短于主列表，避免盖层拖沓） */
  bgmSwapMs: 420,
  cursorBlinkMs: 1120,
  /** 多条输出之间的短间隔，模拟 streaming output 的加载感（非真流式）。 */
  lineDelayMs: 64,
  scrollBehavior: "smooth" as ScrollBehavior,
};

export type MotionLevel = 0 | 1 | 2;

/** level 0：系统要求减少动态效果；1：默认克制动效。 */
export function resolveMotionLevel(): MotionLevel {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return 0;
  }
  return 1;
}

export function resolveScrollBehavior(level: MotionLevel = resolveMotionLevel()): ScrollBehavior {
  return level === 0 ? "auto" : motionSpec.scrollBehavior;
}

export function resolvePanelLeaveMs(level: MotionLevel = resolveMotionLevel()): number {
  return level === 0 ? 0 : motionSpec.panelLeaveMs;
}

export function resolvePanelEnterMs(level: MotionLevel = resolveMotionLevel()): number {
  return level === 0 ? 0 : motionSpec.cardFadeMs;
}

export function resolveDemoteMs(level: MotionLevel = resolveMotionLevel()): number {
  return level === 0 ? 0 : motionSpec.demoteMs;
}

export function resolveBgmExpandMs(level: MotionLevel = resolveMotionLevel()): number {
  // 与阅读面板进场同源，避免两套开合节奏
  return resolvePanelEnterMs(level);
}

export function resolveBgmCollapseMs(level: MotionLevel = resolveMotionLevel()): number {
  return resolvePanelLeaveMs(level);
}

export function resolveBgmSwapMs(level: MotionLevel = resolveMotionLevel()): number {
  return level === 0 ? 0 : motionSpec.bgmSwapMs;
}
