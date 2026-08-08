import { describe, expect, test } from "bun:test";
import {
  normalizeUsername,
  usernameKey,
  validateUsername,
} from "./cloud-accounts";

describe("username rules — A–Z, a–z, 0–9, underscore only", () => {
  test("accepts letters, numbers, and underscores (any case)", () => {
    expect(validateUsername("John")).toBeNull();
    expect(validateUsername("john_doe")).toBeNull();
    expect(validateUsername("ABC123")).toBeNull();
    expect(validateUsername("_underscore_")).toBeNull();
    expect(validateUsername("a1_b2C3")).toBeNull();
  });

  test("rejects spaces, symbols, and non-English characters", () => {
    expect(validateUsername("john doe")).not.toBeNull();
    expect(validateUsername("john-doe")).not.toBeNull();
    expect(validateUsername("john@doe")).not.toBeNull();
    expect(validateUsername("john.doe")).not.toBeNull();
    expect(validateUsername("আব্দুল")).not.toBeNull();
    expect(validateUsername("héllo")).not.toBeNull();
  });

  test("enforces 3–30 length", () => {
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("a".repeat(31))).not.toBeNull();
    expect(validateUsername("a".repeat(30))).toBeNull();
  });

  test("normalize trims but preserves case; key is case-insensitive", () => {
    expect(normalizeUsername("  John_1  ")).toBe("John_1");
    expect(usernameKey("John_1")).toBe("john_1");
    expect(usernameKey("JOHN_1")).toBe("john_1");
    expect(usernameKey("john_1")).toBe("john_1");
  });
});
