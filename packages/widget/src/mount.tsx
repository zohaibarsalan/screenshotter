import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ScreenshotterWidget,
  type ScreenshotterWidgetProps,
} from "./ScreenshotterWidget.js";

export interface MountScreenshotterOptions extends ScreenshotterWidgetProps {
  mountId?: string;
}

let mountedRoot: Root | null = null;
let mountedNode: HTMLElement | null = null;
let mountedContainer: Element | DocumentFragment | null = null;

function ensureMountHost(mountId: string): HTMLElement {
  let host = document.getElementById(mountId);
  if (!(host instanceof HTMLElement)) {
    host = document.createElement("div");
    host.id = mountId;
    document.body.appendChild(host);
  }
  host.setAttribute("data-screenshotter-ui", "true");
  return host;
}

function resolveMountContainer(host: HTMLElement): Element | DocumentFragment {
  if (typeof host.attachShadow !== "function") {
    return host;
  }
  return host.shadowRoot ?? host.attachShadow({ mode: "open" });
}

export function mountScreenshotter(options: MountScreenshotterOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("mountScreenshotter can only run in a browser environment.");
  }

  const { mountId = "screenshotter-root", ...widgetProps } = options;
  const mountHost = ensureMountHost(mountId);
  const mountContainer = resolveMountContainer(mountHost);

  if (
    !mountedRoot ||
    mountedNode !== mountHost ||
    mountedContainer !== mountContainer
  ) {
    mountedRoot?.unmount();
    mountedRoot = createRoot(mountContainer);
    mountedNode = mountHost;
    mountedContainer = mountContainer;
  }

  mountedRoot.render(createElement(ScreenshotterWidget, widgetProps));

  return () => {
    if (!mountedRoot || !mountedNode) return;
    mountedRoot.unmount();
    mountedRoot = null;
    mountedNode.remove();
    mountedNode = null;
    mountedContainer = null;
  };
}
