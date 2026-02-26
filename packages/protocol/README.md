# @screenshotter/protocol

Shared TypeScript protocol for Screenshotter capture payloads.

This package provides:

- runtime payload validation
- deterministic capture file naming helpers
- shared types used by `screenshotter`

## Install

```bash
pnpm add @screenshotter/protocol
```

## Usage

```ts
import { validateCapturePayload, buildCaptureFileParts } from "@screenshotter/protocol";

const result = validateCapturePayload(input);
if (!result.ok) throw new Error(result.error);

const parts = buildCaptureFileParts(result.value);
console.log(parts.relativePath);
```

## Main Exports

- `validateCapturePayload(input)`
- `buildCaptureFileParts(payload)`
- `clampQualityToScale(quality)`
- types: `CapturePayload`, `SaveResult`, `CaptureMode`, `CaptureFormat`, `ThemeValue`

## Repository

- Docs and examples: [screenshotter README](https://github.com/zohaibarsalan/screenshotter#readme)
- Issues: [GitHub Issues](https://github.com/zohaibarsalan/screenshotter/issues)

## License

ISC
