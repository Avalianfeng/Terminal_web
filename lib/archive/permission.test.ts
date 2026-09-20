import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVE_ACTION_CAPABILITY,
  MEMBER_GRANT,
  OWNER_GRANT,
  PASSWORD_SESSION_GRANT,
  VISITOR_GRANT,
  can,
  canReachZone,
  grantFor,
  scopeSnapshot,
  zoneMinLevel,
} from "./permission.ts";
import { documentRef } from "./document-ref.ts";
import type { ArchiveSnapshot } from "./types.ts";

describe("grantFor", () => {
  it("maps actors to grants", () => {
    assert.deepEqual(grantFor("visitor"), VISITOR_GRANT);
    assert.deepEqual(grantFor("anonymous-agent"), VISITOR_GRANT);
    assert.deepEqual(grantFor("member"), MEMBER_GRANT);
    assert.deepEqual(grantFor("owner"), OWNER_GRANT);
    assert.deepEqual(grantFor("owner-agent"), OWNER_GRANT);
    assert.deepEqual(grantFor("owner-password"), PASSWORD_SESSION_GRANT);
  });
});

describe("zoneMinLevel", () => {
  it("private requires member", () => {
    assert.equal(zoneMinLevel("public"), "public");
    assert.equal(zoneMinLevel("private"), "member");
  });
});

describe("axiom table Principal × zone × READ/WRITE", () => {
  const cases: Array<{
    actor: Parameters<typeof grantFor>[0];
    publicRead: boolean;
    privateRead: boolean;
    write: boolean;
  }> = [
    {
      actor: "visitor",
      publicRead: true,
      privateRead: false,
      write: false,
    },
    {
      actor: "anonymous-agent",
      publicRead: true,
      privateRead: false,
      write: false,
    },
    {
      actor: "member",
      publicRead: true,
      privateRead: true,
      write: false,
    },
    {
      actor: "owner",
      publicRead: true,
      privateRead: true,
      write: true,
    },
    {
      actor: "owner-agent",
      publicRead: true,
      privateRead: true,
      write: true,
    },
    {
      actor: "owner-password",
      publicRead: true,
      privateRead: false,
      write: false,
    },
  ];

  for (const row of cases) {
    it(`${row.actor}`, () => {
      const grant = grantFor(row.actor);
      assert.equal(can(grant, "read_body", "public"), row.publicRead);
      assert.equal(can(grant, "search", "public"), row.publicRead);
      assert.equal(can(grant, "read_body", "private"), row.privateRead);
      assert.equal(can(grant, "discover_docs", "private"), row.privateRead);
      assert.equal(can(grant, "replace", "public"), row.write);
      assert.equal(can(grant, "replace", "private"), row.write && row.privateRead);
      assert.equal(
        can(grant, "create", "public"),
        row.write || row.actor === "owner-password",
      );
      assert.equal(
        can(grant, "create", "private"),
        row.write || row.actor === "owner-password",
      );
      assert.equal(canReachZone(grant, "public"), row.publicRead);
      assert.equal(canReachZone(grant, "private"), row.privateRead);
    });
  }
});

describe("action capability map", () => {
  it("groups read vs write", () => {
    assert.equal(ARCHIVE_ACTION_CAPABILITY.read_body, "read");
    assert.equal(ARCHIVE_ACTION_CAPABILITY.search, "read");
    assert.equal(ARCHIVE_ACTION_CAPABILITY.create, "writeCreate");
    assert.equal(ARCHIVE_ACTION_CAPABILITY.mkdir, "writeCreate");
    assert.equal(ARCHIVE_ACTION_CAPABILITY.replace, "writeMutate");
  });
});

describe("scopeSnapshot", () => {
  const snapshot: ArchiveSnapshot = {
    person: {
      name: "t",
      description: "",
      currentFocus: "",
      created: "",
      links: [],
    },
    projects: [
      {
        ref: documentRef("projects", "pub"),
        title: "pub",
        summary: "",
        body: "public body",
        tags: [],
      },
      {
        ref: documentRef("projects", "secret", "private"),
        title: "secret",
        summary: "",
        body: "secret body",
        tags: [],
      },
    ],
    thoughts: [],
    resources: [],
    directories: {
      projects: [],
      thoughts: [],
      resources: [],
      private: { projects: ["x"], thoughts: [], resources: [] },
    },
    privateZoneMounted: true,
    timeline: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("visitor omits private docs and private dirs", () => {
    const scoped = scopeSnapshot(snapshot, VISITOR_GRANT);
    assert.equal(scoped.projects.length, 1);
    assert.equal(scoped.projects[0]?.ref.zone, "public");
    assert.equal(scoped.privateZoneMounted, false);
    assert.deepEqual(scoped.directories.private, {
      projects: [],
      thoughts: [],
      resources: [],
    });
  });

  it("password session reads like visitor but can create including private", () => {
    const grant = PASSWORD_SESSION_GRANT;
    assert.equal(can(grant, "read_body", "private"), false);
    assert.equal(can(grant, "replace", "public"), false);
    assert.equal(can(grant, "create", "public"), true);
    assert.equal(can(grant, "create", "private"), true);
    assert.equal(can(grant, "mkdir", "private"), true);
    assert.equal(scopeSnapshot(snapshot, grant).projects.length, 1);
  });

  it("member and owner keep private", () => {
    assert.equal(scopeSnapshot(snapshot, MEMBER_GRANT).projects.length, 2);
    assert.equal(scopeSnapshot(snapshot, OWNER_GRANT).projects.length, 2);
    assert.equal(
      scopeSnapshot(snapshot, MEMBER_GRANT).directories.private.projects[0],
      "x",
    );
  });
});
