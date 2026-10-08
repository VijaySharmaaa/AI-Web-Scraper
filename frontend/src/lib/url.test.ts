import { describe, expect, it } from "vitest";
import { checkUrl, hostnameOf, normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("adds https:// when missing", () => {
    expect(normalizeUrl("example.com/page")).toBe("https://example.com/page");
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
  });

  it("keeps an existing scheme", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("returns empty for blank input", () => {
    expect(normalizeUrl("   ")).toBe("");
  });
});

describe("checkUrl", () => {
  it.each(["https://example.com", "example.com", "en.wikipedia.org/wiki/Test?x=1#y", "http://sub.domain.co.uk:8080/a"])(
    "accepts %s",
    (input) => {
      expect(checkUrl(input).ok).toBe(true);
    }
  );

  it.each([
    ["", "Please enter a URL."],
    ["not a url", "valid URL"],
    ["localhost", "website address"],
    ["ftp://example.com", "Only http"],
    ["javascript:alert(1)", "valid URL"],
    ["https://user:pass@example.com", "username or password"],
  ])("rejects %j", (input, message) => {
    expect(checkUrl(input)).toEqual({ ok: false, message: expect.stringContaining(message) });
  });

  it("rejects very long urls", () => {
    expect(checkUrl("https://example.com/" + "a".repeat(2100)).ok).toBe(false);
  });
});

describe("hostnameOf", () => {
  it("strips www", () => {
    expect(hostnameOf("https://www.example.com/a")).toBe("example.com");
  });
  it("doesn't crash on junk", () => {
    expect(hostnameOf("???")).toBe("???");
  });
});
