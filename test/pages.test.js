// The site as GitHub Pages serves it (CAL-1245 / MM-V1-16). The production
// build is made with `vite build` into a temporary directory and served from
// /mazemaker/ by a strict static server like Pages': no fallback page, so a
// missing or misplaced file is a 404, as it would be in production.
//
// Without a browser, these check the build's references (scripts/check-dist.mjs)
// and fetch every referenced file. With Playwright (test/playwright.js), a
// smoke test plays the built site in headless Chromium: every shape and mode,
// corridor moves, the route, zoom and pan, and the settings. It cannot reach
// the live site; docs/deploy.md has the check to do there after a deploy.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { checkDist, BASE } from '../scripts/check-dist.mjs';
import { launch } from './playwright.js';
import config from '../vite.config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'mazemaker-pages-'));
const { browser, skip } = await launch();

// Read access to main.js's top-level state for the browser smoke test, added
// to a second build only; the build checked for publishing is untouched.
const EXPOSE = `
window.__mm = {
  get cell() { return player.cell; },
  get moving() { return player.moving; },
  get completed() { return completed; },
  get shape() { return shape; },
  get strategy() { return strategy; },
  get size() { return topology.size; },
  get route() { return route.length; },
  get zoom() { return renderer.viewport?.zoom ?? null; },
  get pan() { return renderer.viewport ? [renderer.viewport.panX, renderer.viewport.panY] : null; },
  next() {
    const [, to] = shortestPath(maze, player.cell, exitCell);
    return maze.topology.links(player.cell).find((l) => l.cell === to).label;
  },
};`;
const expose = {
  name: 'expose-state',
  transform(code, id) {
    return id.endsWith('/src/javascripts/main.js') ? code + EXPOSE : null;
  },
};

