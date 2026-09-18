import { describe, expect, it } from "vitest";
import {
  dcfValuePerShare,
  evToEbitda,
  fcfYield,
  grahamNumber,
  pegRatio,
  priceToBookVsRoe,
} from "./valuation";

describe("dcfValuePerShare", () => {
  it("returns a positive value for reasonable inputs", () => {
    const value = dcfValuePerShare(100.0, 0.05, 100.0, 0.0, 0.1, 0.02, 5);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(0);
  });

  it("returns null when the discount rate does not exceed the terminal growth rate", () => {
    expect(dcfValuePerShare(100.0, 0.05, 100.0, 0.0, 0.02, 0.05, 5)).toBeNull();
  });
});

describe("pegRatio", () => {
  it("computes and guards", () => {
    expect(pegRatio(20, 10)).toBe(2.0);
    expect(pegRatio(20, 0)).toBeNull();
    expect(pegRatio(null, 10)).toBeNull();
  });
});

describe("evToEbitda", () => {
  it("computes and guards", () => {
    expect(evToEbitda(1000, 100)).toBe(10.0);
    expect(evToEbitda(1000, 0)).toBeNull();
  });
});

describe("grahamNumber", () => {
  it("computes and guards", () => {
    expect(grahamNumber(5, 20)).toBeCloseTo(Math.sqrt(22.5 * 5 * 20));
    expect(grahamNumber(-1, 20)).toBeNull();
    expect(grahamNumber(5, -20)).toBeNull();
  });
});

describe("priceToBookVsRoe", () => {
  it("computes and guards", () => {
    expect(priceToBookVsRoe(2.0, 0.2).score).toBeCloseTo(0.1);
    expect(priceToBookVsRoe(0, 0.2).score).toBeNull();
  });
});

describe("fcfYield", () => {
  it("computes and guards", () => {
    expect(fcfYield(50, 1000)).toBeCloseTo(0.05);
    expect(fcfYield(50, 0)).toBeNull();
  });
});
