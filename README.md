# @zohaibarsalan/screenshotter

In-app screenshot capture for React applications.

`@zohaibarsalan/screenshotter` adds a floating capture widget to your app. It supports element, viewport, and full-page capture, downloads files directly in the browser, and does not require a backend service.

## Status

Alpha.

The package is usable for local product, UI, and QA workflows, but browser-only screenshot rendering still has known fidelity limits. Capture renderers are lazy-loaded only when a screenshot starts: `html-to-image` runs first for better typography and CSS fidelity, then `html2canvas-pro` is loaded only if fallback rendering is needed.

## Features

- React widget
- Browser download output
- Element, viewport, and full-page capture
- PNG and JPEG output
- Optional dual-theme capture
- Lazy capture renderer loading
- No backend or Playwright process required

## Requirements

- React `^18` or `^19`
- React DOM `^18` or `^19`
- A browser runtime with DOM and Canvas APIs

## Install

```bash
pnpm add @zohaibarsalan/screenshotter
```

Other package managers:

```bash
npm install @zohaibarsalan/screenshotter
yarn add @zohaibarsalan/screenshotter
bun add @zohaibarsalan/screenshotter
```

## Quick Start

Create a client-only bootstrap file and import it once from your app entrypoint:

```ts
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: true,
    project: "my-app",
  }),
);
```

Open the floating widget from the bottom-right corner, or press `Cmd/Ctrl + Shift + K`.

## Framework Guides

### React + Vite

Create `src/screenshotter.ts`:

```ts
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: import.meta.env.DEV,
    project: "vite-app",
  }),
);
```

Import it once in `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./screenshotter";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

### React + CRA

Create `src/screenshotter.ts`:

```ts
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: process.env.NODE_ENV === "development",
    project: "cra-app",
  }),
);
```

Import it once in `src/index.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./screenshotter";

createRoot(document.getElementById("root")!).render(<App />);
```

### Next.js App Router

Create a client component, for example `app/screenshotter-bootstrap.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

export function ScreenshotterBootstrap() {
  useEffect(() => {
    const unmount = mountScreenshotter(
      defineScreenshotterConfig({
        enabled: process.env.NODE_ENV === "development",
        project: "next-app",
      }),
    );

    return unmount;
  }, []);

  return null;
}
```

Render it once in `app/layout.tsx`:

```tsx
import { ScreenshotterBootstrap } from "./screenshotter-bootstrap";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ScreenshotterBootstrap />
      </body>
    </html>
  );
}
```

### Next.js Pages Router

Create `components/screenshotter-bootstrap.tsx`:

```tsx
import { useEffect } from "react";
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

export function ScreenshotterBootstrap() {
  useEffect(() => {
    const unmount = mountScreenshotter(
      defineScreenshotterConfig({
        enabled: process.env.NODE_ENV === "development",
        project: "next-pages-app",
      }),
    );

    return unmount;
  }, []);

  return null;
}
```

Render it in `pages/_app.tsx`:

```tsx
import type { AppProps } from "next/app";
import { ScreenshotterBootstrap } from "../components/screenshotter-bootstrap";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <ScreenshotterBootstrap />
    </>
  );
}
```

### TanStack Router

Create `src/screenshotter.ts`:

```ts
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: import.meta.env.DEV,
    project: "tanstack-router-app",
  }),
);
```

Import it once in your client entry, commonly `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./screenshotter";

const router = createRouter({ routeTree });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
```

### TanStack Start

Use a client-only component and mount it near the root of your app shell.

Create `src/components/ScreenshotterBootstrap.tsx`:

```tsx
import { useEffect } from "react";
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

export function ScreenshotterBootstrap() {
  useEffect(() => {
    const unmount = mountScreenshotter(
      defineScreenshotterConfig({
        enabled: import.meta.env.DEV,
        project: "tanstack-start-app",
      }),
    );

    return unmount;
  }, []);

  return null;
}
```

Render `<ScreenshotterBootstrap />` once from your root route or app shell. If your TanStack Start setup uses a custom client entry, importing a `src/screenshotter.ts` bootstrap file there also works.

### Remix

Create `app/screenshotter.client.ts`:

```ts
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

mountScreenshotter(
  defineScreenshotterConfig({
    enabled: process.env.NODE_ENV === "development",
    project: "remix-app",
  }),
);
```

Import it once in `app/entry.client.tsx`:

```tsx
import "./screenshotter.client";
```

### Astro With React

Create a React island, for example `src/components/ScreenshotterIsland.tsx`:

```tsx
import { useEffect } from "react";
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

export function ScreenshotterIsland() {
  useEffect(() => {
    const unmount = mountScreenshotter(
      defineScreenshotterConfig({
        enabled: import.meta.env.DEV,
        project: "astro-react-app",
      }),
    );

    return unmount;
  }, []);

  return null;
}
```

Render it once from a layout:

```astro
---
import { ScreenshotterIsland } from "../components/ScreenshotterIsland";
---

