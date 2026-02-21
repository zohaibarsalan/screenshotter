import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startScreenshotterServer } from "../src/server";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAusB9YkWf0wAAAAASUVORK5CYII=";

const runningServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (runningServers.length) {
    const item = runningServers.pop();
    if (!item) continue;
    await item.close();
  }
});

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project: "dashboard",
    route: "/matter-health",
    mode: "viewport",
    format: "png",
    quality: 70,
    scale: 1.7,
    theme: "light",
    viewport: {
      width: 1440,
      height: 900,
      dpr: 2,
    },
    capturedAt: "2026-02-21T13:22:33.000Z",
    imageBase64: PNG_1X1_BASE64,
    ...overrides,
  };
}

describe("startScreenshotterServer", () => {
  it("returns health and saves capture files", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "screenshotter-"));
    const running = await startScreenshotterServer({
      host: "127.0.0.1",
      port: 0,
      outputRoot,
      allowOrigins: [],
    });
    runningServers.push(running);

    const health = await fetch(`${running.url}/api/health`);
    expect(health.status).toBe(200);
    const healthBody = await health.json();
    expect(healthBody.ok).toBe(true);

    const result = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(makePayload()),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.ok).toBe(true);
    expect(body.relativePath).toContain("live-20260221/matter-health/");
    expect(body.absolutePath).toContain(outputRoot);

    const bytes = await fs.readFile(body.absolutePath, { encoding: null });
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("requires token when configured", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "screenshotter-"));
    const running = await startScreenshotterServer({
      host: "127.0.0.1",
      port: 0,
      outputRoot,
      token: "secret-token",
      allowOrigins: [],
    });
    runningServers.push(running);

    const denied = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makePayload()),
    });
    expect(denied.status).toBe(401);

    const allowed = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-screenshotter-token": "secret-token",
      },
      body: JSON.stringify(makePayload()),
    });
    expect(allowed.status).toBe(200);
  });

  it("enforces payload byte limits", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "screenshotter-"));
    const running = await startScreenshotterServer({
      host: "127.0.0.1",
      port: 0,
      outputRoot,
      maxPayloadMB: 0.0001,
      allowOrigins: [],
    });
    runningServers.push(running);

    const hugePayload = makePayload({
      imageBase64: "a".repeat(40000),
    });
    const result = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(hugePayload),
    });
    expect(result.status).toBe(413);
  });
});
