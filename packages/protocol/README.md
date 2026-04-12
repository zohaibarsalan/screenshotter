# @screenshotter/protocol

Shared TypeScript protocol helpers for Screenshotter capture payloads.

Most frontend users do not need to install this package directly. `@zohaibarsalan/screenshotter` re-exports the public types used by app integrations.

## Install

```bash
pnpm add @screenshotter/protocol
```

Other package managers:

```bash
npm install @screenshotter/protocol
yarn add @screenshotter/protocol
bun add @screenshotter/protocol
```

## Use Cases

- Validate capture payloads before saving them.
- Generate deterministic capture file paths.
- Share capture payload/result types across custom transports.
- Build tooling around screenshots produced by the widget.

## Usage

```ts
import {
  buildCaptureFileParts,
  validateCapturePayload,
} from "@screenshotter/protocol";

const result = validateCapturePayload(input);

if (!result.ok) {
  throw new Error(result.error);
}

const fileParts = buildCaptureFileParts(result.value);

console.log(fileParts.relativePath);
```

## Main Exports

- `validateCapturePayload(input)`
- `buildCaptureFileParts(payload)`
- `clampQualityToScale(quality)`
- `slugifySegment(value, fallback)`
- `formatDateStamp(date)`
- `formatTimestamp(date)`
- `type CapturePayload`
- `type SaveResult`
- `type CaptureMode`
- `type CaptureFormat`
- `type ThemeSelection`
- `type ThemeValue`
- `type ValidationResult`
- `type CaptureFileParts`

## Payload Shape

```ts
interface CapturePayload {
  project: string;
  route: string;
  mode: "element" | "viewport" | "fullpage";
  format: "png" | "jpeg";
  quality: number;
  scale: number;
  theme: "light" | "dark";
  selector?: string;
  selectorName?: string;
  viewport: {
    width: number;
    height: number;
    dpr: number;
  };
  capturedAt: string;
  imageBase64: string;
}
```

## Repository

- Full docs: https://github.com/zohaibarsalan/screenshotter#readme
- Issues: https://github.com/zohaibarsalan/screenshotter/issues

## License

ISC
