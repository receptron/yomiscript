import { describe, expect, it } from "vitest";
import { defined } from "../src/defined.ts";

describe("defined", () => {
  it.each([0, "", false, null, Number.NaN])("returns a value that is there, falsy ones included (%s)", (v) => {
    expect(defined(v, "x")).toBe(v);
  });
  it("throws with what was missing", () => {
    expect(() => defined([1, 2][5], "the sixth item")).toThrow("the sixth item is missing");
  });
});
