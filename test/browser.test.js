// Release checks in a real browser (CAL-1244 / MM-V1-15): headless Chromium
// through Playwright, with touch emulation, phone, tablet and desktop
// viewports in both orientations, the keyboard, and emulated reduced motion.
// Unlike the jsdom tests, the stylesheet is applied and laid out, so sizes,
// overlaps and scrolling are measured, not worked out.
//
// Playwright is not a dependency of the project. The test looks for it in
// PLAYWRIGHT_MODULE, then a global install (/usr/local/lib/node_modules),
// then node_modules, with browsers in PLAYWRIGHT_BROWSERS_PATH (default
// /usr/local/share/ms-playwright when it exists). Without Playwright or a
// Chromium it can launch, every test here is skipped, so `npm test` still
// passes where there is no browser.
//
// The page is served by Vite's dev server, so it is the page as written, with
// Tailwind applied. main.js gets a read-only window.__mm appended as it is
// served (as test/harness.js does for jsdom), so the tests can see the
// player's cell and the route to the exit; nothing else is changed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
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

let server = null;
let base = null;
before(async () => {
  if (skip) return;
  const { createServer } = await import('vite');
  server = await createServer({ root, logLevel: 'silent', server: { port: 0, host: '127.0.0.1', hmr: false } });
  await server.listen();
  const { port } = server.httpServer.address();
  base = `http://127.0.0.1:${port}/mazemaker/`;
});

after(async () => {
  await browser?.close();
  await server?.close();
});

// Read access to main.js's top-level state, appended to the module as served.
const EXPOSE = `
window.__mm = {
  get cell() { return player.cell; },
  get moving() { return player.moving; },
  get exit() { return exitCell; },
  get completed() { return completed; },
  get shape() { return shape; },
  get size() { return topology.size; },
  // The label of the way from the player's cell along the shortest route.
  next() {
    const [, to] = shortestPath(maze, player.cell, exitCell);
    return maze.topology.links(player.cell).find((l) => l.cell === to).label;
  },
};`;

const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const TABLET = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
const VIEWPORTS = [
  ['phone', 320, 568, PHONE], ['phone', 568, 320, PHONE],
  ['phone', 390, 844, PHONE], ['phone', 844, 390, PHONE],
  ['tablet', 768, 1024, TABLET], ['tablet', 1024, 768, TABLET],
  ['desktop', 1280, 800, DESKTOP], ['desktop', 1920, 1080, DESKTOP],
];
const SHAPES = ['square', 'hex', 'triangle', 'polar'];
const TOUCH = 44;

// A page on the game, with page errors and console errors collected.
async function open(width, height, options = DESKTOP, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.route((url) => url.pathname.endsWith('/src/javascripts/main.js'), async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + EXPOSE });
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__mm !== undefined && document.querySelector('#directionPad [data-label]') !== null);
  return { page, errors, close: () => context.close() };
}

const state = (page) => page.evaluate(() => ({
  cell: window.__mm.cell, moving: window.__mm.moving, completed: window.__mm.completed, shape: window.__mm.shape,
}));

// Picks a shape and size in the settings, with Auto-new off, and generates.
async function newMaze(page, shape, size, { touch }) {
  const act = (selector) => (touch ? page.tap(selector) : page.click(selector));
  await act('#OptionsButton');
  await page.selectOption('#mazeShape', shape);
  await page.fill('#display001', String(size));
  if (await page.isChecked('#autonew')) await act('#autonew');
  await act('#generateMaze');
  await page.waitForFunction((s) => window.__mm.shape === s && window.__mm.cell === 0, shape);
}

const settled = (page) => page.waitForFunction(() => !window.__mm.moving);

// Plays to the exit, sending each move with `send(label)`.
async function playToExit(page, send) {
  const size = await page.evaluate(() => window.__mm.size);
  for (let moves = 0; !(await state(page)).completed; moves++) {
    assert.ok(moves <= size, 'the exit is reached');
    const label = await page.evaluate(() => window.__mm.next());
    await send(label);
    await settled(page);
  }
  assert.equal(await page.isVisible('#completeBanner'), true, 'completion is shown');
}

const padButton = (label) => `#${label.toLowerCase()}Button`;

const box = (page, selector) => page.locator(selector).boundingBox();
const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const within = (r, w, h) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= w + 0.5 && r.y + r.height <= h + 0.5;

