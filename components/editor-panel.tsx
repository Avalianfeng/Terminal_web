"use client";

import { useEffect, useRef, useState } from "react";
import { getDocumentRaw, putDocumentRaw, removeDocument } from "@/lib/archive/actions";
import { emptyDocumentTemplate } from "@/lib/archive/content-format";
import { zhCN } from "@/lib/archive/i18n";
import type { ContentGroup } from "@/lib/archive/content-format";

export type EditorTarget = {
  group: ContentGroup;
  slug: string;
  exists: boolean;
};

type EditorPanelProps = {
  target: EditorTarget;
  onDone: (result: { saved: boolean; deleted: boolean }) => void;
};

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "deleted" }
  | { kind: "error"; message: string };

export function EditorPanel({ target, onDone }: EditorPanelProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const [initialRaw, setInitialRaw] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = raw !== null && initialRaw !== null && raw !== initialRaw;
  const title = `${target.group}/${target.slug}${target.exists ? "" : " (new)"}`;

  useEffect(() => {
    let cancelled = false;
    void getDocumentRaw(target.group, target.slug).then((result) => {
      if (cancelled) return;
      if (result.ok && "raw" in result) {
        setInitialRaw(result.raw);
        setRaw(result.raw);
      } else if (result.ok) {
        // 不应发生：读接口只返回 raw
        setLoadFailed(true);
      } else if (result.error === "not_found") {
        const template = emptyDocumentTemplate(target.slug);
        setInitialRaw(template);
        setRaw(template);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [target.group, target.slug]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [raw]);

  function finish(result: { saved: boolean; deleted: boolean }) {
    onDone(result);
  }

  async function handleSave() {
    if (!raw || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    const result = await putDocumentRaw(target.group, target.slug, raw);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setInitialRaw(raw);
    setStatus({ kind: "saved" });
    finish({ saved: true, deleted: false });
  }

  async function handleDelete() {
    if (status.kind === "saving") return;
    if (!window.confirm(zhCN.editor.deleteConfirm)) return;
    setStatus({ kind: "saving" });
    const result = await removeDocument(target.group, target.slug);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "deleted" });
    finish({ saved: false, deleted: true });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handleSave();
      return;
    }
    if (event.key === "Escape") {
      if (!dirty || window.confirm(zhCN.editor.notSaved)) {
        finish({ saved: false, deleted: false });
      }
    }
  }

  const statusText =
    status.kind === "saving"
      ? zhCN.editor.saving
      : status.kind === "saved"
        ? zhCN.editor.saved
        : status.kind === "deleted"
          ? zhCN.editor.deleted
          : status.kind === "error"
            ? zhCN.editor.saveFailed
            : dirty
              ? zhCN.editor.unsavedChanged
              : "";

  return (
    <div className="editor-panel" onKeyDown={handleKeyDown}>
      <header className="editor-panel__bar">
        <span className="editor-panel__path">{title}</span>
        <span className="editor-panel__status" data-status={status.kind}>
          {statusText}
        </span>
        <div className="editor-panel__actions">
          <button
            type="button"
            className="editor-panel__btn"
            onClick={handleDelete}
            disabled={status.kind === "saving"}
          >
            {zhCN.editor.delete}
          </button>
          <button
            type="button"
            className="editor-panel__btn"
            onClick={() => {
              if (!dirty || window.confirm(zhCN.editor.notSaved)) {
                finish({ saved: false, deleted: false });
              }
            }}
          >
            {zhCN.editor.cancel}
          </button>
          <button
            type="button"
            className="editor-panel__btn editor-panel__btn--primary"
            onClick={handleSave}
            disabled={status.kind === "saving"}
          >
            {status.kind === "saving" ? zhCN.editor.saving : zhCN.editor.save}
          </button>
        </div>
      </header>
      {loadFailed ? (
        <div className="editor-panel__error">{zhCN.editor.loadFailed}</div>
      ) : raw === null ? (
        <div className="editor-panel__loading">{zhCN.editor.saving}</div>
      ) : (
        <textarea
          ref={textareaRef}
          className="editor-panel__input"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          spellCheck={false}
          aria-label={title}
        />
      )}
      {status.kind === "error" ? (
        <footer className="editor-panel__error">{status.message}</footer>
      ) : (
        <footer className="editor-panel__hint">
          {zhCN.editor.hintSave} · {zhCN.editor.hintClose}
          {target.exists ? ` · ${zhCN.editor.hintDelete}` : ""}
        </footer>
      )}
    </div>
  );
}
