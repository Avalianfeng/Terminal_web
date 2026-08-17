import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDS,
  completableCommandNames,
  getArgComplete,
  getCommand,
  helpSections,
  helpUsagesForSection,
  isKnownCommandName,
  primaryCommandNames,
  resolveAlias,
} from "./command-registry.ts";

describe("command-registry", () => {
  it("resolves aliases to primary names", () => {
    assert.equal(resolveAlias("?"), "help");
    assert.equal(resolveAlias("cls"), "clear");
    assert.equal(resolveAlias("dir"), "ls");
    assert.equal(resolveAlias("ll"), "ls");
    assert.equal(resolveAlias("open"), "open");
    assert.equal(resolveAlias("nope"), "nope");
  });

  it("lists every primary command once", () => {
    const names = primaryCommandNames();
    assert.ok(names.includes("help"));
    assert.ok(names.includes("edit"));
    assert.equal(new Set(names).size, names.length);
    assert.equal(names.length, COMMANDS.length);
  });

  it("exposes aliases in completable names", () => {
    const names = completableCommandNames();
    assert.ok(names.includes("help"));
    assert.ok(names.includes("?"));
    assert.ok(names.includes("cls"));
    assert.ok(names.includes("dir"));
    assert.ok(!names.includes("login"));
    assert.ok(!names.includes("logout"));
    assert.ok(names.includes("edit"));
  });

  it("hides owner-only and secret commands for visitors", () => {
    const names = completableCommandNames("visitor");
    assert.ok(!names.includes("edit"));
    assert.ok(!names.includes("login"));
    assert.ok(names.includes("ls"));
  });

  it("looks up argComplete from the table", () => {
    assert.equal(getArgComplete("cd"), "dirs");
    assert.equal(getArgComplete("ls"), "all");
    assert.equal(getArgComplete("cat"), "cat");
    assert.equal(getArgComplete("open"), "open");
    assert.equal(getArgComplete("edit"), "open");
    assert.equal(getArgComplete("dir"), "all");
    assert.equal(getArgComplete("help"), "none");
    assert.equal(getArgComplete("music"), "music");
    assert.equal(getArgComplete("unknown"), "none");
  });

  it("omits help from help sections but keeps other usages", () => {
    assert.deepEqual([...helpSections()], ["explore", "read", "session"]);
    const explore = helpUsagesForSection("explore");
    assert.ok(explore.some((line) => line.startsWith("ls ")));
    assert.ok(!explore.some((line) => line.startsWith("help")));
    assert.equal(getCommand("help")?.section, undefined);
    assert.ok(helpUsagesForSection("session").some((line) => line.startsWith("edit ")));
    assert.ok(
      !helpUsagesForSection("session", "visitor").some((line) =>
        line.startsWith("edit "),
      ),
    );
    assert.equal(getCommand("login")?.secret, true);
    assert.equal(getCommand("logout")?.secret, true);
    assert.ok(!helpUsagesForSection("session").some((line) => line.startsWith("login")));
  });

  it("recognizes known commands via alias", () => {
    assert.equal(isKnownCommandName("HELP"), true);
    assert.equal(isKnownCommandName("?"), true);
    assert.equal(isKnownCommandName("nope"), false);
  });

  it("registers mkdir/rmdir as owner-only dir commands (ADR 0013)", () => {
    assert.equal(getCommand("mkdir")?.requiresOwner, true);
    assert.equal(getCommand("rmdir")?.requiresOwner, true);
    assert.equal(getArgComplete("mkdir"), "dirs");
    assert.equal(getArgComplete("rmdir"), "dirs");
    const ownerNames = completableCommandNames("owner");
    assert.ok(ownerNames.includes("mkdir"));
    assert.ok(ownerNames.includes("rmdir"));
    const visitorNames = completableCommandNames("visitor");
    assert.ok(!visitorNames.includes("mkdir"));
    assert.ok(!visitorNames.includes("rmdir"));
    assert.ok(
      helpUsagesForSection("explore", "owner").some((line) =>
        line.startsWith("mkdir "),
      ),
    );
    assert.ok(
      !helpUsagesForSection("explore", "visitor").some((line) =>
        line.startsWith("mkdir "),
      ),
    );
  });
});