<slot />
<ScreenshotterIsland client:only="react" />
```

### Gatsby

Create `src/components/ScreenshotterBootstrap.tsx`:

```tsx
import { useEffect } from "react";
import {
  defineScreenshotterConfig,
  mountScreenshotter,
} from "@zohaibarsalan/screenshotter";

export function ScreenshotterBootstrap() {
  useEffect(() => {
    const unmount = mountScreenshotter(
      defineScreenshotterConfig({
        enabled: process.env.NODE_ENV === "development",
        project: "gatsby-app",
      }),
    );

    return unmount;
  }, []);

  return null;
}
```

Wrap the root element in `gatsby-browser.tsx`:

```tsx
import React from "react";
import { ScreenshotterBootstrap } from "./src/components/ScreenshotterBootstrap";

export const wrapRootElement = ({ element }: { element: React.ReactNode }) => (
  <>
    {element}
    <ScreenshotterBootstrap />
  </>
);
```

## Manual React Mount

Use the component directly if you want it inside an existing React tree:

```tsx
import { ScreenshotterWidget } from "@zohaibarsalan/screenshotter";

export function DevTools() {
  return (
    <ScreenshotterWidget
      enabled={process.env.NODE_ENV === "development"}
      project="my-app"
    />
  );
}
```

## Configuration

`mountScreenshotter(options)` accepts `MountScreenshotterOptions`, which extends `ScreenshotterWidgetProps` and adds `mountId`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `NODE_ENV === "development"` | Enables or disables the widget. |
| `project` | `string` | `"app"` | Project name included in capture metadata and file names. |
| `elementPaddingPx` | `number` | `8` | Extra crop padding around element captures. |
| `captureSettleMs` | `number` | `700` | Delay before capture so UI can settle. |
| `defaultMode` | `"element" \| "viewport" \| "fullpage"` | `"element"` | Initial capture mode. |
| `themeSelectionDefault` | `"current" \| "both"` | `"current"` | Initial theme capture behavior. |
| `themeAdapter` | `{ getCurrentTheme; setTheme }` | `undefined` | Required for both-theme capture. |
| `onSaved` | `(result) => void` | `undefined` | Called after a successful browser download. |
| `onError` | `(message) => void` | `undefined` | Called when capture fails. |
| `mountId` | `string` | `"screenshotter-root"` | DOM id used by `mountScreenshotter`. |

## Dual-Theme Capture

Provide a theme adapter if your app can switch themes programmatically:

```ts
mountScreenshotter(
  defineScreenshotterConfig({
    enabled: true,
    project: "my-app",
    themeSelectionDefault: "both",
    themeAdapter: {
      getCurrentTheme: () =>
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      setTheme: (theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
      },
    },
  }),
);
```

## Output

The widget downloads files directly in the browser. File names are generated from the capture metadata:

```text
live-YYYYMMDD/<route>/<route>-<mode>-<surface>-<theme>-v2-YYYYMMDD-HHMMSS.<format>
```

The `onSaved` callback receives:

```ts
interface SaveResult {
  ok: true;
  relativePath: string;
  absolutePath: string;
  bytes: number;
}
```

## Behavior Notes

- No backend transport is used by the current package.
- Captures are created from DOM and Canvas APIs in the browser.
- Capture lazy-loads `html-to-image` first and lazy-loads `html2canvas-pro` only when fallback rendering is needed.
- Published package builds omit source maps to keep tarballs and installs smaller.
- The package is marked `sideEffects: false` so app bundlers can tree-shake unused exports.
- Element capture renders the viewport context first, then crops the selected element so layout spacing is preserved better.
- Browser-only rendering can still differ from native screenshots for some CSS, color-space, font, canvas, video, iframe, and cross-origin asset cases.

## Troubleshooting

- Widget not visible: set `enabled: true` and verify the bootstrap runs on the client.
- Next.js hydration errors: mount from a client component with `"use client"`.
- No download starts: allow browser downloads/popups for the site.
- Fonts or icons differ: verify fonts are loaded before capture and avoid cross-origin font blocking.
- Element crop has unexpected spacing: reduce `elementPaddingPx`, and prefer selecting a visual container instead of an inline child.
- Both-theme capture unavailable: provide a `themeAdapter`.

## Local Tarball Testing

From this repo:

```bash
pnpm --filter @zohaibarsalan/screenshotter pack --pack-destination /tmp
```

Install the generated tarball in another app:

```bash
pnpm add /tmp/zohaibarsalan-screenshotter-0.1.25.tgz
```

For Next.js apps, clear the dev cache after swapping tarballs:

```bash
rm -rf .next
pnpm dev
```

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run release:check
```

## License

ISC
