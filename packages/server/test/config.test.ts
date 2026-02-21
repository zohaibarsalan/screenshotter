import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfigPath } from "../src/config";

describe("resolveConfigPath", () => {
  it("finds capture.widget.config.json in ancestor directories", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "screenshotter-config-"));
    const nested = path.join(tempRoot, "packages", "server");
    fs.mkdirSync(nested, { recursive: true });
    const configPath = path.join(tempRoot, "capture.widget.config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        host: "127.0.0.1",
        port: 4783,
      }),
      "utf8",
    );

    const previousCwd = process.cwd();
    try {
      process.chdir(nested);
      const resolved = resolveConfigPath({});
      expect(resolved).toBeTruthy();
      if (!resolved) {
        throw new Error("resolveConfigPath returned null unexpectedly.");
      }
      expect(fs.realpathSync(resolved)).toBe(fs.realpathSync(configPath));
    } finally {
      process.chdir(previousCwd);
    }
  });
});
