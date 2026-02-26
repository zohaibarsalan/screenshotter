# @screenshotter/server

Local Node.js save server for Screenshotter capture payloads.

## Install

```bash
pnpm add @screenshotter/server
```

## Quick Start

```js
import { startScreenshotterServer } from "@screenshotter/server";

const running = await startScreenshotterServer({
  host: "127.0.0.1",
  port: 4783,
  outputRoot: "./screenshots",
  token: "",
  maxPayloadMB: 30,
  allowOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"],
});

console.log(running.url);
```

## API

### Exports

- `startScreenshotterServer(config)`
- `loadServerConfigFromFile(filePath)`
- `DEFAULT_SERVER_CONFIG`
- `type ScreenshotterServerConfig`
- `type RunningScreenshotterServer`

### Endpoints

- `GET /api/health`
- `POST /api/captures`

## Security Defaults

- Loopback-only host guard (`127.0.0.1`, `localhost`, `::1`)
- Optional token auth via `x-screenshotter-token`
- Optional CORS allowlist via `allowOrigins`

## Repository

- Docs and widget integration: [screenshotter README](https://github.com/zohaibarsalan/screenshotter#readme)
- Issues: [GitHub Issues](https://github.com/zohaibarsalan/screenshotter/issues)

## License

ISC
