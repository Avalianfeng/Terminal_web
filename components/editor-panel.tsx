"use client";

import { useEffect, useRef, useState } from "react";
import { getDocumentRaw, putDocumentRaw, removeDocument } from "@/lib/archive/actions";
import { documentTemplateForGroup } from "@/lib/archive/content-format";
import { zhCN } from "@/lib/archive/i18n";
import {
  toLocalKey,
  type DocumentEditTarget,
} from "@/lib/archive/document-ref";

export type EditorTarget = DocumentEditTarget;

type EditorPanelProps = {
  target: EditorTarget;
  onDone: (result: {
    saved: boolean;
    deleted: boolean;
    /** Present when saved — used to refresh open reading surfaces immediately. */
    raw?: string;
  }) => void;
};

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "deleted" }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export function EditorPanel({ target, onDone }: EditorPanelProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const [initialRaw, setInitialRaw] = useState<string | null>(null);
  /** Base content hash for optimistic concurrency; null = new unsaved doc. */
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loadNonce, setLoadNonce] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const localKey = toLocalKey(target.ref);
  const { group, slug } = target.ref;
  const dirty = raw !== null && initialRaw !== null && raw !== initialRaw;
  const title = `${localKey}${target.exists ? "" : " (new)"}`;

  useEffect(() => {
    let cancelled = false;
    // Reset buffer when target or explicit reload changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- editor bootstrap / reload
    setLoadFailed(false);
    setStatus({ kind: "idle" });
    setRaw(null);
    setInitialRaw(null);
    setBaseHash(null);

    void getDocumentRaw(localKey).then((result) => {
      if (cancelled) return;
      if (result.ok && "raw" in result) {
        setInitialRaw(result.raw);
        setRaw(result.raw);
        setBaseHash(result.hash);
        return;
      }
      if (!result.ok && result.error === "not_found") {
        const template = documentTemplateForGroup(group, slug);
        setInitialRaw(template);
        setRaw(template);
        setBaseHash(null);
        return;
      }
      setLoadFailed(true);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localKey, group, slug, loadNonce]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [raw]);

  function finish(result: {
    saved: boolean;
    deleted: boolean;
    raw?: string;
  }) {
    onDone(result);
  }

  function reloadFromDisk() {
    setLoadNonce((n) => n + 1);
  }

  async function handleSave() {
    if (!raw || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    const result = await putDocumentRaw(
      localKey,
      raw,
      baseHash ?? undefined,
    );
    if (!result.ok) {
      if (result.error === "conflict") {
        setStatus({ kind: "conflict", message: result.message });
        return;
      }
      setStatus({ kind: "error", message: result.message });
      return;
    }
    if (!("saved" in result)) return;
    setInitialRaw(raw);
    setBaseHash(result.hash);
    setStatus({ kind: "saved" });
    finish({ saved: true, deleted: false, raw });
  }

  async function handleDelete() {
    if (status.kind === "saving") return;
    if (!window.confirm(zhCN.editor.deleteConfirm)) return;
    setStatus({ kind: "saving" });
    const result = await removeDocument(
      localKey,
      baseHash ?? undefined,
    );
    if (!result.ok) {
      if (result.error === "conflict") {
        setStatus({ kind: "conflict", message: result.message });
        return;
      }
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
          : status.kind === "conflict"
            ? zhCN.editor.conflict
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
          {status.kind === "conflict" ? (
            <button
              type="button"
              className="editor-panel__btn editor-panel__btn--primary"
              onClick={reloadFromDisk}
            >
              {zhCN.editor.reload}
            </button>
          ) : null}
          {target.exists ? (
            <button
              type="button"
              className="editor-panel__btn"
              onClick={handleDelete}
              disabled={status.kind === "saving"}
            >
              {zhCN.editor.delete}
            </button>
          ) : null}
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
            disabled={status.kind === "saving" || status.kind === "conflict"}
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
          onChange={(event) => {
            setRaw(event.target.value);
            if (status.kind === "error" || status.kind === "conflict") {
              setStatus({ kind: "idle" });
            }
          }}
          spellCheck={false}
          aria-label={title}
        />
      )}
      {status.kind === "error" ? (
        <footer className="editor-panel__error">{status.message}</footer>
      ) : status.kind === "conflict" ? (
        <footer className="editor-panel__error">
          {zhCN.editor.hintConflict}
          {status.message ? `（${status.message}）` : ""}
        </footer>
      ) : (
        <footer className="editor-panel__hint">
          {zhCN.editor.hintSave} · {zhCN.editor.hintClose}
          {target.exists ? ` · ${zhCN.editor.hintDelete}` : ""}
        </footer>
      )}
    </div>
  );
}
