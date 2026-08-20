import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { READ_COMMAND_ACTION, writeActionFor } from "./command-intent.ts";

describe("command-intent", () => {
  it("maps write commands to ArchiveActionId", () => {
    assert.equal(writeActionFor("edit", { exists: false }), "create");
    assert.equal(writeActionFor("edit", { exists: true }), "replace");
    assert.equal(writeActionFor("rm"), "delete_doc");
    assert.equal(writeActionFor("mkdir"), "mkdir");
    assert.equal(writeActionFor("rmdir"), "rmdir");
  });

  it("exposes read command action table", () => {
    assert.equal(READ_COMMAND_ACTION.open, "open");
    assert.equal(READ_COMMAND_ACTION.find, "find");
    assert.equal(READ_COMMAND_ACTION.cat, "read_body");
  });
});
