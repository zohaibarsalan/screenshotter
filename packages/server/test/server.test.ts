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

  it("does not overwrite captures with identical generated names", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "screenshotter-"));
    const running = await startScreenshotterServer({
      host: "127.0.0.1",
      port: 0,
      outputRoot,
      allowOrigins: [],
    });
    runningServers.push(running);

    const payload = makePayload();
    const first = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const second = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.absolutePath).not.toBe(secondBody.absolutePath);
    await expect(fs.stat(firstBody.absolutePath)).resolves.toBeTruthy();
    await expect(fs.stat(secondBody.absolutePath)).resolves.toBeTruthy();
  });

  it("rejects corrupt base64 and mismatched image formats", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "screenshotter-"));
    const running = await startScreenshotterServer({
      host: "127.0.0.1",
      port: 0,
      outputRoot,
      allowOrigins: [],
    });
    runningServers.push(running);

    const corrupt = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makePayload({ imageBase64: "not-base64" })),
    });
    expect(corrupt.status).toBe(400);
    await expect(corrupt.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("base64"),
    });

    const wrongDataUrl = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        makePayload({
          imageBase64: `data:text/plain;base64,${PNG_1X1_BASE64}`,
        }),
      ),
    });
    expect(wrongDataUrl.status).toBe(400);
    await expect(wrongDataUrl.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("image/png"),
    });

    const mismatchedFormat = await fetch(`${running.url}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        makePayload({
          format: "jpeg",
          imageBase64: PNG_1X1_BASE64,
        }),
      ),
    });
    expect(mismatchedFormat.status).toBe(400);
    await expect(mismatchedFormat.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("JPEG"),
    });
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
