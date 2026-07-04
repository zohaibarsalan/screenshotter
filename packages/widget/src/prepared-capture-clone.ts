export interface PreparedElementCaptureClone {
  element: HTMLElement;
  cleanup: () => void;
}

function getElementRenderSize(sourceElement: HTMLElement): { width: number; height: number } {
  const rect = sourceElement.getBoundingClientRect();
  return {
    width: Math.max(1, Math.ceil(rect.width || sourceElement.offsetWidth || 1)),
    height: Math.max(1, Math.ceil(rect.height || sourceElement.offsetHeight || 1)),
  };
}

function appendCaptureFreezeStyles(element: HTMLElement): void {
  const style = element.ownerDocument.createElement("style");
  style.textContent = `
*,
*::before,
*::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  scroll-behavior: auto !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}
`;
  element.prepend(style);
}

function assignFrozenRenderBounds(
  element: HTMLElement,
  width: number,
  height: number,
): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => null,
    }),
  });
}

export function createPreparedElementCaptureClone(
  sourceElement: HTMLElement,
): PreparedElementCaptureClone {
  const sourceDocument = sourceElement.ownerDocument;
  const hostParent = sourceDocument.body ?? sourceDocument.documentElement;
  if (!hostParent) {
    throw new Error("Document is not ready for element capture.");
  }

  const { width, height } = getElementRenderSize(sourceElement);
  const host = sourceDocument.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.dataset.screenshotterPreparedClone = "true";
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = "visible";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";

  const element = sourceElement.cloneNode(true) as HTMLElement;
  for (const script of Array.from(element.querySelectorAll("script"))) {
    script.remove();
  }

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.margin = "0";
  assignFrozenRenderBounds(element, width, height);
  appendCaptureFreezeStyles(element);

  host.appendChild(element);
  hostParent.appendChild(host);

  return {
    element,
    cleanup: () => {
      host.remove();
    },
  };
}
