import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotterWidget } from "../src";
import type { SaveResult } from "@screenshotter/protocol";

const html2canvasMock = vi.fn();
const htmlToImageCanvasMock = vi.fn();

vi.mock("html2canvas-pro", () => ({
  default: (...args: unknown[]) => html2canvasMock(...args),
}));

vi.mock("html-to-image", () => ({
  toCanvas: (...args: unknown[]) => htmlToImageCanvasMock(...args),
}));

function createMockCanvas(): HTMLCanvasElement {
  return {
    toDataURL: (mime?: string) =>
      `data:${mime || "image/png"};base64,ZmFrZS1jYW52YXMtYnl0ZXM=`,
  } as unknown as HTMLCanvasElement;
}

function makeSaveResult(path = "live-20260221/matter-health/capture.png"): SaveResult {
  return {
    ok: true,
    relativePath: path,
    absolutePath: `/tmp/${path}`,
    bytes: 2048,
  };
}

function assignRect(element: HTMLElement): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      left: 10,
      top: 20,
      width: 180,
      height: 80,
      right: 190,
      bottom: 100,
      x: 10,
      y: 20,
      toJSON: () => null,
    }),
    configurable: true,
  });
}

beforeEach(() => {
  html2canvasMock.mockReset();
  htmlToImageCanvasMock.mockReset();
  html2canvasMock.mockResolvedValue(createMockCanvas());
  htmlToImageCanvasMock.mockResolvedValue(createMockCanvas());
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeSaveResult(),
    }),
  );
});

describe("ScreenshotterWidget", () => {
  it("opens and closes panel and defaults to element mode", () => {
    render(<ScreenshotterWidget enabled captureSettleMs={0} />);

    const panel = screen.getByTestId("screenshotter-panel");
    expect(panel).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    expect(panel).toHaveAttribute("aria-hidden", "false");

    const elementMode = screen.getByTestId("mode-element");
    expect(elementMode).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, {
      key: "k",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  it("supports element pick flow with hover overlay and immediate capture", async () => {
    render(
      <div>
        <div data-testid="target">Target</div>
        <ScreenshotterWidget
          enabled
          captureSettleMs={0}
          endpoint="http://127.0.0.1:4783/api/captures"
        />
      </div>,
    );

    const target = screen.getByTestId("target");
    assignRect(target);

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("action-button"));

    const overlay = document.querySelector(
      "[data-testid='screenshotter-picker-overlay']",
    ) as HTMLElement | null;
    expect(overlay).toBeTruthy();

    fireEvent.mouseMove(target);
    expect(overlay?.style.display).toBe("block");

    fireEvent.click(target);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse(String(call?.[1]?.body || "{}"));
    expect(payload.mode).toBe("element");
    expect(payload.selectorName).toBeTruthy();
  });

  it("sends viewport and fullpage payload modes", async () => {
    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));

    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    const viewportPayload = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0]?.[1]?.body || "{}"),
    );
    expect(viewportPayload.mode).toBe("viewport");

    fireEvent.click(screen.getByTestId("mode-fullpage"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    const fullpagePayload = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1]?.[1]?.body || "{}"),
    );
    expect(fullpagePayload.mode).toBe("fullpage");
  });

  it("captures once for current theme and twice for both with adapter restore", async () => {
    let theme: "light" | "dark" = "light";
    const setTheme = vi.fn(async (next: "light" | "dark") => {
      theme = next;
    });

    const { rerender } = render(
      <ScreenshotterWidget
        enabled
        captureSettleMs={0}
        themeAdapter={{
          getCurrentTheme: () => theme,
          setTheme,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    vi.mocked(fetch).mockClear();
    setTheme.mockClear();
    theme = "light";

    rerender(
      <ScreenshotterWidget
        enabled
        captureSettleMs={0}
        themeAdapter={{
          getCurrentTheme: () => theme,
          setTheme,
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Set theme capture to both"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    expect(setTheme).toHaveBeenCalledWith("light");
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(theme).toBe("light");
  });
});
