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

function ensureMountNode(mountId: string): HTMLElement {
  let node = document.getElementById(mountId);
  if (node) return node;
  node = document.createElement("div");
  node.id = mountId;
  document.body.appendChild(node);
  return node;
}

export function mountScreenshotter(options: MountScreenshotterOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("mountScreenshotter can only run in a browser environment.");
  }

  const { mountId = "screenshotter-root", ...widgetProps } = options;
  const mountNode = ensureMountNode(mountId);

  if (!mountedRoot || mountedNode !== mountNode) {
    mountedRoot?.unmount();
    mountedRoot = createRoot(mountNode);
    mountedNode = mountNode;
  }

  mountedRoot.render(createElement(ScreenshotterWidget, widgetProps));

  return () => {
    if (!mountedRoot || !mountedNode) return;
    mountedRoot.unmount();
    mountedRoot = null;
    mountedNode.remove();
    mountedNode = null;
  };
}
