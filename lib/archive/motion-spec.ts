export const motionSpec = {
  outputFadeMs: 320,
  outputDistancePx: 8,
  cardFadeMs: 420,
  cursorBlinkMs: 1120,
  /** 多条输出之间的短间隔，模拟 streaming output 的加载感（非真流式）。 */
  lineDelayMs: 48,
  scrollBehavior: "smooth" as const,
};

export type MotionLevel = 0 | 1 | 2;

export function resolveMotionLevel(): MotionLevel {
  return 1;
}
