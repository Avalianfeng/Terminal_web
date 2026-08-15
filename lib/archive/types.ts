export type ArchiveLink = {
  label: string;
  href: string;
};

export type PersonRecord = {
  name: string;
  description: string;
  currentFocus: string;
  created: string;
  links: ArchiveLink[];
};

import type { DocumentRef } from "./document-ref";

export type ResourceType = "article" | "video" | "audio" | "link";

export const RESOURCE_TYPES: readonly ResourceType[] = [
  "article",
  "video",
  "audio",
  "link",
];

export type ArchiveDocument = {
  ref: DocumentRef;
  title: string;
  summary: string;
  status?: string;
  body: string;
  tags: string[];
  /** resources 组：外站链接与类型（parseDocument 写入）。 */
  url?: string;
  resourceType?: ResourceType;
  platform?: string;
  embed?: boolean;
  /** resources 音频：自托管播放路径（public/ 下，如 /resources/audio/foo.mp3）。 */
  audioSrc?: string;
};

export type TimelineEntry = {
  date: string;
  title: string;
  body: string;
};

export type ArchiveSnapshot = {
  person: PersonRecord;
  projects: ArchiveDocument[];
  thoughts: ArchiveDocument[];
  resources: ArchiveDocument[];
  timeline: TimelineEntry[];
  generatedAt: string;
};

export type TerminalTone =
  | "prompt"
  | "user"
  | "host"
  | "command"
  | "normal"
  | "hint"
  | "error"
  | "success"
  | "path"
  | "muted";

export type TerminalToken = {
  text: string;
  tone?: TerminalTone;
};

export type TerminalLine = {
  tokens: TerminalToken[];
};

export type TerminalSession = {
  cwd: string;
  commandHistory: string[];
  selectedPath?: string;
};

export type TerminalEntry = {
  id: string;
  kind: "system" | "command" | "lines" | "status";
  lines: TerminalLine[];
};

/** 阅读表面内容。main 主槽 + rail 侧栏。 */
export type ReadingSurface =
  | {
      kind: "document";
      document: ArchiveDocument;
    }
  | {
      kind: "timeline";
      entries: TimelineEntry[];
    };

/** main=主槽文档流；rail=已打开侧栏。 */
export type ReadingLayout = "main" | "rail";

export function allSnapshotDocuments(snapshot: ArchiveSnapshot): ArchiveDocument[] {
  return [...snapshot.projects, ...snapshot.thoughts, ...snapshot.resources];
}

export function isResourceDocument(document: ArchiveDocument): boolean {
  return document.ref.group === "resources";
}
