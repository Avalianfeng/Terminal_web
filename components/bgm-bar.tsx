"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { zhCN } from "@/lib/archive/i18n";
import {
  resolveBgmCollapseMs,
  resolveBgmExpandMs,
} from "@/lib/archive/motion-spec";
import { lyricIndexAt, usableLyricLines, type LyricLine } from "@/lib/music/lyric";
import type {
  MusicPlaylistIndex,
  PlaylistTrack,
} from "@/lib/music/playlist-types";
import { playlistTrackCount } from "@/lib/music/playlist-types";
import {
  BgmFoldArrow,
  BgmSequenceIcon,
  BgmShuffleIcon,
} from "@/components/bgm-fold-arrow";

/** 与 `.bgm-bar__lyric-line` 高度一致，用于步进滚到视口中线。 */
const LYRIC_LINE_PX = 16;
const LYRIC_VIEW_LINES = 3;
/** 比 timeupdate 更紧；略超时间戳避免视觉落后半拍。 */
const LYRIC_LOOKAHEAD_MS = 40;

/**
 * 曲目列表开合：grid 0fr/1fr 改真实高度；与歌单覆盖层互不抢槽。
 */
function BgmExpandPanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(expanded);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (open) {
      if (expandedRef.current) return;
      if (resolveBgmExpandMs() <= 0) {
        queueMicrotask(() => {
          setMounted(true);
          setExpanded(true);
        });
        return;
      }
      queueMicrotask(() => setMounted(true));
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setExpanded(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!expandedRef.current && !open) return;

    setExpanded(false);
    const ms = resolveBgmCollapseMs();
    if (ms <= 0) {
      queueMicrotask(() => setMounted(false));
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setMounted(false);
      timerRef.current = null;
    }, ms + 40);
  }, [open]);

  if (!mounted) return null;

  const style = {
    "--bgm-expand-ms": `${resolveBgmExpandMs()}ms`,
    "--bgm-collapse-ms": `${resolveBgmCollapseMs()}ms`,
  } as CSSProperties;

  return (
    <div
      className={
        expanded ? "bgm-player__expand is-open" : "bgm-player__expand"
      }
      style={style}
      aria-hidden={!expanded}
    >
      <div className="bgm-player__expand-clip">
        <div className="bgm-player__expand-body">{children}</div>
      </div>
    </div>
  );
}

export type BgmNowPlaying = {
  playlistId: string;
  playlistName: string;
  tracks: PlaylistTrack[];
  index: number;
  paused: boolean;
};

export type BgmPlayback = {
  /** 浏览框：当前展示的歌单（切单只改这里） */
  playlistId: string;
  playlistName: string;
  tracks: PlaylistTrack[];
  trackCount?: number;
  status: string;
  /** 隐藏整块播放器 UI（仍可出声） */
  hidden: boolean;
  /** 展开曲目列表（在播放条下方） */
  queueOpen: boolean;
  /** 按需载入曲目中 */
  tracksLoading?: boolean;
  /** 随机播放（下一首/播完切歌） */
  shuffle: boolean;
  /** 曲目会话；与浏览框可分离；stop 清空 */
  now: BgmNowPlaying | null;
};

type BgmBarProps = {
  playback: BgmPlayback | null;
  src: string | null;
  /** 与 PlaybackSessionEngine 世代对齐；切歌时抬升以作废歌词请求 */
  playGeneration: number;
  playlists: MusicPlaylistIndex[];
  onEnded: () => void;
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectIndex: (index: number) => void;
  onToggleQueue: () => void;
  onSelectPlaylist: (playlist: MusicPlaylistIndex) => void;
  /** 切换随机播放 */
  onToggleShuffle: () => void;
  /** 当前 src 播放失败（如 CDN 过期） */
  onSrcError?: () => void;
};

function formatArtists(track: PlaylistTrack | undefined) {
  return track?.artists.join(" / ") ?? "";
}

