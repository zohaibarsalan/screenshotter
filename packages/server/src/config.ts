import fs from "node:fs";
import path from "node:path";

export interface ScreenshotterServerConfig {
  host: string;
  port: number;
  outputRoot: string;
  token: string;
  maxPayloadMB: number;
  allowOrigins: string[];
}

export const DEFAULT_SERVER_CONFIG: ScreenshotterServerConfig = {
  host: "127.0.0.1",
  port: 4783,
  outputRoot: "./screenshots",
  token: "",
  maxPayloadMB: 30,
  allowOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"],
};

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current?.startsWith("--")) continue;
    const key = current.slice(2);
    const maybeValue = argv[i + 1];
    if (!maybeValue || maybeValue.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = maybeValue;
    i += 1;
  }
  return args;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function normalizeOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function resolveOrigins(value: unknown): string[] {
  const parsed = normalizeOrigins(value);
  return parsed.length ? parsed : [...DEFAULT_SERVER_CONFIG.allowOrigins];
}

export function resolveConfigPath(args: Record<string, string | boolean>): string | null {
  const fromArg = args.config;
  if (typeof fromArg === "string" && fromArg.trim()) {
    return path.resolve(fromArg.trim());
  }
  let dir = process.cwd();
  while (true) {
    const candidate = path.resolve(dir, "capture.widget.config.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadServerConfigFromFile(filePath: string): ScreenshotterServerConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config at ${filePath}: ${message}`);
  }

  const source = typeof parsed === "object" && parsed !== null ? parsed : {};
  const config = {
    ...DEFAULT_SERVER_CONFIG,
    ...(source as Partial<ScreenshotterServerConfig>),
  };

  const host = String(config.host || DEFAULT_SERVER_CONFIG.host).trim();
  if (!isLoopbackHost(host)) {
    throw new Error(
      `Invalid host "${host}". For local safety, host must be 127.0.0.1, localhost, or ::1.`,
    );
  }

  const port = Number(config.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("port must be an integer between 0 and 65535.");
  }

  const maxPayloadMB = Number(config.maxPayloadMB);
  if (!Number.isFinite(maxPayloadMB) || maxPayloadMB <= 0 || maxPayloadMB > 100) {
    throw new Error("maxPayloadMB must be a number between 0 and 100.");
  }

  return {
    host,
    port,
    outputRoot: String(config.outputRoot || DEFAULT_SERVER_CONFIG.outputRoot).trim(),
    token: String(config.token || ""),
    maxPayloadMB,
    allowOrigins: resolveOrigins((source as Record<string, unknown>).allowOrigins),
  };
}

export function loadServerConfigFromArgv(argv: string[]): ScreenshotterServerConfig {
  const args = parseArgs(argv);
  const configPath = resolveConfigPath(args);
  if (!configPath) {
    return { ...DEFAULT_SERVER_CONFIG };
  }
  return loadServerConfigFromFile(configPath);
}
