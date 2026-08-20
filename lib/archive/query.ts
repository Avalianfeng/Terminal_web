/**
 * 档案查询内核：终端 search/find 与 HTTP /api/v1/search|find 共用。
 */
import { toLocalKey, tryFromVfsPath } from "./document-ref";
import type { ArchiveDocument, ArchiveSnapshot } from "./types";
import { allSnapshotDocuments } from "./types";
import { createVfs, isDirectory, type VfsNode } from "./vfs";
import { normalizeFindNeedle } from "./target-resolver";

export class QueryError extends Error {
  readonly code: "bad_request";

  constructor(message: string) {
    super(message);
    this.name = "QueryError";
    this.code = "bad_request";
  }
}

export function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

/** 全文子串检索（title/summary/body/tags/slug/localKey）；空 q → QueryError。 */
export function searchDocuments(
  snapshot: ArchiveSnapshot,
  query: string,
): ArchiveDocument[] {
  const target = normalizeQuery(query);
  if (!target) {
    throw new QueryError("Missing or empty query parameter: q");
  }

  return allSnapshotDocuments(snapshot).filter((document) => {
    const haystack = normalizeQuery(
      [
        document.title,
        document.summary,
        document.body,
        document.tags.join(" "),
        document.ref.slug,
        toLocalKey(document.ref),
      ].join(" "),
    );
    return haystack.includes(target);
  });
}

/** 全部可打开节点：纯目录递归；复合节点 = 自身 + 子节点。 */
function collectOpenableNodes(node: VfsNode): VfsNode[] {
  if (node.type === "dir") {
    return (node.children ?? []).flatMap((child) => collectOpenableNodes(child));
  }
  if (isDirectory(node)) {
    return [
      node,
      ...(node.children ?? []).flatMap((child) => collectOpenableNodes(child)),
    ];
  }
  return [node];
}

function nodeLabel(node: VfsNode): string {
  if (node.type === "timeline") return "timeline";
  if (node.type === "person") return "person";
  return node.refSlug ?? node.name;
}

export type FindNodeResult = {
  path: string;
  type: VfsNode["type"];
  name: string;
  refSlug?: string;
  localKey?: string;
};

function toFindNode(node: VfsNode): FindNodeResult {
  const ref = tryFromVfsPath(node.path);
  return {
    path: node.path,
    type: node.type,
    name: node.name,
    ...(node.refSlug ? { refSlug: node.refSlug } : {}),
    ...(ref ? { localKey: toLocalKey(ref) } : {}),
  };
}

/** 路径/名称检索；不搜正文。空 q → 全部可 open 节点（与终端 find 一致）。 */
export function findNodes(
  snapshot: ArchiveSnapshot,
  query: string,
  cwd = "/",
): FindNodeResult[] {
  const root = createVfs(snapshot);
  const nodes = collectOpenableNodes(root);
  const target = normalizeFindNeedle(cwd, query);

  const hits = target
    ? nodes.filter((node) => {
        const haystack = normalizeQuery(
          [node.path, node.name, node.refSlug ?? "", nodeLabel(node)].join(" "),
        );
        return haystack.includes(target);
      })
    : nodes;

  return hits.map(toFindNode);
}
