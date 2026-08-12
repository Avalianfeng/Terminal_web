import { zhCN } from "@/lib/archive/i18n";
import { MarkdownProse } from "@/lib/archive/markdown-prose";
import {
  resourceOpenOriginalLabel,
} from "@/lib/archive/resource-present";
import { resolveResourceMedia } from "@/lib/archive/resource-media";
import type { ArchiveDocument, ResourceType } from "@/lib/archive/types";

const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  article: zhCN.reading.resourceTypeArticle,
  video: zhCN.reading.resourceTypeVideo,
  audio: zhCN.reading.resourceTypeAudio,
  link: zhCN.reading.resourceTypeLink,
};

function ResourceHeader({ document }: { document: ArchiveDocument }) {
  const typeLabel = document.resourceType
    ? RESOURCE_TYPE_LABEL[document.resourceType]
    : zhCN.reading.typeResource;

  return (
    <header className="reading-panel__resource-header">
      <div className="reading-panel__resource-meta">
        <span className="reading-panel__resource-type">{typeLabel}</span>
        {document.platform ? (
          <span className="reading-panel__resource-platform">{document.platform}</span>
        ) : null}
      </div>
      {document.url ? (
        <a
          href={document.url}
          className="reading-panel__resource-link"
          target="_blank"
          rel="noreferrer noopener"
        >
          {resourceOpenOriginalLabel(document.resourceType)}
        </a>
      ) : (
        <p className="reading-panel__resource-missing">{zhCN.reading.missingUrl}</p>
      )}
    </header>
  );
}

function ResourceMedia({ document }: { document: ArchiveDocument }) {
  const media = resolveResourceMedia(document);
  if (!media) {
    return null;
  }

  if (media.kind === "audio") {
    return (
      <section
        className="reading-panel__resource-media"
        aria-label={zhCN.reading.resourceAudioLabel}
      >
        <audio className="reading-panel__resource-audio" controls preload="metadata" src={media.src}>
          {zhCN.reading.resourceAudioFallback}
        </audio>
      </section>
    );
  }

  return (
    <section
      className="reading-panel__resource-media"
      aria-label={zhCN.reading.resourceEmbedLabel}
    >
      <div className="reading-panel__resource-embed">
        <iframe
          src={media.embedUrl}
          title={document.title}
          loading="lazy"
          allow={media.iframeAllow}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}

function ResourceNotes({ document }: { document: ArchiveDocument }) {
  if (!document.body.trim()) {
    return (
      <p className="reading-panel__resource-empty-notes">{zhCN.reading.emptyResourceNotes}</p>
    );
  }
  return (
    <section className="reading-panel__resource-notes" aria-label={zhCN.reading.resourceNotesLabel}>
      <h3 className="reading-panel__resource-notes-title">{zhCN.reading.resourceNotesTitle}</h3>
      <MarkdownProse body={document.body} />
    </section>
  );
}

/** 外部收藏三区：header / media / notes（ADR 0008）。 */
export function ResourceReadingBody({ document }: { document: ArchiveDocument }) {
  return (
    <div className="reading-panel__resource">
      <ResourceHeader document={document} />
      <ResourceMedia document={document} />
      <ResourceNotes document={document} />
    </div>
  );
}
