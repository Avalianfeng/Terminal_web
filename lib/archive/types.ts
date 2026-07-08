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

export type TerminalEntry =
  | {
      id: string;
      kind: "system" | "command" | "lines";
      lines: string[];
    }
  | {
      id: string;
      kind: "document";
      document: ArchiveDocument;
    }
  | {
      id: string;
      kind: "timeline";
      entries: TimelineEntry[];
    };
