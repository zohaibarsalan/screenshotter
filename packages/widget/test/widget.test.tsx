import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotterWidget } from "../src";

const htmlToImageCanvasMock = vi.fn();
const getFontEmbedCssMock = vi.fn();

vi.mock("html-to-image", () => ({
  getFontEmbedCSS: (...args: unknown[]) => getFontEmbedCssMock(...args),
  toCanvas: (...args: unknown[]) => htmlToImageCanvasMock(...args),
}));

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 320,
    height: 180,
    toDataURL: (mime?: string) =>
      `data:${mime || "image/png"};base64,ZmFrZS1jYW52YXMtYnl0ZXM=`,
  } as unknown as HTMLCanvasElement;
}

function assignRect(
  element: HTMLElement,
  rect: Partial<Pick<DOMRect, "left" | "top" | "width" | "height">> = {},
): void {
  const left = rect.left ?? 10;
  const top = rect.top ?? 20;
  const width = rect.width ?? 180;
  const height = rect.height ?? 80;
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => null,
    }),
    configurable: true,
  });
}

function setupDownloadMocks(): {
  clickSpy: ReturnType<typeof vi.spyOn>;
  createObjectURLMock: ReturnType<typeof vi.fn>;
  revokeObjectURLMock: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  const createObjectURLMock = vi.fn(() => "blob:download-mock");
  const revokeObjectURLMock = vi.fn();

  Object.defineProperty(globalThis.URL, "createObjectURL", {
    value: createObjectURLMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis.URL, "revokeObjectURL", {
    value: revokeObjectURLMock,
    configurable: true,
    writable: true,
  });

  return {
    clickSpy,
    createObjectURLMock,
    revokeObjectURLMock,
    restore: () => clickSpy.mockRestore(),
  };
}

beforeEach(() => {
  htmlToImageCanvasMock.mockReset();
  getFontEmbedCssMock.mockReset();
  htmlToImageCanvasMock.mockResolvedValue(createMockCanvas());
  getFontEmbedCssMock.mockResolvedValue("@font-face { font-family: CaptureIcon; }");
});

describe("ScreenshotterWidget", () => {
  it("opens and closes panel and defaults to element mode", () => {
    render(<ScreenshotterWidget enabled captureSettleMs={0} />);

    const panel = screen.getByTestId("screenshotter-panel");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(screen.getByTestId("screenshotter-launcher")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByTestId("screenshotter-launcher")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    const elementMode = screen.getByTestId("mode-element");
    expect(elementMode).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, {
      key: "k",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  it("supports element pick flow and downloads the capture", async () => {
    const downloads = setupDownloadMocks();
    const onSaved = vi.fn();

    render(
      <div>
        <div data-testid="target">Target</div>
        <ScreenshotterWidget enabled captureSettleMs={0} onSaved={onSaved} />
      </div>,
    );

    const target = screen.getByTestId("target");
    assignRect(target);

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("action-button"));
    expect(screen.getByTestId("screenshotter-panel")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const overlay = document.querySelector(
      "[data-testid='screenshotter-picker-overlay']",
    ) as HTMLElement | null;
    expect(overlay).toBeTruthy();

    fireEvent.mouseMove(target);
    expect(overlay?.style.display).toBe("block");

    fireEvent.click(target);

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    const saved = onSaved.mock.calls[0]?.[0];
    expect(saved?.relativePath).toContain("-element-");
    expect(htmlToImageCanvasMock).toHaveBeenCalledTimes(1);
    expect(htmlToImageCanvasMock.mock.calls[0]?.[0]).toBe(target);
    expect(downloads.createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(downloads.revokeObjectURLMock).toHaveBeenCalledTimes(1);

    downloads.restore();
  });

  it("resolves generic flex wrappers to the surrounding named card", async () => {
    const downloads = setupDownloadMocks();
    const onSaved = vi.fn();

    render(
      <div>
        <article style={{ border: "1px solid currentColor", display: "block" }}>
          <h2>Matter Health</h2>
          <div className="flex items-center gap-2" style={{ display: "flex" }}>
            <span>80.1%</span>
          </div>
        </article>
        <ScreenshotterWidget enabled captureSettleMs={0} onSaved={onSaved} />
      </div>,
    );

    const card = screen.getByText("Matter Health").closest("article");
    const flexWrapper = screen.getByText("80.1%").parentElement;
    const metric = screen.getByText("80.1%");
    if (!(card instanceof HTMLElement) || !(flexWrapper instanceof HTMLElement)) {
      throw new Error("Test fixture did not render expected card.");
    }
    assignRect(metric, { left: 710, top: 370, width: 60, height: 24 });
    assignRect(flexWrapper, { left: 680, top: 330, width: 220, height: 160 });
    assignRect(card, { left: 582, top: 236, width: 430, height: 317 });

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("action-button"));
    fireEvent.mouseMove(metric, { clientX: 720, clientY: 380 });
    fireEvent.click(metric, { clientX: 720, clientY: 380 });

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });

    const saved = onSaved.mock.calls[0]?.[0];
    expect(saved?.relativePath).toContain("-element-matter-health-");
    expect(saved?.relativePath).not.toContain("-flex-");
    expect(htmlToImageCanvasMock.mock.calls[0]?.[0]).toBe(card);

    downloads.restore();
  });

  it("downloads viewport and fullpage captures with mode-specific names", async () => {
    const downloads = setupDownloadMocks();
    const onSaved = vi.fn();

    render(<ScreenshotterWidget enabled captureSettleMs={0} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));

    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.click(screen.getByTestId("action-button"));
    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });
    const viewportSaved = onSaved.mock.calls[0]?.[0];
    expect(viewportSaved?.relativePath).toContain("-viewport-");

    fireEvent.click(screen.getByTestId("mode-fullpage"));
    fireEvent.click(screen.getByTestId("action-button"));
    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(2);
    });
    const fullpageSaved = onSaved.mock.calls[1]?.[0];
    expect(fullpageSaved?.relativePath).toContain("-fullpage-");

    downloads.restore();
  });

  it("uses html-to-image for viewport captures", async () => {
    const downloads = setupDownloadMocks();

    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });

    expect(htmlToImageCanvasMock).toHaveBeenCalledTimes(1);
    expect(htmlToImageCanvasMock.mock.calls[0]?.[0]).toBe(document.documentElement);
    const htmlToImageOptions = htmlToImageCanvasMock.mock.calls[0]?.[1] as
      | {
          filter?: (node: HTMLElement) => boolean;
          fontEmbedCSS?: string;
          preferredFontFormat?: string;
        }
      | undefined;
    expect(htmlToImageOptions?.filter?.({} as HTMLElement)).toBe(true);
    expect(htmlToImageOptions?.fontEmbedCSS).toContain("CaptureIcon");
    expect(htmlToImageOptions?.preferredFontFormat).toBeUndefined();

    downloads.restore();
  });

  it("applies selected preset dimensions for viewport and fullpage capture", async () => {
    const downloads = setupDownloadMocks();

    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));

    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.change(screen.getByTestId("capture-preset-select"), {
      target: { value: "iphone-15" },
    });
    fireEvent.click(screen.getByTestId("action-button"));
    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });
    const viewportOptions = htmlToImageCanvasMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(viewportOptions.width).toBe(393);
    expect(Number(viewportOptions.height)).toBeGreaterThanOrEqual(852);

    fireEvent.click(screen.getByTestId("mode-fullpage"));
    fireEvent.change(screen.getByTestId("capture-preset-select"), {
      target: { value: "macbook-pro-14" },
    });
    fireEvent.click(screen.getByTestId("action-button"));
    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(2);
    });
    const fullpageOptions = htmlToImageCanvasMock.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(fullpageOptions.width).toBe(1512);
    expect(Number(fullpageOptions.height)).toBeGreaterThanOrEqual(982);

    downloads.restore();
  });

  it("uses mobile preset dimensions for viewport capture", async () => {
    const downloads = setupDownloadMocks();

    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
    fireEvent.click(screen.getByTestId("mode-viewport"));

    fireEvent.change(screen.getByTestId("capture-preset-select"), {
      target: { value: "pixel-8" },
    });
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });

    const viewportOptions = htmlToImageCanvasMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(viewportOptions.width).toBe(412);
    expect(Number(viewportOptions.height)).toBeGreaterThanOrEqual(915);

    downloads.restore();
  });

  it("captures once for current theme and twice for both with adapter restore", async () => {
    const downloads = setupDownloadMocks();
    const onSaved = vi.fn();
    let theme: "light" | "dark" = "light";
    const setTheme = vi.fn(async (next: "light" | "dark") => {
      theme = next;
    });

    const { rerender } = render(
      <ScreenshotterWidget
        enabled
        captureSettleMs={0}
        onSaved={onSaved}
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
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);

    downloads.clickSpy.mockClear();
    onSaved.mockClear();
    setTheme.mockClear();
    theme = "light";

    rerender(
      <ScreenshotterWidget
        enabled
        captureSettleMs={0}
        onSaved={onSaved}
        themeAdapter={{
          getCurrentTheme: () => theme,
          setTheme,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
    fireEvent.click(screen.getByLabelText("Set theme capture to both"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(2);
    });
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(setTheme).toHaveBeenCalledWith("light");
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(theme).toBe("light");

    downloads.restore();
  });

  it("keeps the panel hotkey inactive while typing in inputs", () => {
    render(
      <div>
        <input data-testid="editor" />
        <ScreenshotterWidget enabled captureSettleMs={0} />
      </div>,
    );

    const panel = screen.getByTestId("screenshotter-panel");
    expect(panel).toHaveAttribute("aria-hidden", "true");

    const input = screen.getByTestId("editor");
    fireEvent.focus(input);
    fireEvent.keyDown(input, {
      key: "k",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  it("shows context-aware advanced controls based on mode and format", () => {
    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));

    expect(screen.queryByText("JPEG quality")).toBeNull();
    expect(screen.getByText("Padding")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-preset-select")).toBeNull();
    expect(screen.queryByTestId("capture-renderer-select")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use JPEG format" }));
    expect(screen.getByText("JPEG quality")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mode-viewport"));
    expect(screen.queryByText("Padding")).toBeNull();
    expect(screen.getByText("JPEG quality")).toBeInTheDocument();
    expect(screen.getByTestId("capture-preset-select")).toBeInTheDocument();
  });

  it("cancels element picker overlay on escape", async () => {
    render(
      <div>
        <div data-testid="target">Target</div>
        <ScreenshotterWidget enabled captureSettleMs={0} />
      </div>,
    );

    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("action-button"));

    expect(
      document.querySelector("[data-testid='screenshotter-picker-overlay']"),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(
        document.querySelector("[data-testid='screenshotter-picker-overlay']"),
      ).toBeNull();
    });
  });

  it("prevents duplicate captures while a capture is in progress", async () => {
    const downloads = setupDownloadMocks();
    let resolveCanvas: (value: HTMLCanvasElement) => void = () => undefined;
    const pendingCanvas = new Promise<HTMLCanvasElement>((resolve) => {
      resolveCanvas = resolve;
    });
    htmlToImageCanvasMock.mockImplementationOnce(() => pendingCanvas);

    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.click(screen.getByTestId("action-button"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(htmlToImageCanvasMock).toHaveBeenCalledTimes(1);
    });

    resolveCanvas(createMockCanvas());

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });

    downloads.restore();
  });

  it("announces capture status near the action", async () => {
    const downloads = setupDownloadMocks();

    render(<ScreenshotterWidget enabled captureSettleMs={0} />);
    fireEvent.click(screen.getByTestId("screenshotter-launcher"));
    fireEvent.click(screen.getByTestId("mode-viewport"));
    fireEvent.click(screen.getByTestId("action-button"));

    await waitFor(() => {
      expect(downloads.clickSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.getAllByRole("status").some((node) => /saved/i.test(node.textContent ?? ""))).toBe(
      true,
    );
    expect(screen.getByTestId("action-button")).toHaveAccessibleDescription(/saved/i);

    downloads.restore();
  });
});
