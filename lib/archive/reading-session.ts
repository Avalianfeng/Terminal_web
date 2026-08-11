/**
 * Reading session machine — leave / demote phases on top of ReadingState.
 * React applies `{ session, effects }`; animation durations stay in the UI.
 */

import type { ArchiveDocument, ArchiveSnapshot, ReadingSurface } from "./types";
import {
  clearReadingState,
  closeMain,
  closeRailItem,
  dismissDocumentByKey,
  emptyReadingState,
  openReading,
  openReadingMany,
  readingSurfaceKey,
  reconcileReadingWithSnapshot,
  replaceDocumentSurface,
  type ReadingState,
} from "./reading-state";

export type LeaveIntent = "close" | "clear";

export type ReadingPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "leaving"; readonly intent: LeaveIntent }
  | { readonly kind: "demoting"; readonly ghost: ReadingSurface };

export type ReadingSession = {
  readonly reading: ReadingState;
  readonly phase: ReadingPhase;
};

export type ReadingEffect = "focusTerminal";

export type ReadingSessionResult = {
  session: ReadingSession;
  effects: ReadingEffect[];
};

const IDLE: ReadingPhase = { kind: "idle" };

export function emptyReadingSession(): ReadingSession {
  return { reading: emptyReadingState(), phase: IDLE };
}

function ok(
  session: ReadingSession,
  effects: ReadingEffect[] = [],
): ReadingSessionResult {
  return { session, effects };
}

function cancelDemote(session: ReadingSession): ReadingSession {
  if (session.phase.kind !== "demoting") return session;
  return { reading: session.reading, phase: IDLE };
}

function beginLeave(
  session: ReadingSession,
  intent: LeaveIntent,
  animateLeave: boolean,
): ReadingSessionResult {
  if (!session.reading.main || session.phase.kind === "leaving") {
    return ok(session);
  }

  const willPromote =
    intent === "close" && session.reading.rail.length > 0;
  const startEffects: ReadingEffect[] = willPromote ? [] : ["focusTerminal"];

  if (!animateLeave) {
    const finished = completeLeave(
      { reading: session.reading, phase: { kind: "leaving", intent } },
    );
    return ok(finished.session, [...startEffects, ...finished.effects]);
  }

  return ok(
    { reading: session.reading, phase: { kind: "leaving", intent } },
    startEffects,
  );
}

function completeLeave(session: ReadingSession): ReadingSessionResult {
  if (session.phase.kind !== "leaving") {
    return ok(session);
  }

  const { intent } = session.phase;

  if (intent === "clear") {
    return ok(
      { reading: clearReadingState(), phase: IDLE },
      ["focusTerminal"],
    );
  }

  const reading = closeMain(session.reading);
  const effects: ReadingEffect[] = reading.main ? [] : ["focusTerminal"];
  return ok({ reading, phase: IDLE }, effects);
}

/** Esc / panel close — cancel demote ghost, then leave main (promote rail if any). */
export function requestClose(
  session: ReadingSession,
  options: { animateLeave: boolean },
): ReadingSessionResult {
  return beginLeave(cancelDemote(session), "close", options.animateLeave);
}

/**
 * `clear` command: drop rail immediately, then leave main (or empty + focus if no main).
 */
export function requestClear(
  session: ReadingSession,
  options: { animateLeave: boolean },
): ReadingSessionResult {
  const base = cancelDemote(session);
  const clearedRail: ReadingSession = {
    reading: { main: base.reading.main, rail: [] },
    phase: IDLE,
  };

  if (!clearedRail.reading.main) {
    return ok(emptyReadingSession(), ["focusTerminal"]);
  }

  return beginLeave(clearedRail, "clear", options.animateLeave);
}

/** Open / replace main (and optional batch rail). Interrupts in-flight leave. */
export function swapSurfaces(
  session: ReadingSession,
  surfaces: ReadingSurface[],
  options: { animateDemote: boolean },
): ReadingSessionResult {
  if (surfaces.length === 0) return ok(session);

  let current = session;
  const effects: ReadingEffect[] = [];

  if (current.phase.kind === "leaving") {
    const finished = completeLeave(current);
    current = finished.session;
    effects.push(...finished.effects);
  }

  const prevMain = current.reading.main;
  const reading =
    surfaces.length === 1
      ? openReading(current.reading, surfaces[0]!)
      : openReadingMany(current.reading, surfaces);

  const nextMain = reading.main;
  const willDemote =
    options.animateDemote &&
    Boolean(prevMain) &&
    Boolean(nextMain) &&
    readingSurfaceKey(prevMain!) !== readingSurfaceKey(nextMain!);

  const phase: ReadingPhase =
    willDemote && prevMain
      ? { kind: "demoting", ghost: prevMain }
      : IDLE;

  return ok({ reading, phase }, effects);
}

/** Promote from rail — ignored while leaving (matches prior UI). */
export function requestPromote(
  session: ReadingSession,
  surface: ReadingSurface,
  options: { animateDemote: boolean },
): ReadingSessionResult {
  if (session.phase.kind === "leaving") return ok(session);
  return swapSurfaces(session, [surface], options);
}

export function leaveDone(session: ReadingSession): ReadingSessionResult {
  return completeLeave(session);
}

export function demoteDone(session: ReadingSession): ReadingSessionResult {
  if (session.phase.kind !== "demoting") return ok(session);
  return ok({ reading: session.reading, phase: IDLE });
}

/** Structural patches that keep the current phase (unless noted). */
export function dismissRail(
  session: ReadingSession,
  key: string,
): ReadingSessionResult {
  return ok({
    reading: closeRailItem(session.reading, key),
    phase: session.phase,
  });
}

export function dismissDocument(
  session: ReadingSession,
  key: string,
): ReadingSessionResult {
  return ok({
    reading: dismissDocumentByKey(session.reading, key),
    phase: session.phase,
  });
}

export function replaceDocument(
  session: ReadingSession,
  document: ArchiveDocument,
): ReadingSessionResult {
  const reading = replaceDocumentSurface(session.reading, document);
  let phase = session.phase;
  if (phase.kind === "demoting" && phase.ghost.kind === "document") {
    const replaced = replaceDocumentSurface(
      { main: phase.ghost, rail: [] },
      document,
    ).main;
    if (replaced) {
      phase = { kind: "demoting", ghost: replaced };
    }
  }
  return ok({ reading, phase });
}

export function reconcileSession(
  session: ReadingSession,
  snapshot: ArchiveSnapshot,
): ReadingSessionResult {
  const reading = reconcileReadingWithSnapshot(session.reading, snapshot);
  let phase = session.phase;
  if (phase.kind === "demoting") {
    const ghostReading = reconcileReadingWithSnapshot(
      { main: phase.ghost, rail: [] },
      snapshot,
    );
    if (!ghostReading.main) {
      phase = IDLE;
    } else if (ghostReading.main !== phase.ghost) {
      phase = { kind: "demoting", ghost: ghostReading.main };
    }
  }
  if (reading === session.reading && phase === session.phase) {
    return ok(session);
  }
  return ok({ reading, phase });
}

export function isLeaving(session: ReadingSession): boolean {
  return session.phase.kind === "leaving";
}

export function demoteGhost(session: ReadingSession): ReadingSurface | null {
  return session.phase.kind === "demoting" ? session.phase.ghost : null;
}
