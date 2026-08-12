import { zhCN } from "@/lib/archive/i18n";
import type {
  ArchiveDocument,
  ArchiveSnapshot,
  ReadingSurface,
} from "@/lib/archive/types";
import { allSnapshotDocuments, isResourceDocument } from "@/lib/archive/types";
import { refsEqual, toLocalKey, toVfsPath } from "@/lib/archive/document-ref";

/** rail 硬顶：超出丢最旧（数组末尾） */
export const RAIL_MAX = 8;

export function readingSurfaceKey(surface: ReadingSurface): string {
  return surface.kind === "document"
    ? toLocalKey(surface.document.ref)
    : "/timeline";
}

export type ReadingState = {
  main: ReadingSurface | null;
  rail: ReadingSurface[];
};

export function emptyReadingState(): ReadingState {
  return { main: null, rail: [] };
}

export function surfaceTitle(surface: ReadingSurface): string {
  return surface.kind === "document"
    ? surface.document.title
    : zhCN.labels.timeline;
}

export function surfacePath(surface: ReadingSurface): string {
  return surface.kind === "document"
    ? toVfsPath(surface.document.ref)
    : "/timeline";
}

export function surfaceMetaType(surface: ReadingSurface): string {
  if (surface.kind !== "document") {
    return zhCN.reading.typeTimeline;
  }
  if (isResourceDocument(surface.document)) {
    return zhCN.reading.typeResource;
  }
  return zhCN.reading.typeDocument;
}

function pushRail(rail: ReadingSurface[], item: ReadingSurface): ReadingSurface[] {
  const key = readingSurfaceKey(item);
  const filtered = rail.filter((entry) => readingSurfaceKey(entry) !== key);
  return [item, ...filtered].slice(0, RAIL_MAX);
}

/** 打开 / 换文 / 从 rail 提升 */
export function openReading(
  state: ReadingState,
  next: ReadingSurface,
): ReadingState {
  if (!state.main) {
    return { main: next, rail: state.rail };
  }

  const nextKey = readingSurfaceKey(next);
  const mainKey = readingSurfaceKey(state.main);

  if (nextKey === mainKey) {
    return { main: next, rail: state.rail };
  }

  const withoutNext = state.rail.filter(
    (entry) => readingSurfaceKey(entry) !== nextKey,
  );

  return {
    main: next,
    rail: pushRail(withoutNext, state.main),
  };
}

/**
 * 批量打开：`surfaces` 最后一项进 main，其余进 rail（去重保留最后一次）。
 * 调用方约定：多目标 open a b c → 按参数序；目录批量 → 把拟 main 放最后，或先排好再传入。
 */
export function openReadingMany(
  state: ReadingState,
  surfaces: ReadingSurface[],
): ReadingState {
  if (surfaces.length === 0) return state;
  if (surfaces.length === 1) {
    return openReading(state, surfaces[0]!);
  }

  const ordered: ReadingSurface[] = [];
  const seen = new Set<string>();
  for (let index = surfaces.length - 1; index >= 0; index -= 1) {
    const surface = surfaces[index]!;
    const key = readingSurfaceKey(surface);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.unshift(surface);
  }

  const main = ordered[ordered.length - 1]!;
  const batchRail = ordered.slice(0, -1);
  const mainKey = readingSurfaceKey(main);

  let rail = state.rail.filter((entry) => !seen.has(readingSurfaceKey(entry)));
  if (state.main) {
    const prevKey = readingSurfaceKey(state.main);
    if (prevKey !== mainKey && !seen.has(prevKey)) {
      rail = pushRail(rail, state.main);
    }
  }

  for (const item of batchRail) {
    rail = pushRail(rail, item);
  }

  return { main, rail: rail.slice(0, RAIL_MAX) };
}

/** 关闭主槽：有 rail 则晋升首位，否则清空 */
export function closeMain(state: ReadingState): ReadingState {
  if (state.rail.length === 0) {
    return emptyReadingState();
  }
  const [promoted, ...rest] = state.rail;
  return { main: promoted ?? null, rail: rest };
}

export function closeRailItem(
  state: ReadingState,
  key: string,
): ReadingState {
  return {
    main: state.main,
    rail: state.rail.filter((entry) => readingSurfaceKey(entry) !== key),
  };
}

/** 关闭某 DocumentRef 在 main+rail 中的所有副本（删除后）。 */
export function dismissDocumentByKey(
  state: ReadingState,
  key: string,
): ReadingState {
  let next = closeRailItem(state, key);
  if (next.main && readingSurfaceKey(next.main) === key) {
    next = closeMain(next);
  }
  return next;
}

/**
 * 用新 ArchiveDocument 替换 main/rail 中同 DocumentRef 的 surface（写后即时刷新）。
 * 若当前未打开该文，原样返回。
 */
export function replaceDocumentSurface(
  state: ReadingState,
  document: ArchiveDocument,
): ReadingState {
  const key = toLocalKey(document.ref);
  const nextSurface: ReadingSurface = { kind: "document", document };
  let touched = false;

  let main = state.main;
  if (main && readingSurfaceKey(main) === key) {
    main = nextSurface;
    touched = true;
  }

  const rail = state.rail.map((entry) => {
    if (readingSurfaceKey(entry) !== key) return entry;
    touched = true;
    return nextSurface;
  });

  return touched ? { main, rail } : state;
}

function documentContentEqual(a: ArchiveDocument, b: ArchiveDocument): boolean {
  return (
    refsEqual(a.ref, b.ref) &&
    a.title === b.title &&
    a.summary === b.summary &&
    a.status === b.status &&
    a.body === b.body &&
    a.tags.join("\0") === b.tags.join("\0")
  );
}

/**
 * 用最新 ArchiveSnapshot 重绑已打开的 document surfaces。
 * 快照中已不存在的文档会从 main/rail 移除（必要时晋升 rail）。
 */
export function reconcileReadingWithSnapshot(
  state: ReadingState,
  snapshot: ArchiveSnapshot,
): ReadingState {
  const documents = allSnapshotDocuments(snapshot);

  function refresh(surface: ReadingSurface): ReadingSurface | null {
    if (surface.kind !== "document") return surface;
    const found = documents.find((document) =>
      refsEqual(document.ref, surface.document.ref),
    );
    if (!found) return null;
    if (documentContentEqual(found, surface.document)) return surface;
    return { kind: "document", document: found };
  }

  const refreshedMain = state.main ? refresh(state.main) : null;
  const rail = state.rail
    .map((entry) => refresh(entry))
    .filter((entry): entry is ReadingSurface => entry !== null);

  if (state.main && refreshedMain === null) {
    return { main: rail[0] ?? null, rail: rail.slice(1) };
  }

  if (
    refreshedMain === state.main &&
    rail.length === state.rail.length &&
    rail.every((entry, index) => entry === state.rail[index])
  ) {
    return state;
  }

  return { main: refreshedMain, rail };
}

export function clearReadingState(): ReadingState {
  return emptyReadingState();
}
