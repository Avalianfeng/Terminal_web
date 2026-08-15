import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeProseHref } from "./markdown-prose.tsx";

describe("sanitizeProseHref", () => {
  it("allows http(s), mailto, and in-site paths", () => {
    assert.equal(sanitizeProseHref("https://example.com/a"), "https://example.com/a");
    assert.equal(sanitizeProseHref("http://example.com"), "http://example.com");
    assert.equal(sanitizeProseHref("mailto:a@b.c"), "mailto:a@b.c");
    assert.equal(sanitizeProseHref("/thoughts/foo"), "/thoughts/foo");
    assert.equal(sanitizeProseHref("#section"), "#section");
  });

  it("rejects javascript, data, and protocol-relative URLs", () => {
    assert.equal(sanitizeProseHref("javascript:alert(1)"), null);
    assert.equal(sanitizeProseHref("data:text/html,hi"), null);
    assert.equal(sanitizeProseHref("//evil.example/x"), null);
  });
});
