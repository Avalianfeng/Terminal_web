export type ContentGroup = "projects" | "thoughts" | "resources";

export const CONTENT_GROUPS: readonly ContentGroup[] = [
  "projects",
  "thoughts",
  "resources",
];

/** 错误提示用：`projects/<slug> or …`。 */
export function contentGroupLocalKeyHint(): string {
  return CONTENT_GROUPS.map((group) => `${group}/<slug>`).join(" or ");
}

/** slug 白名单：与现有内容命名一致，天然防路径穿越（单段）。 */
export const SLUG_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Windows 保留设备名（大小写不敏感）：段名命中会静默丢数据
 * （`nul.md` 写入 NUL 设备）或 EINVAL。段内无点，整段比对即可。
 */
const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 多段 slug 校验（ADR 0013）：`seg1/seg2`，每段 `[a-z0-9_-]+`，
 * 至少一段，无空段、无首尾斜杠、非 Windows 保留设备名。返回段数组；非法 → null。
 */
export function slugSegments(slug: string): string[] | null {
  if (!slug || slug.startsWith("/") || slug.endsWith("/")) return null;
  const segments = slug.split("/");
  if (
    segments.some(
      (segment) =>
        !SLUG_PATTERN.test(segment) || WINDOWS_RESERVED_SEGMENT.test(segment),
    )
  ) {
    return null;
  }
  return segments;
}

export function isValidSlug(slug: string): boolean {
  return slugSegments(slug) !== null;
}

/**
 * frontmatter 解析 / 序列化（读写路径共用，保证对称）。
 * 存储格式约定：`key: "value"` 每行一个字段，双引号包裹，`\"` 转义。
 * 刻意不用 YAML 库：与现有读路径保持同一真相源，避免两套转义规则。
 */

export type FrontmatterField = {
  key: string;
  value: string;
};

export type ParsedMarkdown = {
  /** frontmatter 字段（保序，含未知字段，写回不丢）。 */
  fields: FrontmatterField[];
  /** 正文（无 frontmatter 时即全文）。 */
  body: string;
  hasFrontmatter: boolean;
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function parseLine(line: string): FrontmatterField | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const key = line.slice(0, colon).trim();
  if (!key) return null;
  return { key, value: unquote(line.slice(colon + 1)) };
}

export function parseFrontmatter(markdown: string): ParsedMarkdown {
  if (!markdown.startsWith("---")) {
    return { fields: [], body: markdown.trim(), hasFrontmatter: false };
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return { fields: [], body: markdown.trim(), hasFrontmatter: false };
  }

  const raw = markdown.slice(3, end);
  const fields = raw
    .split("\n")
    .map((line) => parseLine(line))
    .filter((field): field is FrontmatterField => field !== null);

  return {
    fields,
    body: markdown.slice(end + 4).trim(),
    hasFrontmatter: true,
  };
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function serializeDocument(fields: FrontmatterField[], body: string): string {
  const header = fields.length > 0 ? `---\n${fields.map((field) => `${field.key}: ${quote(field.value)}`).join("\n")}\n---` : "";
  if (!header) return `${body.trim()}\n`;
  const trimmedBody = body.trim();
  return trimmedBody ? `${header}\n\n${trimmedBody}\n` : `${header}\n`;
}

/** 按存储格式生成完整文档（编辑面板新建时的空模板）。 */
export function emptyDocumentTemplate(slug: string): string {
  return serializeDocument(
    [
      { key: "title", value: slug },
      { key: "summary", value: "" },
      { key: "status", value: "" },
      { key: "tags", value: "" },
    ],
    "",
  );
}

/** resources 组新建模板（url + resourceType 必填）。 */
export function emptyResourceTemplate(slug: string): string {
  return serializeDocument(
    [
      { key: "title", value: slug },
      { key: "summary", value: "" },
      { key: "url", value: "https://" },
      { key: "resourceType", value: "article" },
      { key: "status", value: "" },
      { key: "tags", value: "" },
    ],
    "## 笔记\n\n",
  );
}

export function documentTemplateForGroup(group: ContentGroup, slug: string): string {
  return group === "resources" ? emptyResourceTemplate(slug) : emptyDocumentTemplate(slug);
}
