import { describe, expect, it } from "vitest";
import { median } from "./stats";

describe("median", () => {
  it("returns null for an empty or all-null list", () => {
    expect(median([])).toBeNull();
    expect(median([null, null])).toBeNull();
  });

  it("computes the middle value for an odd-length list", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("ignores nulls", () => {
    expect(median([null, 10, null, 20, 30])).toBe(20);
  });

  it("isn't badly distorted by a single extreme outlier, unlike a mean", () => {
    // Sorted: [-57266711, 0.1, 0.11, 0.12, 0.15] -> middle value is 0.11.
    // A mean of these same 5 values would be wildly negative instead.
    const values = [0.1, 0.12, 0.15, 0.11, -57266711];
    expect(median(values)).toBeCloseTo(0.11);
  });
});
