import { resolvePlatformEmbed, isEmbedPlatform } from "./resource-platforms";
import { zhCN } from "./i18n";
import type { ArchiveDocument, ResourceType } from "./types";
import type { ResolvedResourceEmbed } from "./resource-platforms";

const OPEN_ORIGINAL_BY_TYPE: Record<ResourceType, string> = {
  article: zhCN.reading.openOriginalArticle,
  video: zhCN.reading.openOriginalVideo,
  audio: zhCN.reading.openOriginalAudio,
  link: zhCN.reading.openOriginalLink,
};

/** header 外链文案：按 resourceType 映射，而非一律「阅读原文」。 */
export function resourceOpenOriginalLabel(resourceType?: ResourceType): string {
  if (resourceType && resourceType in OPEN_ORIGINAL_BY_TYPE) {
    return OPEN_ORIGINAL_BY_TYPE[resourceType];
  }
  return zhCN.reading.openOriginalLink;
}

/** 默认：video + 已注册 platform 嵌入；article 不嵌；embed 显式覆盖。 */
export function shouldEmbedResource(document: ArchiveDocument): boolean {
  if (document.embed === false) return false;
  if (document.embed === true) {
    return isEmbedPlatform(document.platform);
  }
  return document.resourceType === "video" && isEmbedPlatform(document.platform);
}

export function resolveResourceEmbed(document: ArchiveDocument): ResolvedResourceEmbed | null {
  if (!document.url || !shouldEmbedResource(document)) {
    return null;
  }
  return resolvePlatformEmbed(document.platform, document.url);
}
