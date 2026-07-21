"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { CompleteResult } from "@/lib/archive/complete";
import { entryToAnsiLines, lineToAnsi } from "@/lib/archive/ansi";
import {
  displayWidth,
  indexAtDisplayColumn,
  moveIndexLeft,
  moveIndexRight,
} from "@/lib/archive/display-width";
import { zhCN } from "@/lib/archive/i18n";
import { readXtermThemeFromCss } from "@/lib/archive/palette";
import { formatInputTokens } from "@/lib/archive/shell-style";
import type { TerminalEntry, TerminalToken } from "@/lib/archive/types";
import { wrapLogicalLines } from "@/lib/archive/wrap-lines";

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
    pager?: { logicalLines: string[] } | null;
  };
  onCandidatesChange: (candidates: string[]) => void;
  /** Esc：先清候选；若返回 true 表示已处理（如关阅读面板） */
  onEscape: () => boolean;
};

type PagerState = {
  lines: string[];
  index: number;
};

/** 多行粘贴非空行上限；超过则拒绝，避免误跑大段文本。 */
const PASTE_LINE_CAP = 20;

function splitPasteLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

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
    /** UTF-16 索引：插入点在 buffer 中的位置 */
    const cursorRef = useRef(0);
    /** 上次输入行占用的物理行数（用于换行后重绘清残行） */
    const lastPaintRowsRef = useRef(1);
    /** 上次光标相对输入块首的行偏移 */
    const lastCursorRowOffRef = useRef(0);
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef<number | null>(null);
    const completeCycleRef = useRef<number | null>(null);
    const writeQueueRef = useRef(0);
    const readyRef = useRef(false);
    const candidatesRef = useRef<string[]>([]);
    const pagerRef = useRef<PagerState | null>(null);
    /** 多行粘贴确认：待执行行；与 pager 互斥。 */
    const pasteConfirmRef = useRef<{ lines: string[] } | null>(null);
    /** 确认后待串行执行的命令队列（pager 会暂停，退出后继续）。 */
    const pasteQueueRef = useRef<string[]>([]);
    const pasteBusyRef = useRef(false);
    /** 防止 Ctrl+V 与原生 paste→onData 双触发。 */
    const pasteGuardRef = useRef(0);
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
      if (pagerRef.current || pasteConfirmRef.current) return;
      paintPromptLine();
      scrollToPrompt();
    }

    function promptPrefixPlain() {
      return (
        callbacksRef.current.getPromptTokens().map((token) => token.text).join("") +
        " "
      );
    }

    function clampCursor() {
      cursorRef.current = Math.max(
        0,
        Math.min(cursorRef.current, bufferRef.current.length),
      );
    }

    function setBuffer(next: string, cursor: number) {
      bufferRef.current = next;
      cursorRef.current = Math.max(0, Math.min(cursor, next.length));
    }

    /**
     * 重绘当前输入行，并把光标放到 buffer 内 cursor 对应的显示列。
     * 用显示宽度（含 CJK 双宽）计算，避免方块光标偏格。
     */
    function paintPromptLine() {
      const term = termRef.current;
      if (!term || pagerRef.current || pasteConfirmRef.current) return;

      clampCursor();
      const promptTokens = callbacksRef.current.getPromptTokens();
      const buffer = bufferRef.current;
      const cursor = cursorRef.current;
      const promptPlain = promptPrefixPlain();
      const cols = Math.max(1, term.cols);

      const painted = lineToAnsi({
        tokens: [
          ...promptTokens,
          { text: " ", tone: "muted" },
          ...formatInputTokens(buffer),
        ],
      });

      const endW = displayWidth(promptPlain + buffer);
      const contentRows =
        endW === 0 ? 1 : Math.floor((endW - 1) / cols) + 1;
      const prevRows = lastPaintRowsRef.current;
      const prevCursorRowOff = lastCursorRowOffRef.current;
      const rowsBelow = Math.max(0, prevRows - 1 - prevCursorRowOff);

      // 先到块末行，再向上清残行，避免光标在中间时误清上方历史
      let clearSeq = "";
      if (rowsBelow > 0) clearSeq += `\x1b[${rowsBelow}B`;
      clearSeq += "\r";
      for (let i = 0; i < prevRows - 1; i += 1) {
        clearSeq += "\x1b[2K\x1b[1A";
      }
      clearSeq += "\x1b[2K\r";
      term.write(`${clearSeq}${painted}`);

      const cursorW = displayWidth(promptPlain + buffer.slice(0, cursor));
      const writtenRow = Math.floor(endW / cols);
      const targetRow = Math.floor(cursorW / cols);
      const targetCol = cursorW % cols;
      const up = writtenRow - targetRow;

      let moveSeq = "";
      if (up > 0) moveSeq += `\x1b[${up}A`;
      else if (up < 0) moveSeq += `\x1b[${-up}B`;
      if (cursorW !== endW || up !== 0) {
        moveSeq += `\x1b[${targetCol + 1}G`;
      }
      if (moveSeq) term.write(moveSeq);

      lastPaintRowsRef.current = contentRows;
      lastCursorRowOffRef.current = targetRow;
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
        setBuffer(result.input, result.input.length);
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

    function mutedAnsi(text: string) {
      return lineToAnsi({ tokens: [{ text, tone: "muted" }] });
    }

    function writePagerStatus() {
      const term = termRef.current;
      if (!term) return;
      term.write(`\r\x1b[2K${mutedAnsi(zhCN.pager.more)}`);
    }

    function clearPagerStatus() {
      const term = termRef.current;
      if (!term) return;
      term.write("\r\x1b[2K");
    }

    function finishPager() {
      const term = termRef.current;
      pagerRef.current = null;
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
      if (!term) return;
      term.writeln(mutedAnsi(zhCN.pager.end));
      if (pasteQueueRef.current.length > 0) {
        void drainPasteQueue();
        return;
      }
      paintPromptLine();
      scrollToPrompt();
    }

    function exitPager() {
      const term = termRef.current;
      if (!pagerRef.current) return;
      clearPagerStatus();
      pagerRef.current = null;
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
      if (!term) return;
      if (pasteQueueRef.current.length > 0) {
        void drainPasteQueue();
        return;
      }
      paintPromptLine();
      scrollToPrompt();
    }

    /** Enter / Space：清 status 后写出恰好一行。 */
    function pagerAdvance() {
      const term = termRef.current;
      const pager = pagerRef.current;
      if (!term || !pager) return;

      clearPagerStatus();
      const line = pager.lines[pager.index] ?? "";
      pager.index += 1;
      term.writeln(line);

      if (pager.index >= pager.lines.length) {
        finishPager();
        return;
      }

      writePagerStatus();
      scrollToPrompt();
    }

    function startPager(logicalLines: string[]) {
      const term = termRef.current;
      if (!term) return;

      const cols = Math.max(1, term.cols);
      const pageSize = Math.max(1, term.rows - 2);
      const lines = wrapLogicalLines(logicalLines, cols);

      if (lines.length <= pageSize) {
        for (const row of lines) {
          term.writeln(row);
        }
        paintPromptLine();
        scrollToPrompt();
        return;
      }

      let index = 0;
      const first = Math.min(pageSize, lines.length);
      for (; index < first; index += 1) {
        term.writeln(lines[index]!);
      }

      if (index >= lines.length) {
        term.writeln(mutedAnsi(zhCN.pager.end));
        paintPromptLine();
        scrollToPrompt();
        return;
      }

      pagerRef.current = { lines, index };
      writePagerStatus();
      scrollToPrompt();
    }

    /**
     * 已在新行上：写入历史、跑命令、输出结果。
     * 调用前须已 `\r\n` 离开输入行并清空 buffer。
     */
    async function runCommandLineCore(command: string) {
      const term = termRef.current;
      if (!term) return;

      historyRef.current = [...historyRef.current, command];
      const result = callbacksRef.current.onCommand(command);

      if (result.clear) {
        writeQueueRef.current += 1;
        lastPaintRowsRef.current = 1;
        lastCursorRowOffRef.current = 0;
        pagerRef.current = null;
        pasteQueueRef.current = [];
        term.clear();
        term.writeln(
          `\x1b[38;2;120;131;144m${zhCN.shell.cleared}\x1b[0m`,
        );
        paintPromptLine();
        return;
      }

      await writeEntries(result.entries, true);

      if (result.pager?.logicalLines) {
        startPager(result.pager.logicalLines);
        return;
      }

      if (pasteQueueRef.current.length === 0) {
        paintPromptLine();
        scrollToPrompt();
      }
    }

    /** 画出 prompt+命令并提交（供粘贴队列逐行调用）。 */
    async function runCommandLine(command: string) {
      const term = termRef.current;
      if (!term || pagerRef.current || pasteConfirmRef.current) return;

      setBuffer(command, command.length);
      paintPromptLine();
      term.write("\r\n");
      setBuffer("", 0);
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
      resetCompletion();
      historyIndexRef.current = null;

      await runCommandLineCore(command);
    }

    async function drainPasteQueue() {
      if (pasteBusyRef.current) return;
      pasteBusyRef.current = true;
      try {
        while (pasteQueueRef.current.length > 0) {
          if (pagerRef.current) break;
          const line = pasteQueueRef.current.shift()!;
          await runCommandLine(line);
          if (pagerRef.current) break;
        }
        if (!pagerRef.current && pasteQueueRef.current.length === 0) {
          paintPromptLine();
          scrollToPrompt();
        }
      } finally {
        pasteBusyRef.current = false;
      }
    }

    function clearPaintedInputBlock() {
      const term = termRef.current;
      if (!term) return;
      const prevRows = lastPaintRowsRef.current;
      const prevCursorRowOff = lastCursorRowOffRef.current;
      const rowsBelow = Math.max(0, prevRows - 1 - prevCursorRowOff);
      let clearSeq = "";
      if (rowsBelow > 0) clearSeq += `\x1b[${rowsBelow}B`;
      clearSeq += "\r";
      for (let i = 0; i < prevRows - 1; i += 1) {
        clearSeq += "\x1b[2K\x1b[1A";
      }
      clearSeq += "\x1b[2K\r";
      term.write(clearSeq);
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
    }

    function writePasteConfirmStatus(count: number) {
      const term = termRef.current;
      if (!term) return;
      const msg = zhCN.clipboard.multiConfirm.replace("{n}", String(count));
      term.write(`\r\x1b[2K${mutedAnsi(msg)}`);
    }

    function cancelPasteConfirm(writeInterrupt = false) {
      const term = termRef.current;
      if (!pasteConfirmRef.current) return;
      pasteConfirmRef.current = null;
      if (!term) return;
      if (writeInterrupt) {
        term.write("^C\r\n");
      } else {
        term.write("\r\x1b[2K");
      }
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
      paintPromptLine();
      scrollToPrompt();
    }

    function acceptPasteConfirm() {
      const confirm = pasteConfirmRef.current;
      if (!confirm) return;
      pasteConfirmRef.current = null;
      const term = termRef.current;
      if (term) term.write("\r\x1b[2K");
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
      setBuffer("", 0);
      resetCompletion();
      historyIndexRef.current = null;
      pasteQueueRef.current = [...confirm.lines];
      void drainPasteQueue();
    }

    function handlePaste(text: string) {
      const now = Date.now();
      if (now - pasteGuardRef.current < 80) return;
      pasteGuardRef.current = now;

      if (
        pagerRef.current ||
        pasteConfirmRef.current ||
        pasteBusyRef.current
      ) {
        return;
      }

      const nonempty = splitPasteLines(text);
      if (nonempty.length === 0) return;

      if (nonempty.length === 1) {
        insertAtCursor(nonempty[0]!);
        return;
      }

      const term = termRef.current;
      if (!term) return;

      if (nonempty.length > PASTE_LINE_CAP) {
        clearPaintedInputBlock();
        term.writeln(mutedAnsi(zhCN.clipboard.refused));
        paintPromptLine();
        scrollToPrompt();
        return;
      }

      clearPaintedInputBlock();
      pasteConfirmRef.current = { lines: nonempty };
      writePasteConfirmStatus(nonempty.length);
      scrollToPrompt();
    }

    async function submitLine() {
      const term = termRef.current;
      if (
        !term ||
        pagerRef.current ||
        pasteConfirmRef.current ||
        pasteBusyRef.current
      ) {
        return;
      }

      const command = bufferRef.current.trim();
      term.write("\r\n");
      setBuffer("", 0);
      lastPaintRowsRef.current = 1;
      lastCursorRowOffRef.current = 0;
      resetCompletion();
      historyIndexRef.current = null;

      if (!command) {
        paintPromptLine();
        return;
      }

      await runCommandLineCore(command);
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
        const line = history[next] ?? "";
        setBuffer(line, line.length);
        resetCompletion();
        paintPromptLine();
        return;
      }

      if (historyIndexRef.current === null) return;
      const next = historyIndexRef.current + 1;
      if (next >= history.length) {
        historyIndexRef.current = null;
        setBuffer("", 0);
        resetCompletion();
        paintPromptLine();
        return;
      }
      historyIndexRef.current = next;
      const line = history[next] ?? "";
      setBuffer(line, line.length);
      resetCompletion();
      paintPromptLine();
    }

    function moveCursor(to: number) {
      cursorRef.current = Math.max(0, Math.min(to, bufferRef.current.length));
      paintPromptLine();
    }

    function deleteBeforeCursor() {
      const cursor = cursorRef.current;
      if (cursor === 0) return;
      const buffer = bufferRef.current;
      const left = moveIndexLeft(buffer, cursor);
      setBuffer(buffer.slice(0, left) + buffer.slice(cursor), left);
      resetCompletion();
      paintPromptLine();
    }

    function deleteAtCursor() {
      const cursor = cursorRef.current;
      const buffer = bufferRef.current;
      if (cursor >= buffer.length) return;
      const right = moveIndexRight(buffer, cursor);
      setBuffer(buffer.slice(0, cursor) + buffer.slice(right), cursor);
      resetCompletion();
      paintPromptLine();
    }

    function insertAtCursor(data: string) {
      if (!data) return;
      const cursor = cursorRef.current;
      const buffer = bufferRef.current;
      setBuffer(
        buffer.slice(0, cursor) + data + buffer.slice(cursor),
        cursor + data.length,
      );
      resetCompletion();
      paintPromptLine();
    }

    /** 点击输入行时，按显示列落到最近码点边界。 */
    function placeCursorFromClick(clientX: number, clientY: number) {
      if (pagerRef.current || pasteConfirmRef.current) return;
      const term = termRef.current;
      const screen = term?.element?.querySelector(
        ".xterm-screen",
      ) as HTMLElement | null;
      if (!term || !screen) return;

      const rect = screen.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return;
      }

      const cols = Math.max(1, term.cols);
      const rows = Math.max(1, term.rows);
      const col = Math.min(
        cols - 1,
        Math.max(0, Math.floor((clientX - rect.left) / (rect.width / cols))),
      );
      const row = Math.min(
        rows - 1,
        Math.max(0, Math.floor((clientY - rect.top) / (rect.height / rows))),
      );

      const buf = term.buffer.active;
      const promptPlain = promptPrefixPlain();
      const buffer = bufferRef.current;
      const prefixW = displayWidth(promptPlain);
      const fullW = prefixW + displayWidth(buffer);
      const cursorW = displayWidth(promptPlain + buffer.slice(0, cursorRef.current));
      const cursorRowOff = Math.floor(cursorW / cols);
      const contentStartRow = buf.cursorY - cursorRowOff;
      const clickRowOff = row - contentStartRow;

      if (clickRowOff < 0) return;
      const contentRows =
        fullW === 0 ? 1 : Math.floor((fullW - 1) / cols) + 1;
      if (clickRowOff >= contentRows) {
        moveCursor(buffer.length);
        return;
      }

      const clickAbsCol = clickRowOff * cols + col;
      if (clickAbsCol <= prefixW) {
        moveCursor(0);
        return;
      }
      if (clickAbsCol >= fullW) {
        moveCursor(buffer.length);
        return;
      }
      moveCursor(indexAtDisplayColumn(buffer, clickAbsCol - prefixW));
      term.clearSelection();
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
        if (
          readyRef.current &&
          !pagerRef.current &&
          !pasteConfirmRef.current
        ) {
          paintPromptLine();
        }
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
      let clickCleanup: (() => void) | null = null;

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

          const mod = event.ctrlKey || event.metaKey;
          const key = event.key;

          if (pagerRef.current) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              pagerAdvance();
              return false;
            }
            if (
              event.key === "q" ||
              event.key === "Q" ||
              event.key === "Escape"
            ) {
              event.preventDefault();
              exitPager();
              return false;
            }
            event.preventDefault();
            return false;
          }

          if (pasteConfirmRef.current) {
            if (key === "y" || key === "Y") {
              event.preventDefault();
              acceptPasteConfirm();
              return false;
            }
            if (key === "n" || key === "N" || key === "Escape") {
              event.preventDefault();
              cancelPasteConfirm(false);
              return false;
            }
            if (mod && (key === "c" || key === "C") && !event.shiftKey) {
              // Ctrl+C / Meta+C：中断确认（不当复制）
              event.preventDefault();
              cancelPasteConfirm(true);
              return false;
            }
            event.preventDefault();
            return false;
          }

          // 有选区：Ctrl+Shift+C 或 Mac Meta+C 复制
          if (
            mod &&
            (key === "c" || key === "C") &&
            (event.shiftKey || (event.metaKey && !event.ctrlKey))
          ) {
            const selection = term.getSelection();
            if (selection) {
              event.preventDefault();
              void navigator.clipboard.writeText(selection).catch(() => {});
              return false;
            }
            if (event.shiftKey) {
              event.preventDefault();
              return false;
            }
          }

          // Ctrl+V / Ctrl+Shift+V / Meta+V 粘贴
          if (mod && (key === "v" || key === "V")) {
            event.preventDefault();
            void navigator.clipboard
              .readText()
              .then((text) => handlePaste(text))
              .catch(() => {});
            return false;
          }

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

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveCursor(moveIndexLeft(bufferRef.current, cursorRef.current));
            return false;
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            moveCursor(moveIndexRight(bufferRef.current, cursorRef.current));
            return false;
          }

          if (event.key === "Home") {
            event.preventDefault();
            moveCursor(0);
            return false;
          }

          if (event.key === "End") {
            event.preventDefault();
            moveCursor(bufferRef.current.length);
            return false;
          }

          if (event.key === "Delete") {
            event.preventDefault();
            deleteAtCursor();
            return false;
          }

          return true;
        });

        dataDisposable = term.onData((data) => {
          if (pagerRef.current) {
            if (data === "\r" || data === " ") {
              pagerAdvance();
              return;
            }
            if (data === "q" || data === "Q") {
              exitPager();
              return;
            }
            if (data === "\u0003") {
              exitPager();
              return;
            }
            return;
          }

          if (pasteConfirmRef.current) {
            if (data === "y" || data === "Y") {
              acceptPasteConfirm();
              return;
            }
            if (data === "n" || data === "N") {
              cancelPasteConfirm(false);
              return;
            }
            if (data === "\u0003") {
              cancelPasteConfirm(true);
              return;
            }
            return;
          }

          // 浏览器原生粘贴可能整段进 onData（含换行）
          if (
            data.length > 1 &&
            (data.includes("\n") || data.includes("\r"))
          ) {
            handlePaste(data);
            return;
          }

          if (data === "\r") {
            void submitLine();
            return;
          }

          if (data === "\u007f") {
            deleteBeforeCursor();
            return;
          }

          if (data === "\u0003") {
            setBuffer("", 0);
            lastPaintRowsRef.current = 1;
            lastCursorRowOffRef.current = 0;
            resetCompletion();
            pasteQueueRef.current = [];
            term.write("^C\r\n");
            paintPromptLine();
            return;
          }

          // 忽略其余 CSI / 控制序列（方向键等已在 key handler 处理）
          if (data.startsWith("\x1b")) return;

          if (data.length > 0) {
            insertAtCursor(data);
          }
        });

        // 单击定位光标；拖拽选区则不抢
        let down: { x: number; y: number } | null = null;
        const onMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return;
          down = { x: event.clientX, y: event.clientY };
        };
        const onMouseUp = (event: MouseEvent) => {
          if (!down || event.button !== 0) {
            down = null;
            return;
          }
          const dx = Math.abs(event.clientX - down.x);
          const dy = Math.abs(event.clientY - down.y);
          down = null;
          if (dx > 4 || dy > 4) return;
          placeCursorFromClick(event.clientX, event.clientY);
        };
        host.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        clickCleanup = () => {
          host.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("mouseup", onMouseUp);
        };

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
        clickCleanup?.();
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
