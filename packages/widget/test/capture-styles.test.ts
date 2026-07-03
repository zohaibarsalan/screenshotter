import { describe, expect, it } from "vitest";
import {
  hasUnsupportedColorFunction,
  normalizeCssColorForCanvas,
} from "../src/capture-styles";

describe("capture style normalization", () => {
  it("converts oklch and oklab colors into canvas-safe rgb values", () => {
    expect(normalizeCssColorForCanvas("oklch(65% 0.2 150)")).toMatch(/^rgb\(/);
    expect(normalizeCssColorForCanvas("oklab(65% -0.1 0.08 / 75%)")).toMatch(
      /^rgba\(/,
    );
  });

  it("converts color functions inside layered CSS values", () => {
    const normalized = normalizeCssColorForCanvas(
      "0 0 8px oklch(70% 0.16 250), inset 0 0 0 1px color(display-p3 0.4 0.6 1 / 0.8)",
    );

    expect(normalized).not.toContain("oklch");
    expect(normalized).not.toContain("color(display-p3");
    expect(normalized).toContain("rgb(");
    expect(normalized).toContain("rgba(");
  });

  it("leaves already safe colors untouched", () => {
    const value = "rgb(10, 20, 30)";

    expect(hasUnsupportedColorFunction(value)).toBe(false);
    expect(normalizeCssColorForCanvas(value)).toBe(value);
  });
});
