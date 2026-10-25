// Loads the unmodified index.html and src/javascripts/main.js into jsdom so the
// baseline tests can drive the game the way a browser would. Canvas drawing is
// stubbed out: the tests check game state, not pixels.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8')
  // jsdom must not try to load the module itself; the harness evaluates it.
  .replace(/<script[^>]*main\.js[^>]*><\/script>/, '');
const source = readFileSync(new URL('src/javascripts/main.js', root), 'utf8');

// main.js keeps its state in top-level bindings; expose read access for tests.
const expose = `
window.__mm = {
  get maze() { return maze; },
  get player() { return player; },
  get activePath() { return activePath; },
  get width() { return width; },
  get height() { return height; },
  get autoNew() { return autoNew; },
  get increment() { return increment; },
  get hideT() { return hideT; },
  get canvas() { return canvas; },
  Find,
};`;

function stubContext() {
  const noop = () => {};
  return new Proxy({ lineWidth: 1 }, {
    get(target, key) { return key in target ? target[key] : noop; },
    set(target, key, value) { target[key] = value; return true; },
  });
}

// Deterministic Math.random (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function loadGame({ seed = 1, innerWidth = 1024, innerHeight = 768 } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  window.HTMLCanvasElement.prototype.getContext = function () {
    return this.__ctx ??= stubContext();
  };
  window.Math.random = seeded(seed);
  window.eval(source + expose);
  // main.js generates the first maze on DOMContentLoaded, as in a browser.
  await new Promise((resolve) => window.document.addEventListener('DOMContentLoaded', resolve));

  const { document } = window;
  return {
    window,
    document,
    state: window.__mm,
    key(key) {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    },
    click(id) {
      document.getElementById(id).click();
    },
  };
}

// Index helpers. main.js stores cells column by column: index = x * height + y,
// so UP/DOWN are -1/+1 and LEFT/RIGHT are -height/+height.
export const MOVES = {
  UP: { wall: 'up', delta: (h) => -1 },
  DOWN: { wall: 'down', delta: (h) => 1 },
  LEFT: { wall: 'left', delta: (h) => -h },
  RIGHT: { wall: 'right', delta: (h) => h },
};

export function neighbours(maze, height, i) {
  const out = [];
  for (const [dir, { wall, delta }] of Object.entries(MOVES)) {
    if (maze[i][wall] === false) out.push([dir, i + delta(height)]);
  }
  return out;
}

// Breadth-first shortest route, independent of main.js's Find().
export function shortestRoute(maze, height, from, to) {
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const i = queue.shift();
    if (i === to) break;
    for (const [dir, j] of neighbours(maze, height, i)) {
      if (!prev.has(j)) { prev.set(j, [i, dir]); queue.push(j); }
    }
  }
  if (!prev.has(to)) return null;
  const cells = [to];
  const dirs = [];
  for (let i = to; prev.get(i); i = prev.get(i)[0]) {
    cells.unshift(prev.get(i)[0]);
    dirs.unshift(prev.get(i)[1]);
  }
  return { cells, dirs };
}
