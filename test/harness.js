// Loads index.html and src/javascripts/main.js into jsdom so the baseline tests
// can drive the game the way a browser would. Only main.js's import line is
// rewritten (see below). Canvas drawing is
// stubbed out: the tests check game state, not pixels.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as model from '../src/javascripts/maze/index.js';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8')
  // jsdom must not try to load the module itself; the harness evaluates it.
  .replace(/<script[^>]*main\.js[^>]*><\/script>/, '');
// jsdom cannot load ES modules, so main.js's import of the maze model is
// replaced by the same module loaded here.
const importPattern = /^import \{([^}]*)\} from '\.\/maze\/index\.js';$/m;
const source = readFileSync(new URL('src/javascripts/main.js', root), 'utf8')
  .replace(importPattern, 'const {$1} = window.__model;');
if (!source.includes('window.__model')) throw new Error('main.js no longer imports ./maze/index.js as expected');

// main.js keeps its state in top-level bindings; expose read access for tests.
const expose = `
window.__mm = {
  get topology() { return topology; },
  get maze() { return maze; },
  get player() { return player; },
  get exitCell() { return exitCell; },
  get route() { return route; },
  get width() { return width; },
  get height() { return height; },
  get autoNew() { return autoNew; },
  get increment() { return increment; },
  get hideT() { return hideT; },
  get canvas() { return canvas; },
  Find,
  NewMaze,
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
  const random = seeded(seed);
  let randomCalls = 0;
  window.Math.random = () => { randomCalls++; return random(); };
  window.__model = model;
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
    get randomCalls() { return randomCalls; },
    // Runs main.js's NewMaze() at a size the UI cannot express. NewMaze reads
    // the size field twice, first for the width (columns) and then for the
    // height (rows); this answers those reads with `cols` and `rows`.
    generate(cols, rows = cols) {
      const field = Object.getOwnPropertyDescriptor(window, 'display001');
      const reads = [cols, rows];
      Object.defineProperty(window, 'display001', {
        configurable: true,
        value: { get value() { return reads.shift(); }, set value(v) {} },
      });
      try {
        window.__mm.NewMaze();
      } finally {
        Object.defineProperty(window, 'display001', field);
      }
    },
  };
}

// Square-grid helpers, written against the grid geometry rather than the
// model's labels. They take the number of rows, so they work for any rectangle.
// Square cells are numbered column by column: index = x * rows + y,
// so UP/DOWN are -1/+1 and LEFT/RIGHT are -rows/+rows.
export const MOVES = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

// The cell one step from `i` in direction `dir`, or null outside the grid.
export function step(cols, rows, i, dir) {
  const x = Math.floor(i / rows) + MOVES[dir].dx;
  const y = (i % rows) + MOVES[dir].dy;
  return x >= 0 && x < cols && y >= 0 && y < rows ? x * rows + y : null;
}

// [direction, cell] for every open passage out of `i`.
export function neighbours(maze, rows, i) {
  const cols = maze.topology.size / rows;
  const out = [];
  for (const dir of Object.keys(MOVES)) {
    const j = step(cols, rows, i, dir);
    if (j !== null && maze.isLinked(i, j)) out.push([dir, j]);
  }
  return out;
}

// Breadth-first shortest route, independent of the model's shortestPath().
export function shortestRoute(maze, rows, from, to) {
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const i = queue.shift();
    if (i === to) break;
    for (const [dir, j] of neighbours(maze, rows, i)) {
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

// Checks that `maze` is a perfect maze on a cols x rows square grid: passages
// only join cells that are next to each other on the grid (so none leads out),
// each passage is open from both sides, and the passages form a spanning tree
// (every cell reachable, exactly one route between any two cells).
export function assertPerfectMaze(assert, maze, cols, rows) {
  const at = `${cols}x${rows}`;
  const n = cols * rows;
  assert.equal(maze.topology.kind, 'square', `${at} topology`);
  assert.equal(maze.topology.size, n, `${at} cell count`);
  assert.deepEqual(maze.consistencyErrors(), [], `${at} consistency`);
  let passages = 0;
  for (let i = 0; i < n; i++) {
    for (const j of maze.traversableNeighbours(i)) {
      assert.ok(maze.isLinked(j, i), `${at} passage ${i}->${j} is one-way`);
      const adjacent = Object.keys(MOVES).some((dir) => step(cols, rows, i, dir) === j);
      assert.ok(adjacent, `${at} passage ${i}-${j} joins cells that are not adjacent`);
      if (i < j) passages++;
    }
  }
  // A connected graph with n - 1 edges is a tree.
  assert.equal(passages, n - 1, `${at} passages`);
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    for (const [, j] of neighbours(maze, rows, queue.shift())) {
      if (!seen.has(j)) { seen.add(j); queue.push(j); }
    }
  }
  assert.equal(seen.size, n, `${at} reachable`);
}
