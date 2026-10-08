import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { describeError } from "./errors";

const http = (status: number, code?: string, retryAfter?: number) =>
  new ApiError("msg", { kind: "http", status, code, retryAfter });

describe("describeError", () => {
  it("network errors can be retried", () => {
    const info = describeError(new ApiError("x", { kind: "network" }));
    expect(info.title).toBe("Can't reach the server");
    expect(info.retryable).toBe(true);
  });

  it("bad urls ask the user to edit, not retry", () => {
    const info = describeError(http(400));
    expect(info.retryable).toBe(false);
    expect(info.editUrl).toBe(true);
  });

  it("throttling keeps retry_after", () => {
    const info = describeError(http(429, "throttled", 30));
    expect(info.title).toBe("Slow down a little");
    expect(info.retryAfter).toBe(30);
  });

  it("ai quota is different from throttling", () => {
    expect(describeError(http(429, "ai_quota")).title).toBe("The AI is busy");
  });

  it("uses a specific hint per error code", () => {
    expect(describeError(http(422, "dns_not_found")).title).toBe("Website not found");
    expect(describeError(http(422, "no_text")).hint).toContain("JavaScript");
    expect(describeError(http(400, "private_address")).hint).toContain("localhost");
  });

  it("falls back to the status code for unknown codes", () => {
    expect(describeError(http(422, "something_new")).title).toBe("Couldn't read this page");
  });

  it("handles non-api errors", () => {
    expect(describeError(new TypeError("boom")).title).toBe("Something went wrong");
  });
});
