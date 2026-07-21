import type { ReactNode } from "react";

type ProseBlock =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "gap" }
  | { kind: "code"; lang: string; code: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0]!;
    const key = `${keyPrefix}-${part++}`;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="reading-panel__prose-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={key} className="reading-panel__prose-em">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="reading-panel__prose-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const href = linkMatch[2]!;
        const external = /^https?:\/\//i.test(href);
        nodes.push(
          <a
            key={key}
            href={href}
            className="reading-panel__prose-link"
            {...(external
              ? { target: "_blank", rel: "noreferrer noopener" }
              : {})}
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes.length > 0 ? nodes : [text];
}

/** 轻量块解析：标题 / 列表 / 引用 / 围栏代码 / 分隔线；不引入 markdown 依赖。 */
export function parseProseBlocks(body: string): ProseBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ProseBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "code", lang, code: codeLines.join("\n") });
      i += 1;
      continue;
    }

    if (!line.trim()) {
      blocks.push({ kind: "gap" });
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: line.slice(4) });
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3) });
      i += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ kind: "h1", text: line.slice(2) });
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.slice(2)];
      i += 1;
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        quoteLines.push((lines[i] ?? "").slice(2));
        i += 1;
      }
      blocks.push({ kind: "quote", text: quoteLines.join("\n") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    blocks.push({ kind: "p", text: line });
    i += 1;
  }

  return blocks;
}

export function MarkdownProse({ body }: { body: string }) {
  const blocks = parseProseBlocks(body);

  return (
    <div className="reading-panel__prose">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.kind) {
          case "h1":
            return (
              <h3 key={key} className="reading-panel__prose-h1">
                {renderInline(block.text, key)}
              </h3>
            );
          case "h2":
            return (
              <h4 key={key} className="reading-panel__prose-h2">
                {renderInline(block.text, key)}
              </h4>
            );
          case "h3":
            return (
              <h5 key={key} className="reading-panel__prose-h3">
                {renderInline(block.text, key)}
              </h5>
            );
          case "p":
            return (
              <p key={key} className="reading-panel__prose-p">
                {renderInline(block.text, key)}
              </p>
            );
          case "quote":
            return (
              <blockquote key={key} className="reading-panel__prose-quote">
                {block.text.split("\n").map((line, lineIndex) => (
                  <div key={`${key}-q-${lineIndex}`} className="reading-panel__prose-quote-line">
                    {renderInline(line, `${key}-q-${lineIndex}`)}
                  </div>
                ))}
              </blockquote>
            );
          case "hr":
            return <hr key={key} className="reading-panel__prose-hr" />;
          case "gap":
            return <div key={key} className="reading-panel__prose-gap" />;
          case "code":
            return (
              <pre key={key} className="reading-panel__prose-pre" data-lang={block.lang || undefined}>
                <code>{block.code}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={key} className="reading-panel__prose-ul">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-li-${itemIndex}`} className="reading-panel__prose-li">
                    {renderInline(item, `${key}-li-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="reading-panel__prose-ol">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-oli-${itemIndex}`} className="reading-panel__prose-li">
                    {renderInline(item, `${key}-oli-${itemIndex}`)}
                  </li>
                ))}
              </ol>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
