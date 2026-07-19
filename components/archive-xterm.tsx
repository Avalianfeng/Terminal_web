"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { CompleteResult } from "@/lib/archive/complete";
import { entryToAnsiLines, lineToAnsi } from "@/lib/archive/ansi";
import { zhCN } from "@/lib/archive/i18n";
import { readXtermThemeFromCss } from "@/lib/archive/palette";
import { formatInputTokens } from "@/lib/archive/shell-style";
import type { TerminalEntry, TerminalToken } from "@/lib/archive/types";

export type ArchiveXtermHandle = {
  /** preventScroll：避免 focus 抢滚动，交给外层 scrollIntoView 编排 */
  focus: (options?: FocusOptions) => void;
  /** cwd 变化后重绘当前输入行 prompt */
  refreshPrompt: () => void;
  /** 外区布局变化（阅读面板开关等）后重新 fit 并滚到输入行 */
  relayout: () => void;
};

type ArchiveXtermProps = {
  bootEntries: TerminalEntry[];
  lineDelayMs: number;
  /** 分段着色的 prompt token（不含尾随空格与输入缓冲）。 */
  getPromptTokens: () => TerminalToken[];
  getComplete: (input: string, cycle: number | null) => CompleteResult;
  onCommand: (command: string) => {
    entries: TerminalEntry[];
    clear?: boolean;
  };
  onCandidatesChange: (candidates: string[]) => void;
  /** Esc：先清候选；若返回 true 表示已处理（如关阅读面板） */
  onEscape: () => boolean;
};

/**
 * 档位 1 终端表面：xterm 单缓冲 + 行编辑。
 * Runtime（命令/VFS）仍在外侧；此处只负责 write / onData / scrollback。
 */
