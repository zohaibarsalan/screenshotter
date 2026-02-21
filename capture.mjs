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

function splitCsv(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRoute(route) {
  if (!route) return route;
  return route.startsWith("/") ? route : `/${route}`;
}

function uniq(values) {
  return [...new Set(values)];
}

function printHelp() {
  console.log(`
Usage:
  node capture.mjs [options]

Common:
  --baseUrl <url>            Base app URL (default: http://127.0.0.1:3000)
  --state <file>             Playwright storage state file (default: ./state.json)
  --config <file>            JSON config for reusable named targets
  --route <path>             Single route, e.g. /clients-overview
  --routes <a,b,c>           Multiple routes (default: /dashboard)
  --page <slug>              Route alias without slash, e.g. clients-overview
  --presets <a,b>            Viewports: iphone-15,macbook-14
  --waitMs <ms>              Delay before capture (default: 800)
  --out <dir>                Output root (default: ./screenshots)
  --headful                  Run browser headed
  --zip                      Create zip from output folder

Capture modes:
  --fullPage                 Full-page screenshot mode
  --selector <expr>          Custom selector capture mode
  --selectorFile <file>      Read custom selector from file
  --selectorAll              Capture all selector matches
  --selectorIndex <n>        Capture one match by index (default: 0)
  --selectorName <name>      Friendly output name for custom selector
  --shrinkWrap               Temporarily shrink selected element(s) to content width before capture
  --padding <px>             Symmetric crop padding (default: 8)

Named targets (portable across projects):
  --target <name>            Capture one named target from --config
  --targets <a,b,c>          Capture multiple named targets from --config

Config format:
  {
    "routes": ["/clients-overview"],
    "targets": {
      "kpi-cards": {
        "selector": ".my-card",
        "selectorAll": true,
        "outputBase": "kpi-card"
      },
      "filter-bar": "xpath=//div[@data-part='filter-bar']"
    }
  }

Examples:
  node capture.mjs --page clients-overview --state ./state.local.json --selectorFile ./selectors/kpi.txt --selectorAll
  node capture.mjs --config ./capture.config.json --target kpi-cards --state ./state.local.json
  node capture.mjs --routes /dashboard,/billings --state ./state.local.json --fullPage
`);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse JSON config at ${filePath}: ${err?.message || String(err)}`);
  }
}

function resolveNamedTargets(rawTargetNames, configTargets) {
  const targetNames = uniq(splitCsv(rawTargetNames));
  if (!targetNames.length) return [];

  if (!configTargets || typeof configTargets !== "object") {
    throw new Error(
      "Named targets require --config with a top-level \"targets\" object.",
    );
  }

  const missing = targetNames.filter((name) => !(name in configTargets));
  if (missing.length) {
    throw new Error(
      `Unknown target(s) in config: ${missing.join(", ")}. Available: ${Object.keys(configTargets).join(", ")}`,
    );
  }

  return targetNames.map((name) => {
    const def = configTargets[name];
    const normalized =
      typeof def === "string"
        ? { selector: def }
        : def && typeof def === "object"
          ? def
          : null;

    if (!normalized?.selector || typeof normalized.selector !== "string") {
      throw new Error(
        `Target "${name}" must be a selector string or object with "selector".`,
      );
    }

    return {
      name,
      selector: normalized.selector.trim(),
      selectorAll: Boolean(normalized.selectorAll),
      selectorIndex:
        normalized.selectorIndex === undefined
          ? 0
          : Number(normalized.selectorIndex),
      padding:
        normalized.padding === undefined ? undefined : Number(normalized.padding),
      shrinkWrap: Boolean(normalized.shrinkWrap),
      outputBase:
        normalized.outputBase && String(normalized.outputBase).trim()
          ? safeName(String(normalized.outputBase))
          : safeName(name),
    };
  });
}

async function applyShrinkWrap(locator) {
  return locator.evaluate((el) => {
    const previous = {
      width: el.style.width,
      maxWidth: el.style.maxWidth,
      minWidth: el.style.minWidth,
    };
    el.style.width = "max-content";
    el.style.maxWidth = "max-content";
    el.style.minWidth = "0";
    return previous;
  });
}

async function restoreShrinkWrap(locator, previous) {
  await locator.evaluate(
    (el, prev) => {
      el.style.width = prev.width;
      el.style.maxWidth = prev.maxWidth;
      el.style.minWidth = prev.minWidth;
    },
    previous,
  );
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
  if (args.help) {
    printHelp();
    return;
  }

  const configPath = args.config ? path.resolve(String(args.config)) : "";
  const config = configPath ? readJsonFile(configPath) : {};
  const configTargets =
    config.targets && typeof config.targets === "object" ? config.targets : null;

  const baseUrl = normalizeHttpUrl(
    args.baseUrl ?? config.baseUrl ?? "http://127.0.0.1:3000",
  );
  const routeInput = args.routes
    ? splitCsv(args.routes)
    : args.route
      ? splitCsv(args.route)
      : args.page
        ? splitCsv(args.page).map(normalizeRoute)
        : Array.isArray(config.routes)
          ? config.routes.map((r) => normalizeRoute(String(r)))
          : ["/dashboard"];
  const routes = uniq(routeInput.map(normalizeRoute).filter(Boolean));

  const presets = args.presets
    ? splitCsv(args.presets)
    : Array.isArray(config.presets)
      ? config.presets.map((p) => String(p))
      : ["iphone-15", "macbook-14"];

  const statePath = String(args.state ?? config.state ?? "./state.json");

  const outRoot = String(args.out ?? config.out ?? "./screenshots");
  const doZip = Boolean(args.zip);
  const fullPage = Boolean(args.fullPage ?? config.fullPage);
  const headless = args.headful ? false : true;
  const waitMs =
    args.waitMs !== undefined
      ? Number(args.waitMs)
      : config.waitMs !== undefined
        ? Number(config.waitMs)
        : 800;

  if (args.selector && args.selectorFile) {
    throw new Error("Use only one of --selector or --selectorFile.");
  }
  const selectorFile = args.selectorFile
    ? path.resolve(String(args.selectorFile))
    : "";
  const selectorFromFile = selectorFile
    ? fs.readFileSync(selectorFile, "utf8").trim()
    : "";
  const selector = args.selector
    ? String(args.selector).trim()
    : selectorFromFile;
  const selectorAll = Boolean(args.selectorAll);
  const selectorIndex =
    args.selectorIndex === undefined ? 0 : Number(args.selectorIndex);
  const selectorPadding =
    args.padding === undefined ? 8 : Number(args.padding);
  const shrinkWrap = Boolean(args.shrinkWrap);
  const selectorName = safeName(String(args.selectorName ?? "target")) || "target";
  const namedTargets = resolveNamedTargets(
    args.targets ?? args.target ?? "",
    configTargets,
  );
  const captureThemes = ["light", "dark"];

  const captureJobs = [...namedTargets];
  if (selector) {
    captureJobs.push({
      name: selectorName,
      selector,
      selectorAll,
      selectorIndex,
      padding: selectorPadding,
      shrinkWrap,
      outputBase: selectorName,
    });
  }

  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 60000) {
    throw new Error("--waitMs must be between 0 and 60000");
  }
  if (captureJobs.length && fullPage) {
    throw new Error("--fullPage cannot be combined with selector/target capture.");
  }
  if (!Number.isInteger(selectorIndex) || selectorIndex < 0) {
    throw new Error("--selectorIndex must be a non-negative integer.");
  }
  if (!Number.isFinite(selectorPadding) || selectorPadding < 0) {
    throw new Error("--padding must be a non-negative number.");
  }
  for (const target of captureJobs) {
    if (!target.selector || typeof target.selector !== "string") {
      throw new Error(`Invalid target "${target.name}": missing selector.`);
    }
    if (!Number.isInteger(target.selectorIndex) || target.selectorIndex < 0) {
      throw new Error(
        `Invalid target "${target.name}": selectorIndex must be a non-negative integer.`,
      );
    }
    if (
      target.padding !== undefined &&
      (!Number.isFinite(target.padding) || target.padding < 0)
    ) {
      throw new Error(
        `Invalid target "${target.name}": padding must be a non-negative number.`,
      );
    }
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

        if (!captureJobs.length) {
          const file = path.join(outDir, `${fileStem}.png`);
          await page.screenshot({ path: file, fullPage, type: "png" });
        } else {
          const viewport = page.viewportSize();
          if (!viewport) throw new Error("Could not resolve viewport size.");

          for (const job of captureJobs) {
            const locator = page.locator(job.selector);
            const totalMatches = await locator.count();
            if (totalMatches === 0) {
              throw new Error(
                `No elements matched target "${job.name}" (selector: ${job.selector})`,
              );
            }

            const effectiveIndex = job.selectorIndex ?? 0;
            const effectiveAll = Boolean(job.selectorAll);
            const targetIndices = effectiveAll
              ? [...Array(totalMatches).keys()]
              : [effectiveIndex];

            if (!effectiveAll && effectiveIndex >= totalMatches) {
              throw new Error(
                `Target "${job.name}" selectorIndex ${effectiveIndex} out of range. Found ${totalMatches} matches.`,
              );
            }

            const requestedPadding =
              job.padding === undefined ? selectorPadding : job.padding;
            const effectiveShrinkWrap = Boolean(job.shrinkWrap);

            for (const targetIndex of targetIndices) {
              const target = locator.nth(targetIndex);
              await target.waitFor({ state: "visible", timeout: 60000 });
              let previousStyles = null;
              if (effectiveShrinkWrap) {
                previousStyles = await applyShrinkWrap(target);
              }

              try {
                await centerInViewport(target);
                await page.waitForTimeout(50);

                const box = await target.boundingBox();
                if (!box || box.width <= 0 || box.height <= 0) {
                  throw new Error(
                    `Could not resolve visible bounds for target "${job.name}" at index ${targetIndex}.`,
                  );
                }

                const { clip, padding } = buildCenteredClip(
                  box,
                  viewport,
                  requestedPadding,
                );
                if (padding < requestedPadding) {
                  console.warn(
                    `[warn] Reduced padding for ${presetKey} ${pathname} target "${job.name}" index ${targetIndex} from ${requestedPadding}px to ${padding}px to keep equal margins in frame.`,
                  );
                }

                const indexSuffix = effectiveAll
                  ? `-${targetIndex + 1}`
                  : effectiveIndex > 0
                    ? `-${effectiveIndex + 1}`
                    : "";
                const file = path.join(
                  outDir,
                  `${fileStem}-${job.outputBase}${indexSuffix}.png`,
                );
                await page.screenshot({ path: file, clip, type: "png" });
              } finally {
                if (previousStyles) {
                  await restoreShrinkWrap(target, previousStyles);
                }
              }
            }
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
