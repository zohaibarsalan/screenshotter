import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");

describe("CLI compatibility smoke checks", () => {
  it("keeps login/capture root scripts in package.json", () => {
    const packageJsonPath = path.join(repoRoot, "package.json");
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(parsed.scripts?.login).toBe("node login.mjs");
    expect(parsed.scripts?.capture).toBe("node capture.mjs");
  });

  it("runs capture.mjs help output without regressions", () => {
    const capturePath = path.join(repoRoot, "capture.mjs");
    const result = spawnSync("node", [capturePath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--fullPage");
    expect(result.stdout).toContain("--selector");
    expect(result.stdout).toContain("--config");
  });
});