test('browser: toolbar, maze and pad are touch-sized, in view and apart, and the page never scrolls', { skip }, async () => {
  for (const [kind, width, height, options] of VIEWPORTS) {
    const at = `${kind} ${width}x${height}`;
    const { page, errors, close } = await open(width, height, options);
    for (const shape of SHAPES) {
      await newMaze(page, shape, 6, { touch: options.hasTouch });
      const toolbar = await box(page, '#toolbar');
      assert.ok(toolbar.height >= TOUCH - 0.5, `${at}: toolbar ${toolbar.height}px`);
      for (const tool of await page.locator('#toolbar .tool').all()) {
        const b = await tool.boundingBox();
        assert.ok(b.width >= 40 - 0.5 && b.height >= 40 - 0.5, `${at}: toolbar button ${b.width}x${b.height}`);
        assert.ok(within(b, width, height), `${at}: toolbar button in view`);
      }
      const canvas = await box(page, '#ctx');
      assert.ok(canvas.width > 100 && within(canvas, width, height), `${at} ${shape}: maze in view (${JSON.stringify(canvas)})`);
      assert.ok(!overlap(canvas, toolbar), `${at}: maze under the toolbar`);
      // Every pad button the shape shows on its first cell: as large as a
      // fingertip, in view, and off the maze and the toolbar.
      for (const circle of await page.locator('#directionPad [data-label] circle').all()) {
        const b = await circle.boundingBox();
        assert.ok(b.width >= TOUCH - 0.5, `${at} ${shape}: pad button ${b.width.toFixed(1)}px`);
        assert.ok(within(b, width, height), `${at} ${shape}: pad button in view`);
        assert.ok(!overlap(b, canvas), `${at} ${shape}: pad button covers the maze`);
        assert.ok(!overlap(b, toolbar), `${at} ${shape}: pad button under the toolbar`);
      }
      const scroll = await page.evaluate(() => {
        const s = document.scrollingElement;
        return { h: s.scrollHeight - s.clientHeight, w: s.scrollWidth - s.clientWidth };
      });
      assert.deepEqual(scroll, { h: 0, w: 0 }, `${at}: the page does not scroll`);
    }
    // Rotating a phone or tablet switches layout and keeps everything apart.
    if (kind !== 'desktop') {
      await page.setViewportSize({ width: height, height: width });
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [height, width]);
      // The page lays out again on the resize event, which comes before the
      // next frame.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const canvas = await box(page, '#ctx');
      for (const circle of await page.locator('#directionPad [data-label] circle').all()) {
        assert.ok(!overlap(await circle.boundingBox(), canvas), `${at} rotated: pad covers the maze`);
      }
    }
    assert.deepEqual(errors, [], at);
    await close();
  }
});

test('browser: every shape can be finished by tapping the pad, upright and on its side', { skip }, async () => {
  for (const [width, height] of [[390, 844], [844, 390]]) {
    const { page, errors, close } = await open(width, height, PHONE);
    for (const shape of SHAPES) {
      await newMaze(page, shape, 5, { touch: true });
      await playToExit(page, (label) => page.tap(padButton(label)));
      assert.equal((await state(page)).completed, true, `${shape} ${width}x${height}`);
    }
    assert.deepEqual(errors, []);
    await close();
  }
});

test('browser: taps, touch drags, pinches and mouse drags on the maze never move the player', { skip }, async () => {
  const { page, errors, close } = await open(390, 844, PHONE);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  for (const shape of SHAPES) {
    await newMaze(page, shape, 10, { touch: true });
    const c = await box(page, '#ctx');
    const [x, y] = [c.x + c.width / 2, c.y + c.height / 2];
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x + 20, y + 20);
    // One finger dragged, then two fingers pinched apart.
    await touch('touchStart', [[x, y]]);
    for (let k = 1; k <= 5; k++) await touch('touchMove', [[x - 10 * k, y + 8 * k]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[x - 10, y], [x + 10, y]]);
    for (let k = 1; k <= 5; k++) await touch('touchMove', [[x - 10 - 12 * k, y], [x + 10 + 12 * k, y]]);
    await touch('touchEnd', []);
    const s = await state(page);
    assert.equal(s.cell, 0, `${shape}: the player stays at the start`);
    assert.equal(s.moving, false, `${shape}: no move started`);
    // The pad still moves the player after the gestures.
    await page.tap(padButton(await page.evaluate(() => window.__mm.next())));
    await settled(page);
    assert.notEqual((await state(page)).cell, 0, `${shape}: the pad works after gestures`);
  }
  assert.deepEqual(errors, []);
  await close();

  const desktop = await open(1280, 800);
  const c = await box(desktop.page, '#ctx');
  await desktop.page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await desktop.page.mouse.down();
  await desktop.page.mouse.move(c.x + 20, c.y + 30, { steps: 5 });
  await desktop.page.mouse.up();
  await desktop.page.mouse.wheel(0, -400);
  await desktop.page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  assert.equal((await state(desktop.page)).cell, 0, 'mouse: the player stays at the start');
  assert.deepEqual(desktop.errors, []);
  await desktop.close();
});

