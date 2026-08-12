/** @deprecated 请从 resource-present / resource-platforms 导入；保留 re-export 以免外部引用断裂。 */
export {
  buildBilibiliEmbedUrl,
  buildYouTubeEmbedUrl,
  extractBilibiliRef,
  extractYouTubeVideoId,
  EMBED_PLATFORMS,
  inferEmbedPlatform,
  isEmbedPlatform,
  resolvePlatformEmbed,
  type EmbedPlatformId,
  type ResolvedResourceEmbed,
} from "./resource-platforms";

export {
  resourceOpenOriginalLabel,
  resolveResourceEmbed,
  shouldEmbedResource,
} from "./resource-present";
