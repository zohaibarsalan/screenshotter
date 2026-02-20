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

## Key Flags

- `--baseUrl`: Base app URL
- `--routes`: Comma-separated routes (default: `/dashboard`)
- `--state`: Playwright storage state file
- `--presets`: `iphone-15,macbook-14`
- `--selector`: CSS/Playwright/XPath selector for element capture
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
- Do not commit `bearer*.json` files.
- Rotate sessions/tokens if they are ever exposed.

## Scripts

```bash
pnpm run login
pnpm run capture
```
