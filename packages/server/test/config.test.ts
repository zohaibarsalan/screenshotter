import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER_CONFIG,
  loadServerConfigFromFile,
} from "../src/config";

describe("loadServerConfigFromFile", () => {
  it("loads explicit config values and falls back for missing allowOrigins", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "screenshotter-config-"));
    const configPath = path.join(tempRoot, "capture.widget.config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        host: "127.0.0.1",
        port: 5099,
        outputRoot: "./shots",
        token: "abc123",
        maxPayloadMB: 12,
      }),
      "utf8",
    );

    const loaded = loadServerConfigFromFile(configPath);
    expect(loaded.host).toBe("127.0.0.1");
    expect(loaded.port).toBe(5099);
    expect(loaded.outputRoot).toBe("./shots");
    expect(loaded.token).toBe("abc123");
    expect(loaded.maxPayloadMB).toBe(12);
    expect(loaded.allowOrigins).toEqual(DEFAULT_SERVER_CONFIG.allowOrigins);
  });

  it("rejects non-loopback hosts", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "screenshotter-config-"));
    const configPath = path.join(tempRoot, "capture.widget.config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        host: "0.0.0.0",
      }),
      "utf8",
    );

    expect(() => loadServerConfigFromFile(configPath)).toThrowError(/Invalid host/);
  });
});
