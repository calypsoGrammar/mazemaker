// Headless Chromium for the browser tests, through Playwright when it can be
// found: PLAYWRIGHT_MODULE, then a global install (/usr/local/lib/node_modules),
// then node_modules, with browsers in PLAYWRIGHT_BROWSERS_PATH (default
// /usr/local/share/ms-playwright when it exists) or CHROMIUM_PATH.
//
// Without Playwright or a Chromium it can launch, `skip` is the reason and the
// browser tests are skipped, so `npm test` still passes where there is no
// browser. With REQUIRE_BROWSER=1 (CI and the Pages deploy) a missing browser
// fails the run instead.

import { existsSync } from 'node:fs';

const GLOBAL_MODULE = '/usr/local/lib/node_modules/playwright/index.mjs';
const GLOBAL_BROWSERS = '/usr/local/share/ms-playwright';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(GLOBAL_BROWSERS)) process.env.PLAYWRIGHT_BROWSERS_PATH = GLOBAL_BROWSERS;

async function findChromium() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, GLOBAL_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const name of candidates) {
    if (name.startsWith('/') && !existsSync(name)) continue;
    try {
      const module = await import(name);
      const chromium = module.chromium ?? module.default?.chromium;
      if (chromium) return chromium;
    } catch { /* try the next */ }
  }
  return null;
}

// Launches a browser; `skip` is false when it did, or the reason it did not.
export async function launch() {
  let browser = null;
  let skip = 'Playwright is not installed';
  const chromium = await findChromium();
  if (chromium) {
    try {
      browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
      skip = false;
    } catch (error) {
      skip = `Chromium did not launch: ${String(error.message).split('\n')[0]}`;
    }
  }
  if (skip && process.env.REQUIRE_BROWSER === '1') throw new Error(`REQUIRE_BROWSER=1 but ${skip}`);
  return { browser, skip };
}
