import fs from "node:fs/promises";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  buildCaptureFileParts,
  validateCapturePayload,
  type CaptureFormat,
  type SaveResult,
} from "@screenshotter/protocol";
import {
  DEFAULT_SERVER_CONFIG,
  type ScreenshotterServerConfig,
} from "./config.js";

export interface RunningScreenshotterServer {
  url: string;
  close: () => Promise<void>;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function jsonResponse(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  originHeader?: string,
): void {
  const body = JSON.stringify(payload);
  if (originHeader) {
    response.setHeader("Access-Control-Allow-Origin", originHeader);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = statusCode;
  response.end(body);
}

function parseImageBase64(raw: string, format: CaptureFormat): string {
  const trimmed = raw.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,(.*)$/is);
  if (!dataUrlMatch) return trimmed;

  const mediaType = dataUrlMatch[1]?.toLowerCase();
  const expectedMediaType = format === "jpeg" ? "image/jpeg" : "image/png";
  if (mediaType !== expectedMediaType) {
    throw new Error(`imageBase64 data URL must use ${expectedMediaType}.`);
  }
  return dataUrlMatch[2] ?? "";
}

function decodeStrictBase64(raw: string): Buffer {
  const normalized = raw.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0) {
    throw new Error("imageBase64 must be valid base64.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || /=/.test(normalized.slice(0, -2))) {
    throw new Error("imageBase64 must be valid base64.");
  }
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length || bytes.toString("base64") !== normalized) {
    throw new Error("imageBase64 must be valid base64.");
  }
  return bytes;
}

function hasExpectedImageSignature(bytes: Buffer, format: CaptureFormat): boolean {
  if (format === "png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function decodeCaptureImage(raw: string, format: CaptureFormat): Buffer {
  const base64 = parseImageBase64(raw, format);
  const bytes = decodeStrictBase64(base64);
  if (!hasExpectedImageSignature(bytes, format)) {
    throw new Error(`imageBase64 must contain a valid ${format.toUpperCase()} image.`);
  }
  return bytes;
}

function ensureAllowedOrigin(
  config: ScreenshotterServerConfig,
  request: IncomingMessage,
): string | undefined {
  const originHeader = request.headers.origin;
  if (!originHeader || config.allowOrigins.length === 0) {
    return undefined;
  }
  if (config.allowOrigins.includes(originHeader)) {
    return originHeader;
  }
  return "__forbidden__";
}

function buildAbsolutePath(relativePath: string, outputRoot: string): string {
  if (!outputRoot.trim()) {
    throw new Error("outputRoot must be a non-empty path.");
  }
  const resolvedRoot = path.resolve(outputRoot);
  const absolutePath = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, absolutePath);
  if (
    !relativeToRoot ||
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error("Capture path must stay inside outputRoot.");
  }
  return absolutePath;
}

function addCollisionSuffix(filePath: string, attempt: number): string {
  const extension = path.extname(filePath);
  const withoutExtension = filePath.slice(0, filePath.length - extension.length);
  return `${withoutExtension}-${attempt + 1}${extension}`;
}

async function writeCaptureFile(
  absolutePath: string,
  bytes: Buffer,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? absolutePath : addCollisionSuffix(absolutePath, attempt);
    try {
      await fs.writeFile(candidate, bytes, { flag: "wx" });
      return candidate;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique capture filename.");
}

function toPosixRelativePath(outputRoot: string, absolutePath: string): string {
  return path.relative(path.resolve(outputRoot), absolutePath).split(path.sep).join("/");
}

async function readJsonBody(
  request: IncomingMessage,
  byteLimit: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > byteLimit) {
      throw new Error("Payload too large.");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new Error("Request body is required.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export async function startScreenshotterServer(
  partialConfig: Partial<ScreenshotterServerConfig> = {},
): Promise<RunningScreenshotterServer> {
  const config: ScreenshotterServerConfig = {
    ...DEFAULT_SERVER_CONFIG,
    ...partialConfig,
    allowOrigins:
      partialConfig.allowOrigins ?? DEFAULT_SERVER_CONFIG.allowOrigins,
  };
  if (!isLoopbackHost(config.host)) {
    throw new Error(
      `Invalid host "${config.host}". For local safety, host must be 127.0.0.1, localhost, or ::1.`,
    );
  }

  const byteLimit = Math.round(config.maxPayloadMB * 1024 * 1024);

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const originState = ensureAllowedOrigin(config, request);
    const responseOrigin =
      originState && originState !== "__forbidden__" ? originState : undefined;

    if (request.method === "OPTIONS" && requestUrl.pathname === "/api/captures") {
      if (originState === "__forbidden__") {
        jsonResponse(response, 403, { ok: false, error: "Origin is not allowed." });
        return;
      }
      if (responseOrigin) {
        response.setHeader("Access-Control-Allow-Origin", responseOrigin);
        response.setHeader("Vary", "Origin");
      }
      response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "content-type,x-screenshotter-token");
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      jsonResponse(response, 200, { ok: true }, responseOrigin);
      return;
    }

    if (request.method !== "POST" || requestUrl.pathname !== "/api/captures") {
      jsonResponse(response, 404, { ok: false, error: "Not found." }, responseOrigin);
      return;
    }

    if (originState === "__forbidden__") {
      jsonResponse(response, 403, { ok: false, error: "Origin is not allowed." });
      return;
    }

    if (config.token) {
      const provided = request.headers["x-screenshotter-token"];
      if (provided !== config.token) {
        jsonResponse(response, 401, { ok: false, error: "Unauthorized." }, responseOrigin);
        return;
      }
    }

    const contentType = request.headers["content-type"] || "";
    if (!String(contentType).toLowerCase().includes("application/json")) {
      jsonResponse(
        response,
        415,
        { ok: false, error: "Content-Type must be application/json." },
        responseOrigin,
      );
      return;
    }

    try {
      const body = await readJsonBody(request, byteLimit);
      const validated = validateCapturePayload(body);
      if (!validated.ok) {
        jsonResponse(response, 400, { ok: false, error: validated.error }, responseOrigin);
        return;
      }

      const payload = validated.value;
      const parts = buildCaptureFileParts(payload);
      const absolutePath = buildAbsolutePath(parts.relativePath, config.outputRoot);
      const absoluteDir = path.dirname(absolutePath);
      await fs.mkdir(absoluteDir, { recursive: true });

      const bytes = decodeCaptureImage(payload.imageBase64, payload.format);
      const writtenPath = await writeCaptureFile(absolutePath, bytes);

      const result: SaveResult = {
        ok: true,
        relativePath: toPosixRelativePath(config.outputRoot, writtenPath),
        absolutePath: writtenPath,
        bytes: bytes.byteLength,
      };
      jsonResponse(response, 200, result, responseOrigin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message === "Payload too large." ? 413 : 400;
      jsonResponse(response, statusCode, { ok: false, error: message }, responseOrigin);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  const url = `http://${config.host}:${port}`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
