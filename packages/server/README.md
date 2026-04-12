# @screenshotter/server

Local Node.js save server for Screenshotter capture payloads.

This package exists for custom or legacy workflows that need captures written to disk by a local process. The current recommended frontend package, `@zohaibarsalan/screenshotter`, downloads captures directly in the browser and does not require this server.

## Install

```bash
pnpm add @screenshotter/server
```

Other package managers:

```bash
npm install @screenshotter/server
yarn add @screenshotter/server
bun add @screenshotter/server
```

## Quick Start

```ts
import { startScreenshotterServer } from "@screenshotter/server";

const server = await startScreenshotterServer({
  host: "127.0.0.1",
  port: 4783,
  outputRoot: "./screenshots",
  token: "",
  maxPayloadMB: 30,
  allowOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"],
});

console.log(`Screenshotter server running at ${server.url}`);

// Later:
await server.close();
```

## Config File

```json
{
  "host": "127.0.0.1",
  "port": 4783,
  "outputRoot": "./screenshots",
  "token": "",
  "maxPayloadMB": 30,
  "allowOrigins": ["http://127.0.0.1:3000", "http://localhost:3000"]
}
```

Load it with:

```ts
import {
  loadServerConfigFromFile,
  startScreenshotterServer,
} from "@screenshotter/server";

const config = loadServerConfigFromFile("./screenshotter.server.json");
const server = await startScreenshotterServer(config);

console.log(server.url);
```

## API

### Exports

- `startScreenshotterServer(config)`
- `loadServerConfigFromFile(filePath)`
- `DEFAULT_SERVER_CONFIG`
- `type ScreenshotterServerConfig`
- `type RunningScreenshotterServer`

### `ScreenshotterServerConfig`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `host` | `string` | `"127.0.0.1"` | Must be `127.0.0.1`, `localhost`, or `::1`. |
| `port` | `number` | `4783` | Local HTTP port. |
| `outputRoot` | `string` | `"./screenshots"` | Directory where decoded image files are written. |
| `token` | `string` | `""` | Optional token required in `x-screenshotter-token`. |
| `maxPayloadMB` | `number` | `30` | Maximum JSON payload size. |
| `allowOrigins` | `string[]` | local dev origins | Optional CORS origin allowlist. |

## Endpoints

### `GET /api/health`

Returns:

```json
{ "ok": true }
```

### `POST /api/captures`

Accepts a `CapturePayload` JSON body from `@screenshotter/protocol`.

Headers:

```text
Content-Type: application/json
x-screenshotter-token: <token>
```

Returns a `SaveResult`:

```ts
interface SaveResult {
  ok: true;
  relativePath: string;
  absolutePath: string;
  bytes: number;
}
```

## Security Defaults

- Refuses non-loopback hosts.
- Supports token auth with `x-screenshotter-token`.
- Supports CORS origin allowlists.
- Enforces a maximum payload size.

## Repository

- Full docs: https://github.com/zohaibarsalan/screenshotter#readme
- Issues: https://github.com/zohaibarsalan/screenshotter/issues

## License

ISC
