import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReadingSurface } from "./types.ts";
import { emptyReadingSession } from "./reading-session.ts";
import {
  demoteDone,
  demoteGhost,
  isLeaving,
  leaveDone,
  requestClear,
  requestClose,
  requestPromote,
  swapSurfaces,
} from "./reading-session.ts";

function doc(slug: string): ReadingSurface {
  return {
    kind: "document",
    document: {
      ref: { group: "thoughts", slug },
      title: slug,
      summary: "",
      body: "",
      tags: [],
    },
  };
}

describe("reading-session", () => {
  it("requestClose without rail focuses and clears (no animate)", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a")], { animateDemote: false }).session;

    const result = requestClose(session, { animateLeave: false });
    assert.equal(result.session.reading.main, null);
    assert.equal(result.session.phase.kind, "idle");
    assert.deepEqual(result.effects, ["focusTerminal", "focusTerminal"]);
  });

  it("requestClose with rail promotes without focus (no animate)", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a"), doc("b")], {
      animateDemote: false,
    }).session;
    // b main, a rail
    assert.equal(session.reading.main && "document" in session.reading.main
      ? session.reading.main.document.ref.slug
      : null, "b");

    const result = requestClose(session, { animateLeave: false });
    assert.equal(
      result.session.reading.main?.kind === "document"
        ? result.session.reading.main.document.ref.slug
        : null,
      "a",
    );
    assert.equal(result.session.reading.rail.length, 0);
    assert.deepEqual(result.effects, []);
  });

  it("requestClose with animate enters leaving then leaveDone", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a")], { animateDemote: false }).session;

    const started = requestClose(session, { animateLeave: true });
    assert.equal(isLeaving(started.session), true);
    assert.deepEqual(started.effects, ["focusTerminal"]);
    assert.ok(started.session.reading.main);

    const done = leaveDone(started.session);
    assert.equal(done.session.reading.main, null);
    assert.deepEqual(done.effects, ["focusTerminal"]);
  });

  it("requestClear drops rail then clears main", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a"), doc("b")], {
      animateDemote: false,
    }).session;

    const result = requestClear(session, { animateLeave: false });
    assert.equal(result.session.reading.main, null);
    assert.equal(result.session.reading.rail.length, 0);
    assert.ok(result.effects.includes("focusTerminal"));
  });

  it("requestClear with no main focuses immediately", () => {
    const result = requestClear(emptyReadingSession(), { animateLeave: true });
    assert.equal(result.session.reading.main, null);
    assert.deepEqual(result.effects, ["focusTerminal"]);
  });

  it("swap with animateDemote sets ghost; demoteDone clears it", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a")], { animateDemote: false }).session;

    const swapped = swapSurfaces(session, [doc("b")], { animateDemote: true });
    assert.equal(
      swapped.session.reading.main?.kind === "document"
        ? swapped.session.reading.main.document.ref.slug
        : null,
      "b",
    );
    assert.equal(
      demoteGhost(swapped.session)?.kind === "document"
        ? demoteGhost(swapped.session)!.document.ref.slug
        : null,
      "a",
    );

    const done = demoteDone(swapped.session);
    assert.equal(demoteGhost(done.session), null);
    assert.equal(done.session.phase.kind, "idle");
  });

  it("swap without animateDemote stays idle", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a")], { animateDemote: false }).session;
    const swapped = swapSurfaces(session, [doc("b")], { animateDemote: false });
    assert.equal(swapped.session.phase.kind, "idle");
  });

  it("swap interrupts leaving by completing leave first", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a"), doc("b")], {
      animateDemote: false,
    }).session;
    // main b, rail a
    session = requestClose(session, { animateLeave: true }).session;
    assert.equal(isLeaving(session), true);

    const swapped = swapSurfaces(session, [doc("c")], { animateDemote: false });
    // leaveDone close should have promoted a before opening c
    assert.equal(isLeaving(swapped.session), false);
    assert.equal(
      swapped.session.reading.main?.kind === "document"
        ? swapped.session.reading.main.document.ref.slug
        : null,
      "c",
    );
    assert.ok(
      swapped.session.reading.rail.some(
        (entry) =>
          entry.kind === "document" && entry.document.ref.slug === "a",
      ),
    );
  });

  it("requestPromote is ignored while leaving", () => {
    let session = emptyReadingSession();
    session = swapSurfaces(session, [doc("a"), doc("b")], {
      animateDemote: false,
    }).session;
    session = requestClose(session, { animateLeave: true }).session;

    const promoted = requestPromote(session, doc("a"), { animateDemote: true });
    assert.equal(isLeaving(promoted.session), true);
    assert.equal(
      promoted.session.reading.main?.kind === "document"
        ? promoted.session.reading.main.document.ref.slug
        : null,
      "b",
    );
  });

  it("leaveDone is idempotent when idle", () => {
    const result = leaveDone(emptyReadingSession());
    assert.equal(result.session.phase.kind, "idle");
    assert.deepEqual(result.effects, []);
  });
});