export const ArchiveXterm = forwardRef<ArchiveXtermHandle, ArchiveXtermProps>(
  function ArchiveXterm(
    {
      bootEntries,
      lineDelayMs,
      getPromptTokens,
      getComplete,
      onCommand,
      onCandidatesChange,
      onEscape,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
    const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
    const bufferRef = useRef("");
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef<number | null>(null);
    const completeCycleRef = useRef<number | null>(null);
    const writeQueueRef = useRef(0);
    const readyRef = useRef(false);
    const candidatesRef = useRef<string[]>([]);
    const bootRef = useRef(bootEntries);
    bootRef.current = bootEntries;

    const callbacksRef = useRef({
      getPromptTokens,
      getComplete,
      onCommand,
      onCandidatesChange,
      onEscape,
      lineDelayMs,
    });
    callbacksRef.current = {
      getPromptTokens,
      getComplete,
      onCommand,
      onCandidatesChange,
      onEscape,
      lineDelayMs,
    };

    function scrollToPrompt() {
      const term = termRef.current;
      if (!term) return;
      term.scrollToBottom();
    }

    function syncThemeFromCss() {
      const term = termRef.current;
      if (!term) return;
      term.options.theme = readXtermThemeFromCss();
    }

    /** 容器尺寸变了才 fit；lineHeight=1 时 FitAddon 可直接用，无需 rows 常数修正。 */
    function fitAndScroll() {
      const fitAddon = fitRef.current;
      const term = termRef.current;
      if (!fitAddon || !term || !readyRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        /* 容器尚未有尺寸时忽略 */
      }
      scrollToPrompt();
      paintPromptLine();
      scrollToPrompt();
    }

    function paintPromptLine() {
      const term = termRef.current;
      if (!term) return;
      const promptTokens = callbacksRef.current.getPromptTokens();
      const painted = lineToAnsi({
        tokens: [
          ...promptTokens,
          { text: " ", tone: "muted" },
          ...formatInputTokens(bufferRef.current),
        ],
      });
      term.write(`\r\x1b[2K${painted}`);
    }

    function setCandidates(next: string[]) {
      candidatesRef.current = next;
      callbacksRef.current.onCandidatesChange(next);
    }

    function resetCompletion() {
      completeCycleRef.current = null;
      setCandidates([]);
    }

    function applyTab() {
      const input = bufferRef.current;
      const cycle = completeCycleRef.current;
      let result = callbacksRef.current.getComplete(input, cycle);

      if (!result.applied && result.candidates.length > 1) {
        const startIndex = cycle ?? 0;
        result = callbacksRef.current.getComplete(input, startIndex);
        completeCycleRef.current = startIndex + 1;
      } else if (result.applied && result.candidates.length > 1 && cycle !== null) {
        completeCycleRef.current = cycle + 1;
      } else if (result.candidates.length <= 1) {
        completeCycleRef.current = null;
      }

      if (result.applied) {
        bufferRef.current = result.input;
        paintPromptLine();
      }
      setCandidates(result.candidates.length > 1 ? result.candidates : []);
    }

    async function writeEntries(entries: TerminalEntry[], skipCommandEcho: boolean) {
      const term = termRef.current;
      if (!term) return;

      const queueId = ++writeQueueRef.current;
      const list = skipCommandEcho
        ? entries.filter((entry) => entry.kind !== "command")
        : entries;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const delay =
        reduced || list.length <= 1 ? 0 : callbacksRef.current.lineDelayMs;

      for (let i = 0; i < list.length; i += 1) {
        if (writeQueueRef.current !== queueId) return;
        const lines = entryToAnsiLines(list[i]!);
        for (const line of lines) {
          term.writeln(line);
        }
        scrollToPrompt();
        if (delay > 0 && i < list.length - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
      }
    }

    async function submitLine() {
      const term = termRef.current;
      if (!term) return;

      const command = bufferRef.current.trim();
      term.write("\r\n");
      bufferRef.current = "";
      resetCompletion();
      historyIndexRef.current = null;

      if (!command) {
        paintPromptLine();
        return;
      }

      historyRef.current = [...historyRef.current, command];
      const result = callbacksRef.current.onCommand(command);

      if (result.clear) {
        writeQueueRef.current += 1;
        term.clear();
        term.writeln(
          `\x1b[38;2;120;131;144m${zhCN.shell.cleared}\x1b[0m`,
        );
        paintPromptLine();
        return;
      }

      await writeEntries(result.entries, true);
      paintPromptLine();
      scrollToPrompt();
    }

    function handleHistory(direction: "up" | "down") {
      const history = historyRef.current;
      if (history.length === 0) return;

      if (direction === "up") {
        const next =
          historyIndexRef.current === null
            ? history.length - 1
            : Math.max(0, historyIndexRef.current - 1);
        historyIndexRef.current = next;
        bufferRef.current = history[next] ?? "";
        resetCompletion();
        paintPromptLine();
        return;
      }

      if (historyIndexRef.current === null) return;
      const next = historyIndexRef.current + 1;
      if (next >= history.length) {
        historyIndexRef.current = null;
        bufferRef.current = "";
        resetCompletion();
        paintPromptLine();
        return;
      }
      historyIndexRef.current = next;
      bufferRef.current = history[next] ?? "";
      resetCompletion();
      paintPromptLine();
    }

    useImperativeHandle(ref, () => ({
      focus: (options) => {
        const host = hostRef.current;
        const helper = host?.querySelector(
          "textarea.xterm-helper-textarea",
        ) as HTMLTextAreaElement | null;
        if (helper) {
          helper.focus(options);
          return;
        }
        termRef.current?.focus();
        if (options?.preventScroll) {
          // xterm.focus 无 preventScroll 时，抵消可能的跳动
          const y = window.scrollY;
          requestAnimationFrame(() => window.scrollTo({ top: y }));
        }
      },
      refreshPrompt: () => {
        if (readyRef.current) paintPromptLine();
      },
      relayout: () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => fitAndScroll());
        });
      },
    }));

    useEffect(() => {
      let disposed = false;
      let resizeObserver: ResizeObserver | null = null;
      let paletteObserver: MutationObserver | null = null;
      let dataDisposable: { dispose: () => void } | null = null;

      async function mount() {
        const host = hostRef.current;
        if (!host) return;

        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        await import("@xterm/xterm/css/xterm.css");

        if (disposed || !hostRef.current) return;

        const term = new Terminal({
          convertEol: true,
          cursorBlink: true,
          cursorStyle: "block",
          disableStdin: false,
          fontFamily:
            '"JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
          fontSize: 14,
          // =1：与 FitAddon 行高测量一致；行距交给 CSS/字体 metrics
          lineHeight: 1,
          scrollback: 5000,
          theme: readXtermThemeFromCss(),
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(host);

        termRef.current = term;
        fitRef.current = fitAddon;
        readyRef.current = true;

        fitAndScroll();
        await writeEntries(bootRef.current, false);
        if (disposed) return;
        paintPromptLine();
        fitAndScroll();

        term.attachCustomKeyEventHandler((event) => {
          if (event.type !== "keydown") return true;

          if (event.key === "Tab") {
            event.preventDefault();
            applyTab();
            return false;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            if (candidatesRef.current.length > 0) {
              resetCompletion();
              return false;
            }
            callbacksRef.current.onEscape();
            return false;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            handleHistory("up");
            return false;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            handleHistory("down");
            return false;
          }

          return true;
        });

        dataDisposable = term.onData((data) => {
          if (data === "\r") {
            void submitLine();
            return;
          }

          if (data === "\u007f") {
            if (bufferRef.current.length === 0) return;
            bufferRef.current = bufferRef.current.slice(0, -1);
            resetCompletion();
            paintPromptLine();
            return;
          }

          if (data === "\u0003") {
            bufferRef.current = "";
            resetCompletion();
            term.write("^C\r\n");
            paintPromptLine();
            return;
          }

          // 忽略其余 CSI / 控制序列（方向键已在 key handler 处理）
          if (data.startsWith("\x1b")) return;

          if (data.length > 0) {
            bufferRef.current += data;
            resetCompletion();
            paintPromptLine();
          }
        });

        resizeObserver = new ResizeObserver(() => {
          fitAndScroll();
        });
        resizeObserver.observe(host);
        const shell = host.closest(".terminal-shell");
        if (shell) resizeObserver.observe(shell);

        // 接缝：palette 切换时同步 xterm 色，并重新 fit
        paletteObserver = new MutationObserver(() => {
          syncThemeFromCss();
          fitAndScroll();
        });
        paletteObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-palette"],
        });

        term.focus();
      }

      void mount();

      return () => {
        disposed = true;
        readyRef.current = false;
        writeQueueRef.current += 1;
        resizeObserver?.disconnect();
        paletteObserver?.disconnect();
        dataDisposable?.dispose();
        termRef.current?.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
      // 仅挂载一次；回调走 ref
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div
        className="archive-xterm-frame"
        onClick={() => termRef.current?.focus()}
      >
        {/* 测量宿主无 padding，避免 fit 行数多于可见区 */}
        <div ref={hostRef} className="archive-xterm" />
      </div>
    );
  },
);
