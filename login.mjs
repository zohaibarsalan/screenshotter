// login.mjs
import fs from "node:fs";
import path from "node:path";
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
  return u.toString();
}

async function main() {
  const args = parseArgs(process.argv);

  const loginUrl = normalizeHttpUrl(args.url ?? "http://127.0.0.1:3000/login");
  const afterPath = String(args.afterPath ?? "/dashboard");

  const stateOut = String(args.stateOut ?? "./state.json");

  fs.mkdirSync(path.dirname(path.resolve(stateOut)), { recursive: true });

  if (args.backendHost || args.tokenOut) {
    console.warn(
      "[warn] --backendHost and --tokenOut are ignored. Better Auth uses storage state only.",
    );
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const page = await context.newPage();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log("");
  console.log("Log in manually in the opened browser.");
  console.log(`We will wait until URL contains: ${afterPath}`);
  console.log("");

  // Wait until you reach dashboard
  await page.waitForURL((u) => u.pathname.startsWith(afterPath), {
    timeout: 300000,
  });
  await page.waitForTimeout(500);
  await context.storageState({ path: stateOut });
  console.log(`Saved storageState to: ${stateOut}`);
  console.log("Use this file with capture.mjs via --state.");

  await browser.close();
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
