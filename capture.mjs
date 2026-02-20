// capture.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import archiver from "archiver";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function normalizeHttpUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Missing URL");
  const withScheme =
    s.startsWith("http://") || s.startsWith("https://") ? s : `http://${s}`;
  const u = new URL(withScheme);
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("Only http/https allowed");
  return u.toString().replace(/\/+$/, "");
}

function jobId() {
  return crypto.randomBytes(6).toString("hex");
}

function safeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function zipFolder(folderPath, zipPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

// Viewport-only presets (no Playwright devices / UA changes)
const PRESETS = {
  "iphone-15": {
    width: 390,
    height: 844,
    dpr: 3,
    isMobile: true,
    hasTouch: true,
  },
  "macbook-14": {
    width: 1800,
    height: 1038,
    dpr: 2,
    isMobile: false,
    hasTouch: false,
  },
};

function resolvePreset(key) {
  const p = PRESETS[key];
  if (!p)
    throw new Error(
      `Unknown preset "${key}". Available: ${Object.keys(PRESETS).join(", ")}`,
    );
  return p;
}

function toIntBounds(box) {
  return {
    left: Math.floor(box.x),
    top: Math.floor(box.y),
    right: Math.ceil(box.x + box.width),
    bottom: Math.ceil(box.y + box.height),
  };
}

async function centerInViewport(locator) {
  await locator.evaluate((el) => {
    const limit = (value, min, max) => Math.max(min, Math.min(max, value));
    const r = el.getBoundingClientRect();
    const targetX = r.left + window.scrollX + r.width / 2 - window.innerWidth / 2;
    const targetY =
      r.top + window.scrollY + r.height / 2 - window.innerHeight / 2;

    const maxX = Math.max(
      0,
      document.documentElement.scrollWidth - window.innerWidth,
    );
    const maxY = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );

    window.scrollTo(limit(targetX, 0, maxX), limit(targetY, 0, maxY));
  });
}

