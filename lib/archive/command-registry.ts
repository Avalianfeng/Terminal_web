/**
 * Terminal command registry — single authority for names, aliases,
 * help listing, and argument-completion policy. Handlers bind by `name`
 * in `commands.ts` (`runCommand`).
 */

export type ArgComplete = "none" | "dirs" | "all" | "cat" | "open";

export type HelpSection = "explore" | "read" | "session";

export type CommandSpec = {
  readonly name: string;
  readonly aliases?: readonly string[];
  /** Undefined → registered but omitted from `help` listing (e.g. `help`). */
  readonly section?: HelpSection;
  readonly usage: string;
  readonly argComplete: ArgComplete;
};

const HELP_SECTION_ORDER: readonly HelpSection[] = [
  "explore",
  "read",
  "session",
] as const;

/** Canonical command table (order within section = help order). */
export const COMMANDS: readonly CommandSpec[] = [
  {
    name: "help",
    aliases: ["?"],
    usage: "help                列出可用命令",
    argComplete: "none",
  },
  {
    name: "ls",
    aliases: ["dir", "ll"],
    section: "explore",
    usage: "ls [路径]          列出目录",
    argComplete: "all",
  },
  {
    name: "cd",
    section: "explore",
    usage: "cd [路径]          切换目录",
    argComplete: "dirs",
  },
  {
    name: "pwd",
    section: "explore",
    usage: "pwd                当前路径",
    argComplete: "none",
  },
  {
    name: "tree",
    section: "explore",
    usage: "tree [路径]        目录树",
    argComplete: "all",
  },
  {
    name: "find",
    section: "explore",
    usage: "find [词]          按路径 / 名称检索（可再 open）",
    argComplete: "none",
  },
  {
    name: "whoami",
    section: "explore",
    usage: "whoami             档案人物名",
    argComplete: "none",
  },
  {
    name: "status",
    section: "explore",
    usage: "status             档案计数与索引状态",
    argComplete: "none",
  },
  {
    name: "history",
    section: "explore",
    usage: "history            命令历史",
    argComplete: "none",
  },
  {
    name: "open",
    section: "read",
    usage: "open <目标…>       外区打开；多目标 / 目录 / * 批量",
    argComplete: "open",
  },
  {
    name: "cat",
    section: "read",
    usage: "cat <节点>         终端查看正文（Enter 一行 · q 退出）",
    argComplete: "cat",
  },
  {
    name: "timeline",
    section: "read",
    usage: "timeline           打开时间线",
    argComplete: "none",
  },
  {
    name: "search",
    section: "read",
    usage: "search <词>        搜正文 / 标题 / 标签",
    argComplete: "none",
  },
  {
    name: "projects",
    section: "read",
    usage: "projects           列出项目",
    argComplete: "none",
  },
  {
    name: "thoughts",
    section: "read",
    usage: "thoughts           列出思考",
    argComplete: "none",
  },
  {
    name: "resources",
    section: "read",
    usage: "resources          列出外部收藏",
    argComplete: "none",
  },
  {
    name: "about",
    section: "read",
    usage: "about              人物摘要（终端）",
    argComplete: "none",
  },
  {
    name: "clear",
    aliases: ["cls"],
    section: "session",
    usage: "clear              清空终端与阅读区",
    argComplete: "none",
  },
  {
    name: "edit",
    section: "session",
    usage: "edit <路径|slug>    编辑/新建文档（全屏 Markdown 原文）",
    argComplete: "open",
  },
    {
      name: "themes",
      section: "session",
      usage: "themes             主题试验台",
      argComplete: "none",
    },
    {
      name: "music",
      section: "session",
      usage: "music [ls|play|show|hide|…]  热队列 BGM",
      argComplete: "none",
    },
  ] as const;

const byName = new Map<string, CommandSpec>();
const aliasToName = new Map<string, string>();

for (const spec of COMMANDS) {
  if (byName.has(spec.name)) {
    throw new Error(`Duplicate command name: ${spec.name}`);
  }
  byName.set(spec.name, spec);
  aliasToName.set(spec.name, spec.name);
  for (const alias of spec.aliases ?? []) {
    if (aliasToName.has(alias)) {
      throw new Error(`Duplicate command alias: ${alias}`);
    }
    aliasToName.set(alias, spec.name);
  }
}

/** Resolve alias or primary name → primary command name. */
export function resolveAlias(command: string): string {
  return aliasToName.get(command) ?? command;
}

export function getCommand(name: string): CommandSpec | undefined {
  return byName.get(resolveAlias(name));
}

export function primaryCommandNames(): readonly string[] {
  return COMMANDS.map((spec) => spec.name);
}

/** Primary names + aliases (for Tab command completion). */
export function completableCommandNames(): readonly string[] {
  const names: string[] = [];
  for (const spec of COMMANDS) {
    names.push(spec.name);
    if (spec.aliases) names.push(...spec.aliases);
  }
  return names;
}

export function getArgComplete(command: string): ArgComplete {
  return getCommand(command)?.argComplete ?? "none";
}

export function isKnownCommandName(name: string): boolean {
  return byName.has(resolveAlias(name.trim().toLowerCase()));
}

const SECTION_TITLE_KEY: Record<HelpSection, "exploreTitle" | "readTitle" | "sessionTitle"> =
  {
    explore: "exploreTitle",
    read: "readTitle",
    session: "sessionTitle",
  };

export function helpSectionTitleKey(
  section: HelpSection,
): "exploreTitle" | "readTitle" | "sessionTitle" {
  return SECTION_TITLE_KEY[section];
}

export function helpSections(): readonly HelpSection[] {
  return HELP_SECTION_ORDER;
}

/** Usage lines for one help section (stable order from COMMANDS). */
export function helpUsagesForSection(section: HelpSection): readonly string[] {
  return COMMANDS.filter((spec) => spec.section === section).map(
    (spec) => spec.usage,
  );
}
