/** 音乐 BFF 仅 local-dev；公网闸门另开（ADR 0007 / 0009）。 */
export function isMusicBffEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