function buildCenteredClip(box, viewport, requestedPadding) {
  const bounds = toIntBounds(box);
  if (
    bounds.left < 0 ||
    bounds.top < 0 ||
    bounds.right > viewport.width ||
    bounds.bottom > viewport.height
  ) {
    throw new Error(
      "Selected element does not fully fit in the viewport. Use a larger preset before element capture.",
    );
  }

  const maxEqualPadding = Math.max(
    0,
    Math.min(
      bounds.left,
      bounds.top,
      viewport.width - bounds.right,
      viewport.height - bounds.bottom,
    ),
  );
  const padding = Math.min(requestedPadding, maxEqualPadding);

  return {
    padding,
    clip: {
      x: bounds.left - padding,
      y: bounds.top - padding,
      width: bounds.right - bounds.left + padding * 2,
      height: bounds.bottom - bounds.top + padding * 2,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const baseUrl = normalizeHttpUrl(args.baseUrl ?? "http://127.0.0.1:3000");
  const routes = (args.routes ? String(args.routes) : "/dashboard")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const presets = (
    args.presets ? String(args.presets) : "iphone-15,macbook-14"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const statePath = String(args.state ?? "./state.json");

  const outRoot = String(args.out ?? "./screenshots");
  const doZip = Boolean(args.zip);
  const fullPage = Boolean(args.fullPage);
  const headless = args.headful ? false : true;
  const waitMs = args.waitMs ? Number(args.waitMs) : 800;
  const selector = args.selector ? String(args.selector).trim() : "";
  const selectorAll = Boolean(args.selectorAll);
  const selectorIndex =
    args.selectorIndex === undefined ? 0 : Number(args.selectorIndex);
  const selectorPadding =
    args.padding === undefined ? 8 : Number(args.padding);
  const captureThemes = ["light", "dark"];

  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 60000) {
    throw new Error("--waitMs must be between 0 and 60000");
  }
  if (selector && fullPage) {
    throw new Error("--selector cannot be combined with --fullPage.");
  }
  if (!Number.isInteger(selectorIndex) || selectorIndex < 0) {
    throw new Error("--selectorIndex must be a non-negative integer.");
  }
  if (!Number.isFinite(selectorPadding) || selectorPadding < 0) {
    throw new Error("--padding must be a non-negative number.");
  }
  if (args.dark) {
    console.warn(
      "[warn] --dark is ignored. This script now captures both light and dark on every run.",
    );
  }
  if (args.bearer || args.backendHost) {
    console.warn(
      "[warn] --bearer and --backendHost are ignored. Auth now uses Playwright storage state only.",
    );
  }
  if (!fs.existsSync(statePath)) {
    console.warn(
      `[warn] State file not found at ${statePath}. Capture may run unauthenticated.`,
    );
  }

  const id = jobId();
  const outDir = path.resolve(outRoot, id);
  fs.mkdirSync(outDir, { recursive: true });

  const freezeCss = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    ::-webkit-scrollbar { width: 0px; height: 0px; }
  `;

  const browser = await chromium.launch({ headless });

  for (const presetKey of presets) {
    const p = resolvePreset(presetKey);

    const context = await browser.newContext({
      ...(fs.existsSync(statePath) ? { storageState: statePath } : {}),
      viewport: { width: p.width, height: p.height },
      deviceScaleFactor: p.dpr,
      isMobile: p.isMobile,
      hasTouch: p.hasTouch,
      colorScheme: "light",
      reducedMotion: "reduce",
    });

    for (const r of routes) {
      const url = new URL(r, baseUrl).toString();
      const pathname = new URL(url).pathname.replaceAll("/", "-") || "root";

      for (const theme of captureThemes) {
        const page = await context.newPage();
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });

        await page.addInitScript((theme) => {
          try {
            localStorage.setItem("theme", theme);
          } catch {
            // ignore
          }
        }, theme);

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.addStyleTag({ content: freezeCss });
        if (waitMs) await page.waitForTimeout(waitMs);

        const fileStem = `${safeName(`${presetKey}-${pathname}`)}-${theme}`;

        if (!selector) {
          const file = path.join(outDir, `${fileStem}.png`);
          await page.screenshot({ path: file, fullPage, type: "png" });
        } else {
          const viewport = page.viewportSize();
          if (!viewport) throw new Error("Could not resolve viewport size.");

          const locator = page.locator(selector);
          const totalMatches = await locator.count();
          if (totalMatches === 0) {
            throw new Error(`No elements matched --selector "${selector}"`);
          }

          const targetIndices = selectorAll
            ? [...Array(totalMatches).keys()]
            : [selectorIndex];
          if (!selectorAll && selectorIndex >= totalMatches) {
            throw new Error(
              `--selectorIndex ${selectorIndex} out of range. Found ${totalMatches} matching elements.`,
            );
          }

          const selectorLabel = safeName(selector).slice(0, 32) || "target";
          for (const targetIndex of targetIndices) {
            const target = locator.nth(targetIndex);
            await target.waitFor({ state: "visible", timeout: 60000 });
            await centerInViewport(target);
            await page.waitForTimeout(50);

            const box = await target.boundingBox();
            if (!box || box.width <= 0 || box.height <= 0) {
              throw new Error(
                `Could not resolve visible bounds for selector "${selector}" at index ${targetIndex}.`,
              );
            }

            const { clip, padding } = buildCenteredClip(
              box,
              viewport,
              selectorPadding,
            );
            if (padding < selectorPadding) {
              console.warn(
                `[warn] Reduced padding for ${presetKey} ${pathname} selector index ${targetIndex} from ${selectorPadding}px to ${padding}px to keep equal margins in frame.`,
              );
            }

            const indexSuffix =
              selectorAll || targetIndex !== 0 ? `-${targetIndex + 1}` : "";
            const file = path.join(
              outDir,
              `${fileStem}-${selectorLabel}${indexSuffix}.png`,
            );
            await page.screenshot({ path: file, clip, type: "png" });
          }
        }

        await page.close();
      }
    }

    await context.close();
  }

  await browser.close();

  if (doZip) {
    const zipPath = path.resolve(outRoot, `${id}.zip`);
    await zipFolder(outDir, zipPath);
    console.log(`ZIP: ${zipPath}`);
  }

  console.log(`Saved screenshots to: ${outDir}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
