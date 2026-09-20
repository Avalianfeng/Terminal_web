import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { grantFromSitePrincipal } from "./grant-principal.ts";
import {
  ANONYMOUS_VISITOR,
  IMPLICIT_OWNER,
} from "./site-principal.ts";
import {
  OWNER_GRANT,
  PASSWORD_SESSION_GRANT,
  VISITOR_GRANT,
} from "./permission.ts";

describe("grantFromSitePrincipal", () => {
  it("maps visitor and local-dev", () => {
    assert.deepEqual(grantFromSitePrincipal(ANONYMOUS_VISITOR), VISITOR_GRANT);
    assert.deepEqual(grantFromSitePrincipal(IMPLICIT_OWNER), OWNER_GRANT);
  });

  it("maps password session vs device step-up", () => {
    assert.deepEqual(
      grantFromSitePrincipal({
        role: "owner",
        via: "session",
        deviceStepUp: false,
      }),
      PASSWORD_SESSION_GRANT,
    );
    assert.deepEqual(
      grantFromSitePrincipal({
        role: "owner",
        via: "session",
        deviceStepUp: true,
      }),
      OWNER_GRANT,
    );
  });
});
