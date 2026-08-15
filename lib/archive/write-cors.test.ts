import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedWriteOrigin } from "./write-cors.ts";

describe("allowedWriteOrigin", () => {
  it("allows the configured public origin", () => {
    assert.equal(
      allowedWriteOrigin({
        origin: "https://cylf.me",
        configuredOrigin: "https://cylf.me",
        nodeEnv: "production",
      }),
      "https://cylf.me",
    );
  });

  it("rejects a random origin in production", () => {
    assert.equal(
      allowedWriteOrigin({
        origin: "https://evil.example",
        configuredOrigin: "https://cylf.me",
        nodeEnv: "production",
        requestUrl: "https://cylf.me/api/v1/items",
      }),
      null,
    );
  });

  it("allows localhost in local-dev", () => {
    assert.equal(
      allowedWriteOrigin({
        origin: "http://localhost:3000",
        nodeEnv: "development",
      }),
      "http://localhost:3000",
    );
  });

  it("allows same-host origin", () => {
    assert.equal(
      allowedWriteOrigin({
        origin: "https://cylf.me",
        requestUrl: "https://cylf.me/api/v1/items",
        nodeEnv: "production",
      }),
      "https://cylf.me",
    );
  });
});
