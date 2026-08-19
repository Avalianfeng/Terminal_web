"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveXterm, type ArchiveXtermHandle } from "@/components/archive-xterm";
import { EditorPanel, type EditorTarget } from "@/components/editor-panel";
import { ReadingDemoteGhost } from "@/components/reading-demote-ghost";
import { ReadingPanel } from "@/components/reading-panel";
import { ReadingRail } from "@/components/reading-rail";
import { BgmBar, type BgmPlayback } from "@/components/bgm-bar";
import { completeInput } from "@/lib/archive/complete";
import { initialEntries, runCommand, splitVfsDirPath, cwdAfterRemoval } from "@/lib/archive/commands";
import { mkdirDir, rmdirDir } from "@/lib/archive/actions";
import { zhCN } from "@/lib/archive/i18n";
import {
  musicDownloadAborted,
  musicDownloadSkipped,
  musicError,
  musicNoPlaylist,
  musicNoTrack,
  musicPlaying,
  musicRemoved,
  musicSaved,
  musicSwitchedBrowse,
} from "@/lib/archive/cli-emit";
import {
  PlaybackSessionEngine,
  fetchSongProxyUrl,
} from "@/lib/music/playback-session";
import { nextSongIdForPrefetch, stepTrackIndex } from "@/lib/music/play-order";
import { resolvePlayTarget } from "@/lib/music/music-command";
import { firstTrackHit, findExactNamedTracks, formatTrackLabel } from "@/lib/music/track-resolve";
import type { LyricLine } from "@/lib/music/lyric";
import {
  motionSpec,
  resolveDemoteMs,
  resolveMotionLevel,
  resolvePanelEnterMs,
  resolvePanelLeaveMs,
  resolveScrollBehavior,
  type MotionLevel,
} from "@/lib/archive/motion-spec";
import { readingSurfaceKey } from "@/lib/archive/reading-state";
import {
  demoteDone,
  demoteGhost,
  emptyReadingSession,
  isLeaving,
  leaveDone,
  reconcileSession,
  replaceDocument,
  dismissDocument,
  dismissRail,
  requestClear,
  requestClose,
  requestPromote,
  swapSurfaces,
  type ReadingSession,
  type ReadingSessionResult,
} from "@/lib/archive/reading-session";
import { parseDocument } from "@/lib/archive/parse-document";
import { createSession, formatShellPromptTokens } from "@/lib/archive/vfs";
import { toLocalKey } from "@/lib/archive/document-ref";
import type {
  ArchiveSnapshot,
  ReadingSurface,
  TerminalEntry,
  TerminalSession,
} from "@/lib/archive/types";
import { IMPLICIT_OWNER, type SitePrincipal } from "@/lib/archive/site-principal";
import type { MusicPlaylistIndex } from "@/lib/music/playlist-types";
import {
  isLocalPlaylist,
  playlistsForTrackSearch,
} from "@/lib/music/playlist-project";
import {
  defaultPlaylist,
  stepPlaylist,
} from "@/lib/music/music-command";

const PLAYLIST_SYNC_INTERVAL_MS = 30 * 60 * 1000;

type ArchiveTerminalProps = {
  snapshot: ArchiveSnapshot;
  playlists?: MusicPlaylistIndex[];
  initialPrincipal?: SitePrincipal;
};