/** 浏览列表里高亮：同歌单用 now.index，否则按 song id 匹配。 */
function browseActiveIndex(playback: BgmPlayback): number {
  const now = playback.now;
  if (!now) return -1;
  if (playback.playlistId === now.playlistId) return now.index;
  const id = now.tracks[now.index]?.id;
  if (id == null) return -1;
  return playback.tracks.findIndex((track) => track.id === id);
}

const QUEUE_ROW_PX = 44;
const QUEUE_VIRTUAL_THRESHOLD = 80;

type BgmLyricsProps = {
  trackId: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  src: string | null;
  paused: boolean;
};

/** key=`${trackId}-${playGeneration}` 由父级挂载，切歌时整树重置。 */
function BgmLyrics({ trackId, audioRef, src, paused }: BgmLyricsProps) {
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [lyricStatus, setLyricStatus] = useState<"loading" | "ready">("loading");
  const [lyricIdx, setLyricIdx] = useState(-1);

  useEffect(() => {
    const ac = new AbortController();

    void (async () => {
      try {
        const res = await fetch(`/api/music/song/lyric?id=${trackId}`, {
          signal: ac.signal,
        });
        const body = (await res.json()) as {
          ok?: boolean;
          lines?: LyricLine[];
        };
        if (ac.signal.aborted) return;
        setLyricLines(
          body.ok && Array.isArray(body.lines)
            ? usableLyricLines(body.lines)
            : [],
        );        setLyricStatus("ready");
      } catch {
        if (!ac.signal.aborted) {
          setLyricLines([]);
          setLyricStatus("ready");
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [trackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || lyricLines.length === 0 || paused) return;

    let raf = 0;
    let lastIdx = -2;

    function tick() {
      const el = audioRef.current;
      if (!el || el.paused) {
        return;
      }
      const ms = el.currentTime * 1000 + LYRIC_LOOKAHEAD_MS;
      const next = lyricIndexAt(lyricLines, ms);
      if (next !== lastIdx) {
        lastIdx = next;
        setLyricIdx(next);
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyricLines, src, audioRef, paused]);

  const placeholder =
    lyricStatus === "loading"
      ? zhCN.music.lyricLoading
      : zhCN.music.lyricEmpty;
  const empty = lyricLines.length === 0;

  /** 未到首句时间戳时仍滚到第 0 行并高亮，与旧三行窗一致。 */
  const focusIdx = lyricIdx < 0 ? 0 : lyricIdx;
  const offsetY =
    ((LYRIC_VIEW_LINES - 1) / 2 - focusIdx) * LYRIC_LINE_PX;

  return (
    <div
      className={empty ? "bgm-bar__lyrics is-empty" : "bgm-bar__lyrics"}
      aria-live="polite"
    >
      {empty ? (
        <span className="bgm-bar__lyric-empty">{placeholder}</span>
      ) : (
        <div
          className="bgm-bar__lyrics-track"
          style={{ transform: `translateY(${offsetY}px)` }}
        >
          {lyricLines.map((line, index) => {
            const current = index === focusIdx;
            return (
              <span
                key={`${line.timeMs}-${index}`}
                className={
                  current
                    ? "bgm-bar__lyric-line is-current"
                    : "bgm-bar__lyric-line"
                }
              >
                {line.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TrackQueueProps = {
  tracks: PlaylistTrack[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
};

function TrackQueue({ tracks, activeIndex, onSelectIndex }: TrackQueueProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const virtual = tracks.length >= QUEUE_VIRTUAL_THRESHOLD;
  const overscan = 6;
  const start = virtual
    ? Math.max(0, Math.floor(scrollTop / QUEUE_ROW_PX) - overscan)
    : 0;
  const end = virtual
    ? Math.min(
        tracks.length,
        start + Math.ceil(352 / QUEUE_ROW_PX) + overscan * 2,
      )
    : tracks.length;
  const slice = tracks.slice(start, end);

  useEffect(() => {
    if (!virtual || activeIndex < 0) return;
    const node = containerRef.current;
    if (!node) return;
    const target = activeIndex * QUEUE_ROW_PX - QUEUE_ROW_PX * 2;
    node.scrollTop = Math.max(0, target);
    setScrollTop(node.scrollTop);
  }, [activeIndex, tracks.length, virtual]);

  useEffect(() => {
    if (!virtual) {
      activeRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, virtual]);

  if (!virtual) {
    return (
      <div className="bgm-player__queue" role="list">
        {tracks.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={`${item.id}-${index}`}
              ref={active ? activeRef : undefined}
              type="button"
              role="listitem"
              className={
                active ? "bgm-player__track is-active" : "bgm-player__track"
              }
              onClick={() => onSelectIndex(index)}
            >
              <span className="bgm-player__track-index">{index + 1}</span>
              <span className="bgm-player__track-body">
                <span className="bgm-player__track-name">{item.name}</span>
                <span className="bgm-player__track-artists">
                  {formatArtists(item)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bgm-player__queue bgm-player__queue--virtual"
      role="list"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className="bgm-player__queue-inner"
        style={{ height: tracks.length * QUEUE_ROW_PX }}
      >
        {slice.map((item, offset) => {
          const index = start + offset;
          const active = index === activeIndex;
          return (
            <button
              key={`${item.id}-${index}`}
              ref={active ? activeRef : undefined}
              type="button"
              role="listitem"
              className={
                active ? "bgm-player__track is-active" : "bgm-player__track"
              }
              style={{ top: index * QUEUE_ROW_PX, height: QUEUE_ROW_PX }}
              onClick={() => onSelectIndex(index)}
            >
              <span className="bgm-player__track-index">{index + 1}</span>
              <span className="bgm-player__track-body">
                <span className="bgm-player__track-name">{item.name}</span>
                <span className="bgm-player__track-artists">
                  {formatArtists(item)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BgmBar({
  playback,
  src,
  playGeneration,
  playlists,
  onEnded,
  onTogglePause,
  onPrev,
  onNext,
  onSelectIndex,
  onToggleQueue,
  onSelectPlaylist,
  onToggleShuffle,
  onSrcError,
}: BgmBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playlistPickerRef = useRef<HTMLDivElement>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!src) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.src = src;
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playback) return;
    if (playback.now?.paused ?? true) audio.pause();
    else if (audio.src) void audio.play().catch(() => undefined);
  }, [playback?.now?.paused, playback, src]);

  const trackId = playback?.now?.tracks[playback.now.index]?.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close on playlist identity change
    setPlaylistOpen(false);
  }, [playback?.playlistId]);

  useEffect(() => {
    if (!playlistOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (playlistPickerRef.current?.contains(target)) return;
      setPlaylistOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPlaylistOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [playlistOpen]);

  function toggleQueue() {
    onToggleQueue();
  }

  function togglePlaylistCatalog() {
    setPlaylistOpen((open) => !open);
  }

  function pickPlaylist(playlist: MusicPlaylistIndex) {
    setPlaylistOpen(false);
    onSelectPlaylist(playlist);
  }

  function handleAudioError() {
    if (!src) return;
    onSrcError?.();
  }

  if (!playback) {
    return <audio ref={audioRef} hidden />;
  }

  if (playback.hidden) {
    return (
      <audio ref={audioRef} onEnded={onEnded} onError={handleAudioError} />
    );
  }

  const track = playback.now?.tracks[playback.now.index];
  const title = track?.name ?? zhCN.music.idleTitle;
  const artists = formatArtists(track);
  const paused = playback.now?.paused ?? true;
  const listLabel = playback.queueOpen
    ? zhCN.music.queueHide
    : zhCN.music.queueShow;
  const activeIndex = browseActiveIndex(playback);
  const orderLabel = playback.shuffle
    ? zhCN.music.shuffleOn
    : zhCN.music.shuffleOff;

  return (
    <div
      ref={playerRef}
      className="bgm-player"
      role="region"
      aria-label={zhCN.music.nowPlaying}
    >
      <audio ref={audioRef} onEnded={onEnded} onError={handleAudioError} />

      <div className="bgm-player__frame">
        <div className="bgm-bar">
          <div className="bgm-bar__lead">
            <div className="bgm-bar__meta">
              <span className="bgm-bar__title">{title}</span>
              {playback.status ? (
                <span className="bgm-bar__artists">{playback.status}</span>
              ) : artists ? (
                <span className="bgm-bar__artists">{artists}</span>
              ) : null}
            </div>
            <div className="bgm-bar__transport">
              <button
                type="button"
                className="bgm-bar__btn"
                aria-label={zhCN.music.prev}
                onClick={onPrev}
              >
                ‹‹
              </button>
              <button
                type="button"
                className="bgm-bar__btn"
                aria-label={
                  paused ? zhCN.music.resume : zhCN.music.pause
                }
                onClick={onTogglePause}
              >
                {paused ? "▶" : "❚❚"}
              </button>
              <button
                type="button"
                className="bgm-bar__btn"
                aria-label={zhCN.music.next}
                onClick={onNext}
              >
                ››
              </button>
              <button
                type="button"
                className="bgm-bar__btn bgm-bar__btn--icon"
                aria-label={orderLabel}
                aria-pressed={playback.shuffle}
                title={orderLabel}
                onClick={onToggleShuffle}
              >
                {playback.shuffle ? <BgmShuffleIcon /> : <BgmSequenceIcon />}
              </button>
            </div>
          </div>

          {trackId ? (
            <BgmLyrics
              key={`${trackId}-${playGeneration}`}
              trackId={trackId}
              audioRef={audioRef}
              src={src}
              paused={paused}
            />
          ) : (
            <div className="bgm-bar__lyrics is-empty" aria-live="polite">
              <span className="bgm-bar__lyric-empty">
                {zhCN.music.lyricEmpty}
              </span>
            </div>
          )}

          <button
            type="button"
            className="bgm-bar__btn bgm-bar__btn--list"
            aria-label={zhCN.music.queueToggle}
            aria-expanded={playback.queueOpen}
            onClick={toggleQueue}
          >
            <span>{listLabel}</span>
            <BgmFoldArrow open={playback.queueOpen} />
          </button>
        </div>

        <div
          ref={playlistPickerRef}
          className={
            playlistOpen
              ? "bgm-player__caption is-picker-open"
              : "bgm-player__caption"
          }
        >
          <span
            className="bgm-player__caption-name"
            title={playback.playlistName}
          >
            {playback.playlistName}
          </span>
          <button
            type="button"
            className="bgm-bar__btn bgm-bar__btn--fold"
            aria-label={zhCN.music.playlistPickerToggle}
            aria-expanded={playlistOpen}
            onClick={togglePlaylistCatalog}
          >
            <BgmFoldArrow open={playlistOpen} />
          </button>
          {playlistOpen ? (
            <div
              className="bgm-player__playlist-layer"
              role="listbox"
              style={
                {
                  "--bgm-expand-ms": `${resolveBgmExpandMs()}ms`,
                } as CSSProperties
              }
            >
              {playlists.length === 0 ? (
                <p className="bgm-player__queue-empty is-embedded">
                  {zhCN.music.empty}
                </p>
              ) : (
                playlists.map((playlist) => {
                  const active =
                    playlist.neteasePlaylistId === playback.playlistId;
                  return (
                    <button
                      key={playlist.neteasePlaylistId}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={
                        active
                          ? "bgm-player__playlist is-active"
                          : "bgm-player__playlist"
                      }
                      onClick={() => pickPlaylist(playlist)}
                    >
                      <span className="bgm-player__playlist-name">
                        {playlist.name}
                      </span>
                      <span className="bgm-player__playlist-count">
                        {playlistTrackCount(playlist)}
                        {zhCN.music.trackUnit}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>

      <BgmExpandPanel open={playback.queueOpen}>
        {playback.tracksLoading ||
        (playback.tracks.length === 0 && (playback.trackCount ?? 0) > 0) ? (
          <p className="bgm-player__queue-empty">{zhCN.music.queueLoading}</p>
        ) : playback.tracks.length === 0 ? (
          <p className="bgm-player__queue-empty">{zhCN.music.queueEmpty}</p>
        ) : (
          <TrackQueue
            tracks={playback.tracks}
            activeIndex={activeIndex}
            onSelectIndex={onSelectIndex}
          />
        )}
      </BgmExpandPanel>
    </div>
  );
}