async function buildInto(outDir, plugins = []) {
  await build({ root, logLevel: 'silent', plugins, build: { outDir, emptyOutDir: true } });
  return outDir;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

// Serves `dir` at /mazemaker/ the way GitHub Pages serves the project site:
// a directory serves its index.html, and anything else that is not a file is
// a 404.
async function serve(dir) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.startsWith(BASE) ? join(dir, path.slice(BASE.length)) : null;
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file || !existsSync(file) || path.includes('..')) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${server.address().port}${BASE}`, close: () => new Promise((done) => server.close(done)) };
}

let dist = null;
let site = null;
before(async () => {
  dist = await buildInto(join(temp, 'dist'));
  site = await serve(dist);
});

after(async () => {
  await browser?.close();
  await site?.close();
  rmSync(temp, { recursive: true, force: true });
});

test('pages: the site is built for the /mazemaker/ path', () => {
  assert.equal(config.base, '/mazemaker/');
  assert.equal(BASE, config.base);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /https:\/\/calypsogrammar\.github\.io\/mazemaker\//, 'the README links the production URL');
});

test('pages: every file the build refers to is in it, under /mazemaker/', () => {
  assert.deepEqual(checkDist(dist), []);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(html, /<script type="module"[^>]*src="\/mazemaker\/assets\/[^"]+\.js"/);
  assert.match(html, /<link rel="stylesheet" href="\/mazemaker\/assets\/[^"]+\.css"/);
  assert.match(html, /<link rel="icon" href="\/mazemaker\/assets\/[^"]+"/);
});

test('pages: the check finds references that would 404 on Pages', () => {
  const bad = join(temp, 'bad');
  mkdirSync(join(bad, 'assets'), { recursive: true });
  writeFileSync(join(bad, 'assets', 'app.js'), 'import("/mazemaker/assets/gone.js");');
  writeFileSync(join(bad, 'assets', 'app.css'), 'a { background: url(./missing.png) } b { background: url(data:image/png;base64,AA==) }');
  writeFileSync(join(bad, 'index.html'), [
    '<script type="module" src="/mazemaker/assets/app.js"></script>',
    '<link rel="stylesheet" href="/mazemaker/assets/app.css">',
    '<link rel="icon" href="/assets/favicon.ico">',
    '<script src="./src/javascripts/main.js"></script>',
    '<a href="https://example.com/">x</a><a href="#top">y</a>',
  ].join('\n'));
  const problems = checkDist(bad);
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('/assets/favicon.ico is outside the /mazemaker/ base')));
  assert.ok(problems.some((p) => p.includes('./src/javascripts/main.js is a source path')));
  assert.ok(problems.some((p) => p.includes('./missing.png is not in the build')));
  assert.ok(problems.some((p) => p.includes('/mazemaker/assets/gone.js is not in the build')));
  assert.deepEqual(checkDist(join(temp, 'nothing')), [`${join(temp, 'nothing', 'index.html')} is missing`]);
});

test('pages: the page and every file it loads are served from /mazemaker/', async () => {
  const page = await fetch(site.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  const refs = [...html.matchAll(/\s(?:src|href)=["'](\/mazemaker\/[^"']+)["']/g)].map(([, ref]) => ref);
  assert.ok(refs.length >= 3, `the page loads its script, stylesheet and icon (${refs})`);
  for (const ref of refs) {
    const response = await fetch(new URL(ref, site.url));
    assert.equal(response.status, 200, ref);
    assert.ok((await response.arrayBuffer()).byteLength > 0, `${ref} is not empty`);
  }
  assert.equal((await fetch(new URL('/assets/', site.url))).status, 404, 'nothing is served outside /mazemaker/');
});

const SHAPES = ['square', 'hex', 'triangle', 'polar'];
const MODES = ['mixed', 'newest', 'oldest', 'random'];
const KEYS = {
  square: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' },
  hex: { N: 'w', S: 's', NE: 'e', NW: 'q', SE: 'd', SW: 'a' },
  triangle: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' },
  polar: { IN: 'ArrowDown', CW: 'ArrowRight', CCW: 'ArrowLeft' },
};
const keyFor = (shape, label) => (/^OUT\d$/.test(label) ? String(Number(label.slice(3)) + 1) : KEYS[shape][label]);

test('pages: smoke test of the built site in Chromium: every shape and mode, route, zoom, pan and settings', { skip }, async () => {
  const smoke = await serve(await buildInto(join(temp, 'smoke'), [expose]));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => errors.push(`failed: ${request.url()}`));
  try {
    await page.goto(smoke.url);
    await page.waitForFunction(() => window.__mm !== undefined && window.__mm.zoom !== null);
    // The stylesheet loaded and applied: Tailwind's body class hides overflow.
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');

    for (const shape of SHAPES) {
      for (const mode of MODES) {
        await page.click('#OptionsButton');
        assert.equal(await page.getAttribute('#OptionsButton', 'aria-expanded'), 'true', 'the settings open');
        await page.selectOption('#mazeShape', shape);
        await page.selectOption('#mazeMode', mode);
        await page.fill('#display001', '6');
        if (await page.isChecked('#autonew')) await page.click('#autonew');
        await page.click('#generateMaze');
        await page.waitForFunction(([s, m]) => window.__mm.shape === s && window.__mm.strategy === m && window.__mm.cell === 0, [shape, mode]);
        await page.evaluate(() => document.activeElement?.blur());
        const at = `${shape} ${mode}`;

        // The route from the player to the exit.
        await page.click('#SearchButton');
        assert.equal(await page.getAttribute('#SearchButton', 'aria-pressed'), 'true', `${at}: route shown`);
        assert.ok(await page.evaluate(() => window.__mm.route) > 1, `${at}: the route reaches the exit`);
        await page.click('#SearchButton');
        assert.equal(await page.evaluate(() => window.__mm.route), 0, `${at}: route hidden`);

        // Played to the exit with the keys; each move runs along its corridor.
        const size = await page.evaluate(() => window.__mm.size);
        let moves = 0;
        while (!(await page.evaluate(() => window.__mm.completed))) {
          assert.ok(moves++ <= size, `${at}: the exit is reached`);
          await page.keyboard.press(keyFor(shape, await page.evaluate(() => window.__mm.next())));
          await page.waitForFunction(() => !window.__mm.moving);
        }
        assert.equal(await page.isVisible('#completeBanner'), true, `${at}: completion shown`);
      }
    }

    // Zoom with the wheel, pan with a drag, and fit again.
    await page.click('#completeNew');
    await page.waitForFunction(() => window.__mm.cell === 0 && !window.__mm.completed);
    const c = await page.locator('#ctx').boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.wheel(0, -600);
    await page.waitForFunction(() => window.__mm.zoom > 1);
    const pan = await page.evaluate(() => window.__mm.pan);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 - 60, c.y + c.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    assert.notDeepEqual(await page.evaluate(() => window.__mm.pan), pan, 'a drag pans');
    assert.equal(await page.evaluate(() => window.__mm.cell), 0, 'zoom and pan do not move the player');
    await page.click('#ResetViewButton');
    await page.waitForFunction(() => window.__mm.zoom === 1);

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await smoke.close();
  }
});
