# Screenshotter

Playwright-based screenshot automation for dashboard UIs.

It supports:
- Full-page screenshots
- Element-targeted screenshots with centered framing and equal margins
- Automatic light + dark captures in a single run
- Multiple routes and viewport presets

## Requirements

- Node.js 18+
- pnpm

## Install

```bash
pnpm install
```

## Better Auth Login Flow

Create a local Playwright storage state file by logging in manually once:

```bash
node login.mjs \
  --url http://127.0.0.1:3000/login \
  --afterPath /dashboard \
  --stateOut ./state.local.json
```

This opens a browser window, waits until URL matches `--afterPath`, then saves session state.

## Capture Screenshots

### Full page (light + dark automatically)

```bash
node capture.mjs \
  --baseUrl http://127.0.0.1:3000 \
  --routes /dashboard \
  --state ./state.local.json \
  --presets macbook-14
```

### Full page via config example

```bash
cp capture.fullpage.config.example.json capture.fullpage.config.json
node capture.mjs --config ./capture.fullpage.config.json
```

### Element capture (centered with equal margins)

```bash
node capture.mjs \
  --baseUrl http://127.0.0.1:3000 \
  --routes /dashboard \
  --state ./state.local.json \
  --presets macbook-14 \
  --selector 'xpath=//button[normalize-space()="More Details"]/ancestor::div[4]' \
  --selectorAll \
  --padding 8 \
  --waitMs 2200
```

### Named targets via config (recommended for team use)

Create a project-local config (start from `capture.config.example.json`) with named selectors.

```bash
cp capture.config.example.json capture.config.json
node capture.mjs \
  --config ./capture.config.json \
  --targets kpi-cards,filter-bar,table-no-footer
```

This removes hardcoded selectors from shell commands and makes captures portable per app.

### What each example file is for

- `capture.fullpage.config.example.json`: full-page screenshots
- `capture.config.example.json`: separated element/target screenshots

## Key Flags

- `--baseUrl`: Base app URL
- `--config`: JSON file for reusable named targets
- `--target` / `--targets`: Run named target(s) from config
- `--routes`: Comma-separated routes (default: `/dashboard`)
- `--route`: Single route
- `--page`: Route alias without leading slash (e.g. `clients-overview`)
- `--state`: Playwright storage state file
- `--presets`: `iphone-15,macbook-14`
- `--selector`: CSS/Playwright/XPath selector for element capture
- `--selectorFile`: Read selector from text file (avoids shell escaping)
- `--selectorName`: Friendly output name for custom selector
- `--selectorAll`: Capture all selector matches
- `--selectorIndex`: Capture one specific match (default: `0`)
- `--padding`: Symmetric crop padding for selector mode (default: `8`)
- `--waitMs`: Wait before screenshot (default: `800`)
- `--headful`: Run browser headful
- `--fullPage`: Full-page mode (cannot be used with `--selector`)
- `--out`: Output root (default: `./screenshots`)
- `--zip`: Also create a zip archive

## Output

Each run creates a job folder under `screenshots/<job-id>/` with files named like:

- `macbook-14-dashboard-light.png`
- `macbook-14-dashboard-dark.png`
- `macbook-14-dashboard-dark-<selector>-1.png`

## Security Notes

- Do not commit `state*.json` files.
- Do not commit any local auth/session files.

## Scripts

```bash
pnpm run login
pnpm run capture
```