// The key that takes `label` on `shape` (docs/controls.md).
const KEYS = {
  square: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' },
  hex: { N: 'w', S: 's', NE: 'e', NW: 'q', SE: 'd', SW: 'a' },
  triangle: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' },
  polar: { IN: 'ArrowDown', CW: 'ArrowRight', CCW: 'ArrowLeft' },
};
const keyFor = (shape, label) => (/^OUT\d$/.test(label) ? String(Number(label.slice(3)) + 1) : KEYS[shape][label]);

test('browser: keyboard-only play, with keys and with Tab and Enter on the pad', { skip }, async () => {
  const { page, errors, close } = await open(1280, 800);
  // Settings from the keyboard: Tab to the settings button, Enter opens them.
  const focusedId = () => page.evaluate(() => document.activeElement?.id ?? '');
  // Presses Tab until `accept(arg)` holds in the page, at most 40 times.
  const tabTo = async (accept, arg = null) => {
    for (let k = 0; k < 40; k++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(accept, arg)) return true;
    }
    return false;
  };
  assert.ok(await tabTo(() => document.activeElement?.id === 'OptionsButton'), 'Tab reaches the settings button');
  await page.keyboard.press('Enter');
  assert.equal(await page.getAttribute('#OptionsButton', 'aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await focusedId(), 'OptionsButton', 'Escape returns focus');

  for (const shape of SHAPES) {
    await newMaze(page, shape, 6, { touch: false });
    await page.evaluate(() => document.activeElement?.blur());
    await playToExit(page, (label) => page.keyboard.press(keyFor(shape, label)));
  }

  // The pad from the keyboard, on circles, whose buttons change every move.
  await newMaze(page, 'polar', 5, { touch: false });
  let first = true;
  await playToExit(page, async (label) => {
    // After a move the rebuilt pad keeps focus, so play can go on from it.
    if (!first) assert.ok(await page.evaluate(() => document.getElementById('directionPad').contains(document.activeElement)), 'focus stays on the pad');
    first = false;
    const focused = (l) => document.activeElement?.getAttribute('data-label') === l;
    if (!(await page.evaluate(focused, label))) assert.ok(await tabTo(focused, label), `Tab reaches ${label}`);
    await page.keyboard.press('Enter');
  });
  assert.deepEqual(errors, []);
  await close();
});

test('browser: with reduced motion a move ends at once; without it, it animates', { skip }, async () => {
  const reduced = await open(390, 844, PHONE, { reducedMotion: 'reduce' });
  assert.equal(await reduced.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  for (const shape of SHAPES) {
    await newMaze(reduced.page, shape, 8, { touch: true });
    const label = await reduced.page.evaluate(() => window.__mm.next());
    // Tap and read the state in the same task, before any animation frame.
    const after = await reduced.page.evaluate((id) => {
      document.querySelector(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { cell: window.__mm.cell, moving: window.__mm.moving };
    }, padButton(label));
    assert.equal(after.moving, false, `${shape}: not animated`);
    assert.notEqual(after.cell, 0, `${shape}: already moved`);
  }
  assert.deepEqual(reduced.errors, []);
  await reduced.close();

  const normal = await open(390, 844, PHONE);
  await newMaze(normal.page, 'square', 8, { touch: true });
  const label = await normal.page.evaluate(() => window.__mm.next());
  const moving = await normal.page.evaluate((id) => {
    document.querySelector(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return window.__mm.moving;
  }, padButton(label));
  assert.equal(moving, true, 'animated without reduced motion');
  await normal.close();
});