export function ArchiveTerminal({
  snapshot,
  playlists = [],
  initialPrincipal = IMPLICIT_OWNER,
}: ArchiveTerminalProps) {
  const router = useRouter();
  const [motionLevel, setMotionLevel] = useState<MotionLevel>(1);
  const bootEntries = useMemo(() => initialEntries(snapshot), [snapshot]);

  const [session, setSession] = useState<TerminalSession>(() => createSession());
  const [principal, setPrincipal] = useState<SitePrincipal>(initialPrincipal);
  const principalRef = useRef(principal);
  principalRef.current = principal;
  const [readingSession, setReadingSession] = useState<ReadingSession>(
    emptyReadingSession,
  );
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [completeCandidates, setCompleteCandidates] = useState<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const xtermRef = useRef<ArchiveXtermHandle>(null);
  const terminalShellRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  const readingSessionRef = useRef(readingSession);
  const editorTargetRef = useRef<EditorTarget | null>(null);
  const fullscreenRef = useRef(fullscreen);
  const [hydratedById, setHydratedById] = useState<
    Record<string, MusicPlaylistIndex>
  >({});
  const playlistCatalog = useMemo(
    () =>
      playlists.map((item) => {
        if (item.tracks.length > 0) return item;
        return hydratedById[item.neteasePlaylistId] ?? item;
      }),
    [playlists, hydratedById],
  );
  const playlistsRef = useRef(playlistCatalog);
  playlistsRef.current = playlistCatalog;
  const [bgm, setBgm] = useState<BgmPlayback | null>(null);
  const [bgmSrc, setBgmSrc] = useState<string | null>(null);
  const [playGeneration, setPlayGeneration] = useState(0);
  const bgmRef = useRef(bgm);
  bgmRef.current = bgm;
  const bgmSrcRef = useRef(bgmSrc);
  bgmSrcRef.current = bgmSrc;
  const hydrateRequestRef = useRef(0);
  const downloadQueueRef = useRef<{
    queries: string[];
    index: number;
    pending: { id: string; label: string; name: string } | null;
  } | null>(null);
  const playbackEngineRef = useRef<PlaybackSessionEngine | null>(null);
  if (!playbackEngineRef.current) {
    playbackEngineRef.current = new PlaybackSessionEngine({
      resolveUrl: fetchSongProxyUrl,
    });
  }

  // 事件回调与子组件闭包都在提交后读取这些 ref；用效果同步保证读到最新值
  useEffect(() => {
    sessionRef.current = session;
    readingSessionRef.current = readingSession;
    fullscreenRef.current = fullscreen;
  }, [session, readingSession, fullscreen]);

  useEffect(() => {
    let cancelled = false;

    async function syncCatalog() {
      try {
        const statusRes = await fetch("/api/music/login/status");
        const status = (await statusRes.json()) as { loggedIn?: boolean };
        if (!status.loggedIn || cancelled) return;

        const res = await fetch("/api/music/playlists/sync", { method: "POST" });
        const body = (await res.json()) as { ok?: boolean };
        if (!body.ok || cancelled) return;
        router.refresh();
      } catch {
        // 背景同步失败不打扰终端
      }
    }

    void syncCatalog();
    const timer = window.setInterval(() => {
      void syncCatalog();
    }, PLAYLIST_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  /** After router.refresh(), rebind open document surfaces from the new snapshot. */
  useEffect(() => {
    const result = reconcileSession(readingSessionRef.current, snapshot);
    if (result.session === readingSessionRef.current) return;
    applySessionResult(result);
    // applySessionResult closes over motion/focus helpers; snapshot is the intentional trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref-driven apply on snapshot change only
  }, [snapshot]);

  useEffect(() => {
    // 动效级别只能客户端读取（prefers-reduced-motion）；挂载后同步，避免 SSR 水合分叉
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time client-only bootstrap
    setMotionLevel(resolveMotionLevel());
  }, []);

  useEffect(() => {
    if (completeCandidates.length === 0) return;
    xtermRef.current?.relayout();
  }, [completeCandidates.length]);

  useEffect(() => {
    xtermRef.current?.relayout();
    if (!fullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen, motionLevel]);

  /** 焦点不在 xterm 时仍可用 Esc 退出 fullscreen（阅读面板优先由自身处理 Esc） */
  useEffect(() => {
    if (!fullscreen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (readingSessionRef.current.reading.main) return;
      event.preventDefault();
      setFullscreen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  function toggleFullscreen() {
    setFullscreen((current) => !current);
  }

  function exitFullscreen() {
    if (fullscreenRef.current) {
      setFullscreen(false);
    }
  }

  function revealTerminal() {
    terminalShellRef.current?.scrollIntoView({
      behavior: resolveScrollBehavior(motionLevel),
      block: "start",
      inline: "nearest",
    });
    xtermRef.current?.focus({ preventScroll: true });
  }

  function applySessionResult(result: ReadingSessionResult) {
    readingSessionRef.current = result.session;
    setReadingSession(result.session);
    for (const effect of result.effects) {
      if (effect === "focusTerminal") {
        revealTerminal();
      }
    }
  }

  function animateLeave() {
    return resolvePanelLeaveMs(motionLevel) > 0;
  }

  function animateDemote() {
    return resolveDemoteMs(motionLevel) > 0;
  }

  function closeReading() {
    applySessionResult(
      requestClose(readingSessionRef.current, {
        animateLeave: animateLeave(),
      }),
    );
  }

  function finishLeave() {
    applySessionResult(leaveDone(readingSessionRef.current));
  }

  /** Phase 2b：有旧主槽且换文时，幽灵 demote + 新主槽 Phase 1 进场并行 */
  function swapReading(surfaces: ReadingSurface[]) {
    applySessionResult(
      swapSurfaces(readingSessionRef.current, surfaces, {
        animateDemote: animateDemote(),
      }),
    );
  }

  function applyReading(next: ReadingSurface | ReadingSurface[] | null) {
    if (next === null) {
      applySessionResult(
        requestClear(readingSessionRef.current, {
          animateLeave: animateLeave(),
        }),
      );
      return;
    }

    // 全屏沉浸让位于 Dual Phase：阅读纸面需要浅色外区
    exitFullscreen();
    swapReading(Array.isArray(next) ? next : [next]);
  }

  function promoteFromRail(surface: ReadingSurface) {
    applySessionResult(
      requestPromote(readingSessionRef.current, surface, {
        animateDemote: animateDemote(),
      }),
    );
  }

  function dismissRailItem(key: string) {
    applySessionResult(dismissRail(readingSessionRef.current, key));
  }

  /** 编辑面板关闭：保存则即时刷新已打开阅读面；删除则关掉该文；并 refresh 快照。 */
  function handleEditorDone(result: {
    saved: boolean;
    deleted: boolean;
    raw?: string;
  }) {
    const target = editorTargetRef.current;
    editorTargetRef.current = null;
    setEditorTarget(null);

    if (result.deleted && target) {
      applySessionResult(
        dismissDocument(readingSessionRef.current, toLocalKey(target.ref)),
      );
      router.refresh();
    } else if (result.saved && target && result.raw) {
      const document = parseDocument(
        target.ref.group,
        target.ref.slug,
        result.raw,
      );
      applySessionResult(replaceDocument(readingSessionRef.current, document));
      router.refresh();
    } else if (result.saved || result.deleted) {
      router.refresh();
    } else if (target && !target.exists) {
      // 新建文档未保存即关闭：终端注明，避免「意外创建」的错觉（docs/18 §6）
      xtermRef.current?.addEntries([
        {
          id: `editor-unsaved-${Date.now()}`,
          kind: "system",
          lines: [
            {
              tokens: [
                { text: `${zhCN.editor.unsavedNote}: `, tone: "hint" },
                { text: toLocalKey(target.ref), tone: "path" },
              ],
            },
          ],
        },
      ]);
    }
    revealTerminal();
  }

  async function loadBgmTrack(
    playback: BgmPlayback,
    skips = 0,
    generation?: number,
    bypassCache = false,
  ) {
    const engine = playbackEngineRef.current!;
    const gen = generation ?? engine.currentGeneration();
    const now = playback.now;
    const track = now?.tracks[now.index];
    if (
      !now ||
      !track ||
      now.tracks.length === 0 ||
      skips > now.tracks.length
    ) {
      if (engine.isCurrent(gen)) setBgmSrc(null);
      return;
    }

    const result = await engine.loadTrack(String(track.id), gen, {
      prefetchNextId: nextSongIdForPrefetch(
        now.tracks,
        now.index,
        playback.shuffle ? "shuffle" : "sequential",
      ),
      bypassCache,
    });

    if (result.kind === "aborted" || !engine.isCurrent(gen)) return;

    if (result.kind === "unplayable" || result.kind === "empty") {
      if (result.kind === "empty") {
        setBgmSrc(null);
        return;
      }
      const nextIndex = stepTrackIndex(
        now.tracks.length,
        now.index,
        1,
        playback.shuffle ? "shuffle" : "sequential",
      );
      const nextNow = {
        ...now,
        index: nextIndex,
      };
      const next: BgmPlayback = {
        ...playback,
        status: zhCN.music.unplayable,
        now: nextNow,
      };
      setPlayback(next);
      await loadBgmTrack(next, skips + 1, gen);
      return;
    }

    setBgmSrc(result.proxyUrl);
  }

  /** 切歌：抬世代 Abort + 清 src 停声，再取址（命中预取则秒切）。 */
  async function jumpBgm(
    current: BgmPlayback,
    queue: {
      playlistId: string;
      playlistName: string;
      tracks: BgmPlayback["tracks"];
    },
    index: number,
    options: {
      paused?: boolean;
      bypassCache?: boolean;
      browse?: Partial<BgmPlayback>;
    } = {},
  ) {
    const engine = playbackEngineRef.current!;
    const gen = engine.beginJump();
    setPlayGeneration(gen);
    const next: BgmPlayback = {
      ...current,
      ...options.browse,
      status: "",
      now: {
        playlistId: queue.playlistId,
        playlistName: queue.playlistName,
        tracks: queue.tracks,
        index,
        paused: options.paused ?? false,
      },
    };
    setBgmSrc(null);
    setPlayback(next);
    await loadBgmTrack(next, 0, gen, options.bypassCache === true);
  }

  /** CDN / 代理失败：作废缓存并同曲重取。 */
  function handleBgmSrcError() {
    const current = bgmRef.current;
    const now = current?.now;
    if (!current || !now) return;
    const track = now.tracks[now.index];
    if (!track) return;
    playbackEngineRef.current?.invalidate(String(track.id));
    void jumpBgm(current, now, now.index, {
      paused: now.paused,
      bypassCache: true,
    });
  }

  function stepBgm(delta: number) {
    const current = bgmRef.current;
    const now = current?.now;
    if (!current || !now || now.tracks.length === 0) return;
    const index = stepTrackIndex(
      now.tracks.length,
      now.index,
      delta,
      current.shuffle ? "shuffle" : "sequential",
    );
    void jumpBgm(current, now, index);
  }

  function toggleShuffle(force?: boolean) {
    const current = bgmRef.current;
    if (!current) return false;
    const shuffle = force ?? !current.shuffle;
    setPlayback({ ...current, shuffle });
    return shuffle;
  }

  function finishDemote() {
    applySessionResult(demoteDone(readingSessionRef.current));
  }

  function playbackFromPlaylist(
    playlist: MusicPlaylistIndex,
    extras: Partial<BgmPlayback> = {},
  ): BgmPlayback {
    return {
      playlistId: playlist.neteasePlaylistId,
      playlistName: playlist.name,
      tracks: playlist.tracks,
      trackCount: playlist.trackCount ?? playlist.tracks.length,
      status: "",
      hidden: false,
      queueOpen: false,
      shuffle: bgmRef.current?.shuffle ?? false,
      now: null,
      ...extras,
    };
  }

  function setPlayback(
    next:
      | BgmPlayback
      | null
      | ((prev: BgmPlayback | null) => BgmPlayback | null),
  ) {
    const resolved = typeof next === "function" ? next(bgmRef.current) : next;
    bgmRef.current = resolved;
    setBgm(resolved);
  }

  async function hydratePlaylist(
    playlist: MusicPlaylistIndex,
  ): Promise<MusicPlaylistIndex> {
    if (isLocalPlaylist(playlist) || playlist.tracks.length > 0) return playlist;
    if (principalRef.current.role !== "owner") return playlist;
    try {
      const res = await fetch(
        `/api/music/playlist/tracks?playlistId=${encodeURIComponent(playlist.neteasePlaylistId)}`,
      );
      const body = (await res.json()) as {
        ok?: boolean;
        tracks?: MusicPlaylistIndex["tracks"];
        name?: string;
      };
      if (!body.ok || !Array.isArray(body.tracks)) return playlist;
      const hydrated: MusicPlaylistIndex = {
        ...playlist,
        name: body.name ?? playlist.name,
        tracks: body.tracks,
        trackCount: body.tracks.length,
      };
      setHydratedById((current) => ({
        ...current,
        [hydrated.neteasePlaylistId]: hydrated,
      }));
      return hydrated;
    } catch {
      return playlist;
    }
  }

  async function ensurePlaylistTracks(
    playlist: MusicPlaylistIndex,
  ): Promise<MusicPlaylistIndex> {
    if (playlist.tracks.length > 0) return playlist;

    const requestId = ++hydrateRequestRef.current;
    setPlayback((prev) => {
      if (!prev || prev.playlistId !== playlist.neteasePlaylistId) return prev;
      return { ...prev, tracksLoading: true };
    });

    try {
      const loaded = await hydratePlaylist(playlist);
      if (requestId !== hydrateRequestRef.current) return loaded;

      setPlayback((prev) => {
        if (!prev || prev.playlistId !== loaded.neteasePlaylistId) return prev;
        const next: BgmPlayback = {
          ...prev,
          tracks: loaded.tracks,
          trackCount: loaded.trackCount ?? loaded.tracks.length,
          tracksLoading: false,
        };
        if (prev.now?.playlistId === loaded.neteasePlaylistId) {
          next.now = { ...prev.now, tracks: loaded.tracks };
        }
        return next;
      });
      return loaded;
    } catch {
      if (requestId === hydrateRequestRef.current) {
        setPlayback((prev) =>
          prev && prev.playlistId === playlist.neteasePlaylistId
            ? { ...prev, tracksLoading: false }
            : prev,
        );
      }
      return playlist;
    }
  }

  /** 只换浏览框；不打断当前曲目会话（不清 src / 不抬世代）。 */
  async function applyPlaylistWithHydration(
    nextPlaylist: MusicPlaylistIndex,
    keepQueueOpen?: boolean,
  ) {
    hydrateRequestRef.current += 1;
    applyPlaylist(nextPlaylist, keepQueueOpen);
    if (nextPlaylist.tracks.length === 0) {
      await ensurePlaylistTracks(nextPlaylist);
    }
  }

  /** 只换浏览框；保留 now + src。 */
  function applyPlaylist(nextPlaylist: MusicPlaylistIndex, keepQueueOpen?: boolean) {
    const current = bgmRef.current;
    setPlayback({
      playlistId: nextPlaylist.neteasePlaylistId,
      playlistName: nextPlaylist.name,
      tracks: nextPlaylist.tracks,
      trackCount: nextPlaylist.trackCount ?? nextPlaylist.tracks.length,
      status: current?.status ?? "",
      hidden: false,
      queueOpen: keepQueueOpen ?? current?.queueOpen ?? true,
      tracksLoading: nextPlaylist.tracks.length === 0,
      shuffle: current?.shuffle ?? false,
      now: current?.now ?? null,
    });
  }

  function switchPlaylist(delta: number): string | null {
    const current = bgmRef.current;
    if (!current) return null;
    const nextPlaylist = stepPlaylist(
      playlistsRef.current,
      current.playlistId,
      delta,
    );
    if (!nextPlaylist || nextPlaylist.neteasePlaylistId === current.playlistId) {
      return null;
    }
    applyPlaylistWithHydration(nextPlaylist);
    return nextPlaylist.name;
  }

  function revealPlayer(openQueue: boolean) {
    const current = bgmRef.current;
    if (current) {
      setPlayback({
        ...current,
        hidden: false,
        queueOpen: openQueue ? true : current.queueOpen,
      });
      return true;
    }
    const fallback = defaultPlaylist(playlistsRef.current);
    if (!fallback) return false;
    setPlayback(
      playbackFromPlaylist(fallback, {
        hidden: false,
        queueOpen: openQueue,
        now: null,
      }),
    );
    return true;
  }

  /** 合并 SSR 目录与已 hydrate 缓存，供曲目扫描。 */
  function catalogWithHydration(): MusicPlaylistIndex[] {
    return playlistsRef.current.map(
      (item) => hydratedById[item.neteasePlaylistId] ?? item,
    );
  }

  async function hydrateAllStubs(): Promise<MusicPlaylistIndex[]> {
    const catalog = playlistsRef.current;
    const loaded = await Promise.all(
      catalog.map(async (item) => {
        const cached = hydratedById[item.neteasePlaylistId];
        if (cached?.tracks.length) return cached;
        if (item.tracks.length > 0) return item;
        return hydratePlaylist(item);
      }),
    );
    return loaded;
  }

  async function postSongCache(
    method: "POST" | "DELETE",
    id: string,
    title: string,
  ): Promise<TerminalEntry> {
    try {
      const response = await fetch("/api/music/song/download", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        saved?: number;
        removed?: number;
        message?: string;
        results?: Array<{ ok?: boolean; songId?: string; ext?: string }>;
      };
      if (body.ok === false) {
        return musicError(body.message?.trim() || "download failed");
      }
      router.refresh();
      if (method === "DELETE") {
        return musicRemoved(title);
      }
      const ext = body.results?.[0]?.ext ?? "mp3";
      return musicSaved(title, `${id}.${ext}`);
    } catch {
      return musicError("download failed");
    }
  }

  async function stepDownloadQueue(): Promise<{
    entries: TerminalEntry[];
    confirmPrompt?: string;
  }> {
    const queue = downloadQueueRef.current;
    const entries: TerminalEntry[] = [];
    if (!queue) return { entries };
    const ready = playlistsForTrackSearch(await hydrateAllStubs());
    while (queue.index < queue.queries.length) {
      const query = queue.queries[queue.index]!;
      const hit = firstTrackHit(ready, query);
      if (!hit) {
        entries.push(musicNoTrack(query));
        queue.index += 1;
        continue;
      }
      queue.pending = {
        id: String(hit.track.id),
        label: formatTrackLabel(hit.track),
        name: hit.track.name,
      };
      return {
        entries,
        confirmPrompt: zhCN.music.downloadConfirm.replace(
          "{label}",
          queue.pending.label,
        ),
      };
    }
    downloadQueueRef.current = null;
    return { entries };
  }

  async function startPlaylistAt(
    playlist: MusicPlaylistIndex,
    trackIndex: number,
  ) {
    const loaded =
      playlist.tracks.length > 0
        ? playlist
        : await ensurePlaylistTracks(playlist);
    const index = Math.max(
      0,
      Math.min(trackIndex, Math.max(0, loaded.tracks.length - 1)),
    );
    const now = {
      playlistId: loaded.neteasePlaylistId,
      playlistName: loaded.name,
      tracks: loaded.tracks,
      index,
      paused: false,
    };
    const playback = playbackFromPlaylist(loaded, {
      hidden: false,
      queueOpen: false,
      now,
    });
    const gen = playbackEngineRef.current!.beginJump();
    setPlayGeneration(gen);
    setBgmSrc(null);
    setPlayback(playback);
    await loadBgmTrack(playback, 0, gen);
  }

  async function fetchLyricLines(songId: number): Promise<LyricLine[]> {
    try {
      const res = await fetch(`/api/music/song/lyric?id=${songId}`);
      const body = (await res.json()) as {
        ok?: boolean;
        lines?: LyricLine[];
      };
      return body.ok && Array.isArray(body.lines) ? body.lines : [];
    } catch {
      return [];
    }
  }

  const panelEnterMs = resolvePanelEnterMs(motionLevel);
  const panelLeaveMs = resolvePanelLeaveMs(motionLevel);
  const demoteMs = resolveDemoteMs(motionLevel);
  const main = readingSession.reading.main;
  const leaving = isLeaving(readingSession);
  const demoting = demoteGhost(readingSession);
  const hasReading =
    Boolean(main) || readingSession.reading.rail.length > 0 || Boolean(demoting);
  const arrivingKey = demoting ? readingSurfaceKey(demoting) : null;

  return (
    <main
      className={`archive-workspace motion-level-${motionLevel}${
        fullscreen ? " is-terminal-fullscreen" : ""
      }`}
      style={
        {
          "--output-fade-ms": `${motionSpec.outputFadeMs}ms`,
          "--output-distance": `${motionSpec.outputDistancePx}px`,
          "--cursor-blink-ms": `${motionSpec.cursorBlinkMs}ms`,
          "--panel-fade-ms": `${panelEnterMs}ms`,
          "--panel-leave-ms": `${panelLeaveMs}ms`,
          "--panel-demote-ms": `${demoteMs}ms`,
        } as CSSProperties
      }
    >
      <div className="archive-workspace__stage">
        <div ref={terminalShellRef} className="terminal-mount">
        <section className="terminal-shell">
          <header className="terminal-shell__chrome">
            <div className="terminal-shell__brand">
              <p className="terminal-shell__title">{zhCN.shell.title}</p>
              <p className="terminal-shell__subtitle">{zhCN.shell.subtitle}</p>
            </div>
            <div className="terminal-shell__actions">
              <button
                type="button"
                className="terminal-shell__btn"
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
              >
                {fullscreen
                  ? zhCN.shell.fullscreenExit
                  : zhCN.shell.fullscreen}
              </button>
              <Link href="/themes" className="terminal-shell__btn">
                {zhCN.shell.themeLab}
              </Link>
            </div>
          </header>

          <div className="terminal-shell__body">
            <ArchiveXterm
              ref={xtermRef}
              bootEntries={bootEntries}
              lineDelayMs={
                motionLevel === 0 ? 0 : motionSpec.lineDelayMs
              }
              getPromptTokens={() =>
                formatShellPromptTokens(
                  sessionRef.current.cwd,
                  principalRef.current.role,
                )
              }
              getComplete={(input, cycle) =>
                completeInput(
                  input,
                  snapshot,
                  sessionRef.current.cwd,
                  cycle,
                  principalRef.current.role,
                )
              }
              onPassword={async (password) => {
                try {
                  const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password }),
                  });
                  const body = (await res.json()) as {
                    ok?: boolean;
                    role?: SitePrincipal["role"];
                    via?: SitePrincipal["via"];
                    message?: string;
                  };
                  if (!body.ok || !body.role) {
                    return {
                      entries: [
                        {
                          id: `auth-fail-${Date.now()}`,
                          kind: "system" as const,
                          lines: [
                            {
                              tokens: [
                                {
                                  text: body.message ?? zhCN.auth.loginFail,
                                  tone: "error" as const,
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    };
                  }
                  const next: SitePrincipal = {
                    role: body.role,
                    via: body.via === "session" ? "session" : "implicit-local-dev",
                  };
                  principalRef.current = next;
                  setPrincipal(next);
                  xtermRef.current?.refreshPrompt();
                  router.refresh();
                  return {
                    entries: [
                      {
                        id: `auth-ok-${Date.now()}`,
                        kind: "system" as const,
                        lines: [
                          {
                            tokens: [
                              { text: zhCN.auth.loginOk, tone: "success" as const },
                            ],
                          },
                        ],
                      },
                    ],
                  };
                } catch {
                  return {
                    entries: [
                      {
                        id: `auth-err-${Date.now()}`,
                        kind: "system" as const,
                        lines: [
                          {
                            tokens: [
                              {
                                text: zhCN.auth.loginFail,
                                tone: "error" as const,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  };
                }
              }}
              onCommand={async (command) => {
                const result = runCommand(
                  snapshot,
                  command,
                  sessionRef.current,
                  playlistsRef.current,
                  principalRef.current,
                );
                sessionRef.current = result.session;
                setSession(result.session);

                if (result.reading !== undefined) {
                  applyReading(result.reading);
                }
                if (result.edit) {
                  editorTargetRef.current = result.edit;
                  setEditorTarget(result.edit);
                }

                const extra: TerminalEntry[] = [];
                let confirmPrompt: string | undefined;
                if (result.music?.type === "play") {
                  await startPlaylistAt(
                    result.music.playlist,
                    result.music.trackIndex ?? 0,
                  );
                }
                if (result.music?.type === "play-search") {
                  const ready = playlistsForTrackSearch(await hydrateAllStubs());
                  const target = resolvePlayTarget(
                    playlistsRef.current,
                    result.music.query,
                    ready,
                    result.music.scope,
                  );
                  if (!target.ok) {
                    extra.push(
                      target.reason === "ambiguous"
                        ? musicError(
                            `ambiguous playlist matches '${result.music.query}'`,
                            target.matches.map((item) => item.name).join("、"),
                          )
                        : result.music.scope === "playlist"
                          ? musicNoPlaylist(result.music.query)
                          : musicNoTrack(result.music.query),
                    );
                  } else if (target.kind === "playlist") {
                    extra.push(...musicPlaying(target.playlist.name));
                    await startPlaylistAt(target.playlist, 0);
                  } else {
                    const { hit } = target;
                    extra.push(
                      ...musicPlaying(hit.track.name, hit.playlist.name),
                    );
                    await startPlaylistAt(hit.playlist, hit.index);
                  }
                }
                if (result.music?.type === "lyric") {
                  const query = result.music.query.trim();
                  let songId: number | null = null;
                  let songLabel = "";
                  if (!query) {
                    const now = bgmRef.current?.now;
                    const track = now?.tracks[now.index];
                    if (!track) {
                      extra.push({
                        id: `music-lyric-none-${Date.now()}`,
                        kind: "system",
                        lines: [
                          {
                            tokens: [
                              { text: zhCN.music.lyricNone, tone: "hint" },
                            ],
                          },
                        ],
                      });
                    } else {
                      songId = track.id;
                      songLabel = track.name;
                    }
                  } else {
                    const ready = playlistsForTrackSearch(await hydrateAllStubs());
                    const hit =
                      firstTrackHit(ready, query) ??
                      firstTrackHit(playlistsForTrackSearch(catalogWithHydration()), query);
                    if (!hit) {
                      extra.push({
                        id: `music-lyric-miss-${Date.now()}`,
                        kind: "system",
                        lines: [
                          {
                            tokens: [
                              { text: zhCN.music.trackNotFound, tone: "error" },
                            ],
                          },
                        ],
                      });
                    } else {
                      songId = hit.track.id;
                      songLabel = hit.track.name;
                    }
                  }
                  if (songId != null) {
                    const lines = await fetchLyricLines(songId);
                    if (lines.length === 0) {
                      extra.push({
                        id: `music-lyric-empty-${Date.now()}`,
                        kind: "system",
                        lines: [
                          {
                            tokens: [
                              {
                                text: `${zhCN.music.lyricHeader}${songLabel}`,
                                tone: "muted",
                              },
                            ],
                          },
                          {
                            tokens: [
                              { text: zhCN.music.lyricEmpty, tone: "hint" },
                            ],
                          },
                        ],
                      });
                    } else {
                      extra.push({
                        id: `music-lyric-${Date.now()}`,
                        kind: "system",
                        lines: [
                          {
                            tokens: [
                              {
                                text: `${zhCN.music.lyricHeader}${songLabel}`,
                                tone: "success",
                              },
                            ],
                          },
                          ...lines.map((line) => ({
                            tokens: [{ text: line.text, tone: "normal" as const }],
                          })),
                        ],
                      });
                    }
                  }
                }
                if (result.music?.type === "shuffle") {
                  const current = bgmRef.current;
                  if (!current) {
                    if (!revealPlayer(false)) {
                      extra.push({
                        id: `music-shuffle-none-${Date.now()}`,
                        kind: "system",
                        lines: [
                          {
                            tokens: [
                              {
                                text: zhCN.music.needShowSession,
                                tone: "error",
                              },
                            ],
                          },
                        ],
                      });
                    }
                  }
                  const mode = result.music.mode;
                  const next =
                    mode === "on"
                      ? true
                      : mode === "off"
                        ? false
                        : !(bgmRef.current?.shuffle ?? false);
                  if (bgmRef.current) {
                    toggleShuffle(next);
                    extra.push({
                      id: `music-shuffle-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            {
                              text: next
                                ? zhCN.music.shuffleOn
                                : zhCN.music.shuffleOff,
                              tone: "hint",
                            },
                          ],
                        },
                      ],
                    });
                  }
                }
                if (result.music?.type === "show") {
                  if (!revealPlayer(true)) {
                    extra.push({
                      id: `music-show-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            {
                              text: zhCN.music.needShowSession,
                              tone: "error",
                            },
                          ],
                        },
                      ],
                    });
                  } else {
                    const current = bgmRef.current;
                    const stub = playlistsRef.current.find(
                      (item) => item.neteasePlaylistId === current?.playlistId,
                    );
                    if (stub && stub.tracks.length === 0) {
                      await ensurePlaylistTracks(stub);
                    }
                  }
                }
                if (result.music?.type === "hide") {
                  if (bgmRef.current) {
                    setPlayback({
                      ...bgmRef.current,
                      hidden: true,
                      queueOpen: false,
                    });
                  }
                }
                if (
                  result.music?.type === "playlist-next" ||
                  result.music?.type === "playlist-prev"
                ) {
                  if (!bgmRef.current && !revealPlayer(true)) {
                    extra.push(musicError("no playlist session"));
                  } else {
                    const name = switchPlaylist(
                      result.music.type === "playlist-next" ? 1 : -1,
                    );
                    if (name) {
                      extra.push(musicSwitchedBrowse(name));
                    } else if (playlistsRef.current.length <= 1) {
                      extra.push(musicError("no playlist session"));
                    }
                  }
                }
                if (result.music?.type === "playlist-use") {
                  await applyPlaylistWithHydration(result.music.playlist, true);
                }
                if (result.music?.type === "sync") {
                  try {
                    const res = await fetch("/api/music/playlists/sync", {
                      method: "POST",
                    });
                    const body = (await res.json()) as {
                      ok?: boolean;
                      synced?: number;
                      pruned?: number;
                      message?: string;
                    };
                    extra.push({
                      id: `music-sync-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            {
                              text: body.ok
                                ? `${zhCN.music.synced}（${body.synced ?? 0}${body.pruned ? `，清理 ${body.pruned} 个孤儿 stub` : ""}）`
                                : `${zhCN.music.syncFailed}：${body.message ?? ""}`,
                              tone: body.ok ? "success" : "error",
                            },
                          ],
                        },
                      ],
                    });
                    if (body.ok) router.refresh();
                  } catch {
                    extra.push({
                      id: `music-sync-err-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            { text: zhCN.music.syncFailed, tone: "error" },
                          ],
                        },
                      ],
                    });
                  }
                }
                if (result.music?.type === "import") {
                  try {
                    const response = await fetch("/api/music/playlist/import", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: result.music.url }),
                    });
                    const body = (await response.json()) as {
                      ok?: boolean;
                      name?: string;
                      trackCount?: number;
                      message?: string;
                    };
                    extra.push({
                      id: `music-import-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            {
                              text: body.ok
                                ? `${zhCN.music.imported}：${body.name}（${body.trackCount}${zhCN.music.trackUnit}）`
                                : `${zhCN.music.importFailed}：${body.message ?? ""}`,
                              tone: body.ok ? "success" : "error",
                            },
                          ],
                        },
                      ],
                    });
                    if (body.ok) router.refresh();
                  } catch {
                    extra.push({
                      id: `music-import-err-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            { text: zhCN.music.importFailed, tone: "error" },
                          ],
                        },
                      ],
                    });
                  }
                }
                if (result.music?.type === "download-now") {
                  const track =
                    bgmRef.current?.now?.tracks[bgmRef.current.now.index];
                  if (!track) {
                    extra.push(musicError("no current track to download"));
                  } else {
                    extra.push(
                      await postSongCache(
                        "POST",
                        String(track.id),
                        track.name,
                      ),
                    );
                  }
                }
                if (result.music?.type === "download-queries") {
                  downloadQueueRef.current = {
                    queries: result.music.queries,
                    index: 0,
                    pending: null,
                  };
                  const stepped = await stepDownloadQueue();
                  extra.push(...stepped.entries);
                  confirmPrompt = stepped.confirmPrompt;
                }
                if (result.music?.type === "delete") {
                  const local = playlistsRef.current.find(isLocalPlaylist);
                  const hits = findExactNamedTracks(
                    local ? [local] : [],
                    result.music.name,
                  );
                  if (hits.length === 0) {
                    extra.push(
                      musicError(
                        `no local track named '${result.music.name}'`,
                      ),
                    );
                  } else if (hits.length > 1) {
                    extra.push(
                      musicError(
                        `ambiguous local title '${result.music.name}'`,
                      ),
                    );
                  } else {
                    extra.push(
                      await postSongCache(
                        "DELETE",
                        String(hits[0]!.track.id),
                        hits[0]!.track.name,
                      ),
                    );
                  }
                }
                if (result.music?.type === "stop") {
                  const gen = playbackEngineRef.current!.beginJump();
                  setPlayGeneration(gen);
                  setPlayback(null);
                  setBgmSrc(null);
                }
                if (result.music?.type === "pause") {
                  const current = bgmRef.current;
                  if (!current?.now) {
                    extra.push({
                      id: `music-pause-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            { text: zhCN.music.nothingToPause, tone: "error" },
                          ],
                        },
                      ],
                    });
                  } else {
                    setPlayback({
                      ...current,
                      now: { ...current.now, paused: true },
                    });
                    extra.push({
                      id: `music-pause-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [{ text: zhCN.music.paused, tone: "hint" }],
                        },
                      ],
                    });
                  }
                }
                if (result.music?.type === "resume") {
                  const current = bgmRef.current;
                  if (!current?.now) {
                    extra.push({
                      id: `music-resume-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            { text: zhCN.music.nothingToResume, tone: "error" },
                          ],
                        },
                      ],
                    });
                  } else {
                    const next = {
                      ...current,
                      hidden: false,
                      now: { ...current.now, paused: false },
                    };
                    setPlayback(next);
                    if (!bgmSrcRef.current) {
                      await loadBgmTrack(
                        next,
                        0,
                        playbackEngineRef.current!.currentGeneration(),
                      );
                    }
                    extra.push({
                      id: `music-resume-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [{ text: zhCN.music.resumed, tone: "hint" }],
                        },
                      ],
                    });
                  }
                }
                if (result.music?.type === "next") {
                  stepBgm(1);
                }
                if (result.music?.type === "prev") {
                  stepBgm(-1);
                }

                if (result.fs) {
                  const parsed = splitVfsDirPath(result.fs.path);
                  const group = parsed?.group ?? "";
                  const dirPath = parsed?.segments.join("/") ?? "";
                  const fsLine = (text: string, tone: "success" | "error" | "hint" = "success") => ({
                    id: `fs-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    kind: "system" as const,
                    lines: [{ tokens: [{ text, tone }] }],
                  });
                  try {
                    if (result.fs.kind === "mkdir") {
                      const outcome = await mkdirDir(group, dirPath);
                      extra.push(
                        outcome.ok
                          ? fsLine(
                              "dirCreated" in outcome && outcome.dirCreated
                                ? `${zhCN.fs.mkdirCreated}: ${result.fs.path}`
                                : `${zhCN.fs.mkdirExists}: ${result.fs.path}`,
                            )
                          : fsLine(outcome.message, "error"),
                      );
                    } else {
                      const outcome = await rmdirDir(group, dirPath);
                      extra.push(
                        outcome.ok
                          ? fsLine(`${zhCN.fs.rmdirRemoved}: ${result.fs.path}`)
                          : fsLine(
                              outcome.error === "not_found"
                                ? `${zhCN.fs.rmdirMissing}: ${result.fs.path}`
                                : outcome.message,
                              "error",
                            ),
                      );
                      if (outcome.ok) {
                        // 自洽：cwd 在被删目录内 → 回退到父级，避免下一条命令 invalidPath
                        const rebased = cwdAfterRemoval(
                          sessionRef.current.cwd,
                          result.fs.path,
                        );
                        if (rebased !== sessionRef.current.cwd) {
                          sessionRef.current = {
                            ...sessionRef.current,
                            cwd: rebased,
                          };
                          setSession(sessionRef.current);
                          extra.push(
                            fsLine(`${zhCN.fs.cwdRebased}: ${rebased}`, "hint"),
                          );
                        }
                      }
                    }
                    router.refresh();
                  } catch {
                    extra.push(
                      fsLine(`${result.fs.kind} ${result.fs.path} 执行失败`, "error"),
                    );
                  }
                }

                if (result.auth?.kind === "logout") {
                  try {
                    const res = await fetch("/api/auth/logout", {
                      method: "POST",
                    });
                    const body = (await res.json()) as {
                      role?: SitePrincipal["role"];
                      via?: SitePrincipal["via"];
                    };
                    const next: SitePrincipal = {
                      role: body.role === "owner" ? "owner" : "visitor",
                      via:
                        body.via === "implicit-local-dev"
                          ? "implicit-local-dev"
                          : body.via === "session"
                            ? "session"
                            : "none",
                    };
                    principalRef.current = next;
                    setPrincipal(next);
                    extra.push({
                      id: `auth-out-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            { text: zhCN.auth.loggedOut, tone: "hint" },
                          ],
                        },
                      ],
                    });
                    xtermRef.current?.refreshPrompt();
                    router.refresh();
                  } catch {
                    extra.push({
                      id: `auth-out-err-${Date.now()}`,
                      kind: "system",
                      lines: [
                        {
                          tokens: [
                            { text: zhCN.auth.loginFail, tone: "error" },
                          ],
                        },
                      ],
                    });
                  }
                }

                return {
                  entries: [...result.entries, ...extra],
                  clear: result.clear,
                  pager: result.pager,
                  passwordPrompt: result.auth?.kind === "login",
                  confirmPrompt,
                };
              }}
              onConfirm={async (decision) => {
                const queue = downloadQueueRef.current;
                if (!queue) return { entries: [] };
                if (decision === "abort") {
                  downloadQueueRef.current = null;
                  return {
                    entries: [musicDownloadAborted()],
                  };
                }
                const entries: TerminalEntry[] = [];
                if (decision === "yes" && queue.pending) {
                  entries.push(
                    await postSongCache(
                      "POST",
                      queue.pending.id,
                      queue.pending.name,
                    ),
                  );
                } else {
                  entries.push(
                    musicDownloadSkipped(queue.pending?.label ?? ""),
                  );
                }
                queue.pending = null;
                queue.index += 1;
                const stepped = await stepDownloadQueue();
                return {
                  entries: [...entries, ...stepped.entries],
                  confirmPrompt: stepped.confirmPrompt,
                };
              }}
              onCandidatesChange={setCompleteCandidates}
              onEscape={() => {
                if (readingSessionRef.current.reading.main) {
                  closeReading();
                  return true;
                }
                if (fullscreenRef.current) {
                  setFullscreen(false);
                  return true;
                }
                return false;
              }}
            />

            {completeCandidates.length > 0 ? (
              <p className="terminal-shell__complete" aria-live="polite">
                <span className="terminal-shell__complete-label">
                  {zhCN.shell.completeHint}:{" "}
                </span>
                {completeCandidates.join("  ")}
                <span className="terminal-shell__complete-hint">
                  ({zhCN.shell.completeCycle})
                </span>
              </p>
            ) : null}
          </div>
        </section>

      <BgmBar
        playback={bgm}
        src={bgmSrc}
        playGeneration={playGeneration}
        playlists={playlistCatalog}
        onTogglePause={() => {
          const current = bgmRef.current;
          if (!current?.now) return;
          setPlayback({
            ...current,
            now: { ...current.now, paused: !current.now.paused },
          });
        }}
        onPrev={() => stepBgm(-1)}
        onNext={() => stepBgm(1)}
        onToggleShuffle={() => {
          toggleShuffle();
        }}
        onSelectPlaylist={(playlist) => {
          void applyPlaylistWithHydration(playlist, true);
        }}
        onSelectIndex={(index) => {
          const current = bgmRef.current;
          if (!current) return;
          void (async () => {
            const stub = playlistsRef.current.find(
              (item) => item.neteasePlaylistId === current.playlistId,
            );
            let tracks = current.tracks;
            let playlistName = current.playlistName;
            let playlistId = current.playlistId;
            if (stub) {
              const loaded =
                stub.tracks.length === 0
                  ? await ensurePlaylistTracks(stub)
                  : stub;
              tracks = loaded.tracks;
              playlistName = loaded.name;
              playlistId = loaded.neteasePlaylistId;
            }
            const browse = bgmRef.current ?? current;
            await jumpBgm(
              browse,
              { playlistId, playlistName, tracks },
              index,
              {
                browse: {
                  playlistId,
                  playlistName,
                  tracks,
                  trackCount: tracks.length,
                },
              },
            );
          })();
        }}
        onToggleQueue={() => {
          const current = bgmRef.current;
          if (!current) return;
          const opening = !current.queueOpen;
          if (!opening) {
            setPlayback({ ...current, queueOpen: false });
            return;
          }
          const stub = playlistsRef.current.find(
            (item) => item.neteasePlaylistId === current.playlistId,
          );
          setPlayback({ ...current, queueOpen: true });
          if (stub && stub.tracks.length === 0) {
            void ensurePlaylistTracks(stub);
          }
        }}
        onEnded={() => stepBgm(1)}
        onSrcError={handleBgmSrcError}
      />
        </div>

        {hasReading ? (
          <div className="reading-row">
            <div className="reading-row__main">
              {demoting ? (
                <ReadingDemoteGhost
                  key={`demote-${readingSurfaceKey(demoting)}`}
                  surface={demoting}
                  onDone={finishDemote}
                />
              ) : null}
              {main ? (
                <ReadingPanel
                  key={readingSurfaceKey(main)}
                  surface={main}
                  leaving={leaving}
                  onClose={closeReading}
                  onLeaveDone={finishLeave}
                />
              ) : null}
            </div>
            <ReadingRail
              items={readingSession.reading.rail}
              arrivingKey={arrivingKey}
              onPromote={promoteFromRail}
              onDismiss={dismissRailItem}
            />
          </div>
        ) : null}

        {editorTarget ? (
          <EditorPanel
            key={toLocalKey(editorTarget.ref)}
            target={editorTarget}
            onDone={handleEditorDone}
          />
        ) : null}
      </div>
    </main>
  );
}
