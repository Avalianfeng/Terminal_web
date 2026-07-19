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

export type ArchiveDocument = {
  slug: string;
  title: string;
  summary: string;
  status?: string;
  path: string;
  body: string;
  tags: string[];
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
  timeline: TimelineEntry[];
  generatedAt: string;
};

export type TerminalTone =
  | "prompt"
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
  kind: "system" | "command" | "lines";
  lines: TerminalLine[];
};

  /** 阅读表面内容。Phase 2：main 主槽 + rail 侧栏。 */
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
