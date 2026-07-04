import { describe, expect, it } from "vitest";
import {
  hasUnsupportedColorFunction,
  normalizeCssColorForCanvas,
  sanitizeClonedDocumentForCanvas,
} from "../src/capture-styles";

function createClonedDocumentPair(bodyMarkup: string): {
  sourceDocument: Document;
  clonedDocument: Document;
} {
  const sourceDocument = document.implementation.createHTMLDocument("source");
  sourceDocument.body.innerHTML = bodyMarkup;

  const clonedDocument = document.implementation.createHTMLDocument("clone");
  clonedDocument.body.innerHTML = bodyMarkup;

  return { sourceDocument, clonedDocument };
}

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

  it("normalizes unsupported fill and stroke colors on cloned SVG elements", () => {
    const { sourceDocument, clonedDocument } = createClonedDocumentPair(`
      <svg viewBox="0 0 100 100">
        <path
          data-testid="arc"
          d="M10 10 H90"
          style="fill: oklch(65% 0.2 150); stroke: oklch(45% 0.12 280 / 75%);"
        ></path>
      </svg>
    `);

    sanitizeClonedDocumentForCanvas(sourceDocument, clonedDocument);

    const clonedPath = clonedDocument.querySelector('[data-testid="arc"]');
    expect(clonedPath).toBeInstanceOf(SVGElement);
    expect((clonedPath as SVGElement).style.getPropertyValue("fill")).toMatch(
      /^rgb\(/,
    );
    expect((clonedPath as SVGElement).style.getPropertyValue("stroke")).toMatch(
      /^rgba\(/,
    );
    expect(clonedPath?.getAttribute("style")).not.toContain("oklch");
  });

  it("preserves basic text styles on cloned SVG text and tspan nodes", () => {
    const { sourceDocument, clonedDocument } = createClonedDocumentPair(`
      <svg viewBox="0 0 100 100">
        <text
          data-testid="label"
          style="dominant-baseline: middle; fill: rgb(10, 20, 30); font-family: Inter; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; stroke: oklch(60% 0.1 30); text-anchor: middle;"
        >
          <tspan
            data-testid="value"
            style="fill: oklch(70% 0.16 250); font-size: 12px; font-style: italic; font-weight: 500;"
          >
            80.1%
          </tspan>
        </text>
      </svg>
    `);
    clonedDocument.querySelector('[data-testid="label"]')?.removeAttribute("style");
    clonedDocument.querySelector('[data-testid="value"]')?.removeAttribute("style");

    sanitizeClonedDocumentForCanvas(sourceDocument, clonedDocument);

    const clonedLabel = clonedDocument.querySelector('[data-testid="label"]');
    const clonedValue = clonedDocument.querySelector('[data-testid="value"]');
    expect(clonedLabel).toBeInstanceOf(SVGElement);
    expect(clonedValue).toBeInstanceOf(SVGElement);

    const labelStyle = (clonedLabel as SVGElement).style;
    expect(labelStyle.getPropertyValue("dominant-baseline")).toBe("middle");
    expect(labelStyle.getPropertyValue("font-family")).toBe("Inter");
    expect(labelStyle.getPropertyValue("font-size")).toBe("18px");
    expect(labelStyle.getPropertyValue("font-weight")).toBe("700");
    expect(labelStyle.getPropertyValue("letter-spacing")).toBe("0.5px");
    expect(labelStyle.getPropertyValue("text-anchor")).toBe("middle");
    expect(labelStyle.getPropertyValue("stroke")).toMatch(/^rgb\(/);

    const valueStyle = (clonedValue as SVGElement).style;
    expect(valueStyle.getPropertyValue("fill")).toMatch(/^rgb\(/);
    expect(valueStyle.getPropertyValue("font-size")).toBe("12px");
    expect(valueStyle.getPropertyValue("font-style")).toBe("italic");
    expect(valueStyle.getPropertyValue("font-weight")).toBe("500");
  });
});
