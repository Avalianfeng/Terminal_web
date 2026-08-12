import { resolveResourceEmbed } from "./resource-present";
import type { ArchiveDocument } from "./types";

/** 允许自托管音频的 public 路径前缀（防 .. 与任意外链伪装）。 */
export const AUDIO_PUBLIC_PREFIX = "/resources/audio/";

export type ResourceMediaRender =
  | {
      kind: "iframe";
      embedUrl: string;
      iframeAllow: string;
    }
  | {
      kind: "audio";
      src: string;
    };

export function isSafeAudioPublicPath(src: string): boolean {
  if (!src.startsWith(AUDIO_PUBLIC_PREFIX)) return false;
  if (src.includes("..") || src.includes("\\")) return false;
  return true;
}

/** 自托管音频：resourceType audio + frontmatter audio + 安全路径。 */
export function resolveResourceAudio(document: ArchiveDocument): ResourceMediaRender | null {
  if (document.embed === false) return null;
  if (document.resourceType !== "audio") return null;
  const src = document.audioSrc?.trim();
  if (!src || !isSafeAudioPublicPath(src)) return null;
  return { kind: "audio", src };
}

/** media 区统一入口：音频优先，其次视频 iframe。 */
export function resolveResourceMedia(document: ArchiveDocument): ResourceMediaRender | null {
  const audio = resolveResourceAudio(document);
  if (audio) return audio;

  const embed = resolveResourceEmbed(document);
  if (!embed) return null;

  return {
    kind: "iframe",
    embedUrl: embed.embedUrl,
    iframeAllow: embed.iframeAllow,
  };
}
