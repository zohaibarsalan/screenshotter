# @zohaibarsalan/screenshotter

In-app screenshot capture for React apps.

It runs in the browser, downloads captures directly, and does not require a separate capture service.

## Status

Beta.

The package is usable for local product, UI, and QA workflows. Browser-only rendering still has known fidelity limits, but the install path, API, and current capture flow are ready for beta testing.

## Install

```bash
pnpm add @zohaibarsalan/screenshotter
```

## Quick Start

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

Import that file once from your client entrypoint.

## Framework Entrypoints

Use the same bootstrap code above, then import or render it once in the right client-side place:

| Framework | Recommended location |
| --- | --- |
| React + Vite | `src/main.tsx` imports `src/screenshotter.ts` |
| React + CRA | `src/index.tsx` imports `src/screenshotter.ts` |
| Next.js App Router | client component rendered from `app/layout.tsx` |
| Next.js Pages Router | component rendered from `pages/_app.tsx` |
| TanStack Router | `src/main.tsx` imports `src/screenshotter.ts` |
| TanStack Start | root route/app shell client component |
| Remix | `app/entry.client.tsx` imports `app/screenshotter.client.ts` |
| Astro + React | React island with `client:only="react"` |
| Gatsby | `gatsby-browser.tsx` `wrapRootElement` |

See the repository README for full framework-specific snippets.

## Features

- Floating launcher UI
- Keyboard shortcut: `Cmd/Ctrl + Shift + K`
- Capture modes: `element`, `viewport`, `fullpage`
- Output formats: `png`, `jpeg`
- Adjustable JPEG quality
- Adjustable element padding
- Optional current-theme or both-theme capture
- Browser download output
- Lazy `html-to-image` first with lazy `html2canvas-pro` fallback
- Tree-shakeable package metadata

## Exports

- `ScreenshotterWidget`
- `mountScreenshotter(options)`
- `defineScreenshotterConfig(config)`
- `type ScreenshotterWidgetProps`
- `type MountScreenshotterOptions`
- `type CaptureMode`
- `type CaptureFormat`
- `type CapturePayload`
- `type SaveResult`
- `type ThemeSelection`
- `type ThemeValue`

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `NODE_ENV === "development"` | Enables or disables Screenshotter. |
| `project` | `string` | `"app"` | Project name included in capture metadata and file names. |
| `elementPaddingPx` | `number` | `8` | Extra crop padding around element captures. |
| `captureSettleMs` | `number` | `700` | Delay before capture so UI can settle. |
| `defaultMode` | `"element" \| "viewport" \| "fullpage"` | `"element"` | Initial capture mode. |
| `themeSelectionDefault` | `"current" \| "both"` | `"current"` | Initial theme capture behavior. |
| `themeAdapter` | `{ getCurrentTheme; setTheme }` | `undefined` | Required for both-theme capture. |
| `onSaved` | `(result) => void` | `undefined` | Called after a successful browser download. |
| `onError` | `(message) => void` | `undefined` | Called when capture fails. |
| `mountId` | `string` | `"screenshotter-root"` | DOM id used by `mountScreenshotter`. |

## Notes

- Captures use DOM and Canvas APIs in the browser.
- Element capture renders the viewport context first, then crops the selected element.
- `html-to-image` is lazy-loaded on capture; `html2canvas-pro` is lazy-loaded only for fallback rendering.
- No network transport is used by the current package.
- Published builds omit source maps to keep the installed package smaller.
- Cross-origin fonts/images, videos, iframes, canvas, and some advanced CSS can still differ from native screenshots.

## Repository

- Full docs: https://github.com/zohaibarsalan/screenshotter#readme
- Issues: https://github.com/zohaibarsalan/screenshotter/issues

## License

ISC
