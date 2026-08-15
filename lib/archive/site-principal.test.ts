import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANONYMOUS_VISITOR,
  IMPLICIT_OWNER,
  capabilitiesFrom,
  resolveSitePrincipal,
} from "./site-principal.ts";

describe("resolveSitePrincipal", () => {
  it("prefers a valid session over local-dev", () => {
    const principal = resolveSitePrincipal({
      sessionValid: true,
      nodeEnv: "development",
    });
    assert.deepEqual(principal, { role: "owner", via: "session" });
  });

  it("uses implicit owner in local-dev without a cookie", () => {
    assert.deepEqual(
      resolveSitePrincipal({ sessionValid: false, nodeEnv: "development" }),
      IMPLICIT_OWNER,
    );
  });

  it("is visitor in production without a cookie", () => {
    assert.deepEqual(
      resolveSitePrincipal({ sessionValid: false, nodeEnv: "production" }),
      ANONYMOUS_VISITOR,
    );
  });

  it("is owner in production with a valid session", () => {
    const principal = resolveSitePrincipal({
      sessionValid: true,
      nodeEnv: "production",
    });
    assert.equal(principal.role, "owner");
    assert.equal(principal.via, "session");
  });
});

describe("capabilitiesFrom", () => {
  it("gives uiWrite and musicBff to owner", () => {
    assert.deepEqual(capabilitiesFrom(IMPLICIT_OWNER, { uiWriteKill: false }), {
      uiWrite: true,
      musicBff: true,
    });
  });

  it("kills uiWrite when ARCHIVE_UI_WRITE is false", () => {
    const caps = capabilitiesFrom(IMPLICIT_OWNER, { uiWriteKill: true });
    assert.equal(caps.uiWrite, false);
    assert.equal(caps.musicBff, true);
  });

  it("gives visitors neither capability", () => {
    assert.deepEqual(capabilitiesFrom(ANONYMOUS_VISITOR), {
      uiWrite: false,
      musicBff: false,
    });
  });
});
