export const motionSpec = {
  outputFadeMs: 320,
  outputDistancePx: 8,
  /** 阅读面板进场（自顶展开 + 淡入） */
  cardFadeMs: 560,
  /** 阅读面板退场（向上收起 + 淡出） */
  panelLeaveMs: 360,
  cursorBlinkMs: 1120,
  /** 多条输出之间的短间隔，模拟 streaming output 的加载感（非真流式）。 */
  lineDelayMs: 48,
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
