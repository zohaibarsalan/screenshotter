import { describe, expect, it } from "vitest";
import {
  buildCaptureFileParts,
  clampQualityToScale,
  validateCapturePayload,
  type CapturePayload,
} from "../src/index";

function makePayload(overrides: Partial<CapturePayload> = {}): CapturePayload {
  return {
    project: "dashboard",
    route: "/matter-health",
    mode: "element",
    format: "png",
    quality: 80,
    scale: 1.8,
    theme: "light",
    selector: "[data-testid='status-filters']",
    selectorName: "status-filters",
    viewport: {
      width: 1440,
      height: 900,
      dpr: 2,
    },
    capturedAt: "2026-02-21T13:22:33.000Z",
    imageBase64: "ZmFrZS1pbWFnZS1ieXRlcw==",
    ...overrides,
  };
}

describe("validateCapturePayload", () => {
  it("accepts a valid payload", () => {
    const payload = makePayload();
    const result = validateCapturePayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe("element");
    expect(result.value.quality).toBe(80);
  });

  it("rejects invalid quality bounds", () => {
    const result = validateCapturePayload(makePayload({ quality: 101 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("quality");
  });

  it("rejects element mode without selector data", () => {
    const result = validateCapturePayload(
      makePayload({ selector: undefined, selectorName: undefined }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("selector");
  });

  it("rejects unbounded metadata and viewport values", () => {
    const routeResult = validateCapturePayload(makePayload({ route: `/${"a".repeat(1100)}` }));
    expect(routeResult.ok).toBe(false);
    if (routeResult.ok) return;
    expect(routeResult.error).toContain("route");

    const viewportResult = validateCapturePayload(
      makePayload({ viewport: { width: 50000, height: 900, dpr: 2 } }),
    );
    expect(viewportResult.ok).toBe(false);
    if (viewportResult.ok) return;
    expect(viewportResult.error).toContain("viewport.width");
  });

  it("requires capturedAt to be an ISO timestamp with timezone", () => {
    const result = validateCapturePayload(makePayload({ capturedAt: "2026-02-21 13:22:33" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ISO timestamp");
  });
});

describe("filename helpers", () => {
  it("builds deterministic capture paths and file extensions", () => {
    const parts = buildCaptureFileParts(makePayload({ format: "jpeg" }));
    expect(parts.routeSlug).toBe("matter-health");
    expect(parts.surfaceSlug).toBe("status-filters");
    expect(parts.relativeDir).toBe("live-20260221/matter-health");
    expect(parts.fileName).toBe(
      "matter-health-element-status-filters-light-v2-20260221-132233.jpg",
    );
    expect(parts.relativePath).toBe(
      "live-20260221/matter-health/matter-health-element-status-filters-light-v2-20260221-132233.jpg",
    );
  });

  it("maps quality to scale between 1 and 2", () => {
    expect(clampQualityToScale(1)).toBe(1);
    expect(clampQualityToScale(100)).toBe(2);
    expect(clampQualityToScale(51)).toBeGreaterThan(1.4);
  });
});
