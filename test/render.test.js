// Rendering (CAL-1235): geometry for every topology, the viewport transform,
// the Canvas 2D renderer, and how the game uses them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareTopology, hexTopology, triangleTopology, polarTopology, growingTree, Maze } from '../src/javascripts/maze/index.js';
import { geometryFor, Viewport, CanvasRenderer } from '../src/javascripts/render/index.js';
import { loadGame } from './harness.js';

const EPS = 1e-9;

const TOPOLOGIES = [
  ['square 5x3', () => squareTopology(5, 3)],
  ['square 1x1', () => squareTopology(1, 1)],
  ['hex 5x4', () => hexTopology(5, 4)],
  ['hex 1x3', () => hexTopology(1, 3)],
  ['triangle 6x3', () => triangleTopology(6, 3)],
  ['polar 5', () => polarTopology(5)],
  ['polar 1', () => polarTopology(1)],
];

// Deterministic random numbers (mulberry32).
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

const near = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;

// Same polyline, in either direction.
function sameSide(a, b) {
  if (a.length !== b.length) return false;
  const reversed = [...b].reverse();
  return a.every((p, k) => near(p, b[k])) || a.every((p, k) => near(p, reversed[k]));
}

function inside(point, polygon) {
  let crossings = 0;
  for (let k = 0, j = polygon.length - 1; k < polygon.length; j = k++) {
    const a = polygon[k];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) crossings++;
  }
  return crossings % 2 === 1;
}

// A 2D context that records method calls, and a canvas that owns it.
function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, key) { return key in target ? target[key] : (...args) => { calls.push([key, ...args]); }; },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { width: 300, height: 150, style: {}, getContext: () => ctx, ctx, calls };
}

// The calls made between the beginPath and the stroke that draw the walls.
function wallCalls(calls) {
  const end = calls.findIndex(([name]) => name === 'stroke');
  let start = end;
  while (calls[start][0] !== 'beginPath') start--;
  return calls.slice(start + 1, end);
}

for (const [name, make] of TOPOLOGIES) {
  test(`${name}: every neighbour has one side, shared by both cells`, () => {
    const topology = make();
    const geometry = geometryFor(topology);
    assert.equal(geometry.kind, topology.kind);
    for (const cell of topology.cells()) {
      const walls = geometry.walls(cell);
      const across = walls.map((w) => w.neighbour).filter((n) => n !== null).sort((a, b) => a - b);
      assert.deepEqual(across, [...topology.neighbours(cell)].sort((a, b) => a - b), `cell ${cell} sides`);
      for (const { neighbour, points } of walls) {
        assert.ok(points.length >= 2, `cell ${cell} side has ${points.length} points`);
        if (neighbour === null) continue;
        const back = geometry.walls(neighbour).find((w) => w.neighbour === cell);
        assert.ok(sameSide(points, back.points), `side ${cell}-${neighbour} differs between the two cells`);
      }
    }
  });

  test(`${name}: centres lie inside their outlines, and outlines inside the bounds`, () => {
    const topology = make();
    const { bounds, centre, outline } = geometryFor(topology);
    for (const cell of topology.cells()) {
      const shape = outline(cell);
      assert.ok(shape.length >= 3, `cell ${cell} outline`);
      assert.ok(inside(centre(cell), shape), `cell ${cell} centre is outside its outline`);
      for (const p of shape) {
        assert.ok(p.x >= bounds.minX - EPS && p.x <= bounds.maxX + EPS && p.y >= bounds.minY - EPS && p.y <= bounds.maxY + EPS,
          `cell ${cell} point (${p.x}, ${p.y}) is outside the bounds`);
      }
    }
  });

  test(`${name}: the renderer draws exactly the walls and leaves the maze alone`, () => {
    const topology = make();
    const geometry = geometryFor(topology);
    const { maze } = growingTree(topology, { random: seeded(7) });
    const before = JSON.stringify(maze.passages());
    // Any attempt to change the maze through the scene fails loudly.
    const readOnly = new Proxy(maze, {
      get(target, key) {
        if (key === 'link' || key === 'unlink') throw new Error(`renderer called maze.${key}`);
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const canvas = fakeCanvas();
    const renderer = new CanvasRenderer(canvas);
    renderer.resize(200, 200);
    const path = Object.freeze([0, ...topology.neighbours(0).slice(0, 1)]);
    renderer.render({ maze: readOnly, geometry, player: 0, goal: topology.size - 1, path });
    assert.equal(JSON.stringify(maze.passages()), before);
    assert.deepEqual(maze.consistencyErrors(), []);

    // Border sides, plus each closed pair of neighbours once.
    let pairs = 0;
    let border = 0;
    for (const cell of topology.cells()) {
      for (const { neighbour } of geometry.walls(cell)) {
        if (neighbour === null) border++;
        else if (cell < neighbour) pairs++;
      }
    }
    const moves = wallCalls(canvas.calls).filter(([n]) => n === 'moveTo').length;
    assert.equal(moves, border + pairs - maze.passages().length);
    // Path, goal and player are filled.
    assert.equal(canvas.calls.filter(([n]) => n === 'fill').length, 3);
  });
}

test('geometryFor rejects a topology kind it has no layout for', () => {
  const topology = squareTopology(2);
  assert.throws(() => geometryFor({ ...topology, kind: 'cube' }), /no geometry/);
});

test('square geometry: unit cells at their column and row', () => {
  const topology = squareTopology(4, 3);
  const g = geometryFor(topology);
  const cell = topology.cellAt(2, 1);
  assert.deepEqual(g.bounds, { minX: 0, minY: 0, maxX: 4, maxY: 3 });
  assert.deepEqual(g.centre(cell), { x: 2.5, y: 1.5 });
  assert.deepEqual(g.outline(cell), [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 2 }]);
  const right = g.walls(cell).find((w) => w.neighbour === topology.cellAt(3, 1));
  assert.deepEqual(right.points, [{ x: 3, y: 1 }, { x: 3, y: 2 }]);
});

test('one renderer draws any geometry: switching topology needs no renderer change', () => {
  const canvas = fakeCanvas();
  const renderer = new CanvasRenderer(canvas);
  renderer.resize(300, 300);
  for (const [, make] of TOPOLOGIES) {
    const topology = make();
    const { maze } = growingTree(topology, { random: seeded(3) });
    canvas.calls.length = 0;
    renderer.render({ maze, geometry: geometryFor(topology), player: 0, goal: topology.size - 1 });
    assert.ok(canvas.calls.some(([n]) => n === 'stroke'));
    // The drawing fits in the canvas.
    const v = renderer.viewport;
    const { bounds } = geometryFor(topology);
    for (const p of [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }]) {
      const s = v.toScreen(p);
      assert.ok(s.x >= 0 && s.x <= 300 && s.y >= 0 && s.y <= 300, `${topology.kind} corner at ${s.x}, ${s.y}`);
    }
  }
});

test('renderer scales the backing store by the device pixel ratio', () => {
  const canvas = fakeCanvas();
  const renderer = new CanvasRenderer(canvas);
  renderer.resize(100, 80, 2);
  assert.equal(canvas.width, 200);
  assert.equal(canvas.height, 160);
  assert.equal(canvas.style.width, '100px');
  assert.equal(canvas.style.height, '80px');
  const topology = squareTopology(4);
  renderer.render({ maze: new Maze(topology), geometry: geometryFor(topology), player: 0, goal: 15 });
  const transforms = canvas.calls.filter(([n]) => n === 'setTransform');
  // Reset to clear, then world -> device pixels.
  assert.deepEqual(transforms[0].slice(1), [1, 0, 0, 1, 0, 0]);
  const [a, , , d, e, f] = transforms[1].slice(1);
  const v = renderer.viewport;
  assert.equal(a, v.scale * 2);
  assert.equal(d, v.scale * 2);
  assert.equal(e, v.offsetX * 2);
  assert.equal(f, v.offsetY * 2);
  assert.ok(canvas.calls.some(([n, , , w, h]) => n === 'clearRect' && w === 200 && h === 160));
  // Walls stay one CSS pixel wide whatever the scale.
  assert.equal(canvas.ctx.lineWidth * v.scale, 1);
});

test('viewport fits and centres the bounds, and toWorld inverts toScreen', () => {
  const bounds = { minX: 0, minY: 0, maxX: 4, maxY: 2 };
  const v = new Viewport({ bounds, width: 200, height: 200, padding: 10 });
  assert.equal(v.scale, 45);
  assert.deepEqual(v.toScreen({ x: 0, y: 0 }), { x: 10, y: 55 });
  assert.deepEqual(v.toScreen({ x: 4, y: 2 }), { x: 190, y: 145 });
  const p = { x: 1.25, y: 0.5 };
  const back = v.toWorld(v.toScreen(p));
  assert.ok(near(back, p));
  assert.deepEqual(v.matrix(), [45, 0, 0, 45, 10, 55]);
  assert.deepEqual(v.with({ dpr: 3 }).matrix(), [135, 0, 0, 135, 30, 165]);
});

test('viewport zooms about the canvas centre and pans in CSS pixels', () => {
  const bounds = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  const v = new Viewport({ bounds, width: 100, height: 100 });
  const zoomed = v.with({ zoom: 2 });
  assert.equal(zoomed.scale, 2 * v.scale);
  assert.deepEqual(zoomed.toScreen({ x: 0, y: 0 }), { x: 50, y: 50 });
  assert.deepEqual(zoomed.toScreen({ x: 0.5, y: 0 }), { x: 100, y: 50 });
  const panned = zoomed.with({ panX: 10, panY: -5 });
  assert.deepEqual(panned.toScreen({ x: 0, y: 0 }), { x: 60, y: 45 });
  assert.ok(near(panned.toWorld({ x: 60, y: 45 }), { x: 0, y: 0 }));
  assert.equal(v.zoom, 1, 'with() leaves the original unchanged');
  assert.throws(() => v.with({ zoom: 0 }), RangeError);
  assert.throws(() => v.with({ width: 0 }), RangeError);
});

test('renderer setView applies zoom and pan on the next render', () => {
  const canvas = fakeCanvas();
  const renderer = new CanvasRenderer(canvas);
  renderer.resize(100, 100);
  const topology = squareTopology(2);
  const scene = { maze: new Maze(topology), geometry: geometryFor(topology) };
  renderer.render(scene);
  const fit = renderer.viewport.scale;
  renderer.setView({ zoom: 3, panX: 7 });
  assert.equal(renderer.viewport, null);
  renderer.render(scene);
  assert.equal(renderer.viewport.scale, 3 * fit);
  assert.equal(renderer.viewport.panX, 7);
});

test('game: high-DPI screens get a sharper backing store of the same displayed size', async () => {
  const g = await loadGame({ devicePixelRatio: 2 });
  const size = 768 * 0.625 * 0.9;
  assert.equal(g.state.canvas.style.width, `${size}px`);
  assert.equal(g.state.canvas.width, Math.floor(size * 2));
  assert.equal(g.state.canvas.height, Math.floor(size * 2));
});

test('game: resizing the window keeps the maze, player and route, and redraws them', async () => {
  const g = await loadGame({ seed: 5 });
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(8);
  const [first] = g.state.maze.traversableLinks(0);
  const trail = g.key({ UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' }[first.label]);
  assert.equal(trail[1], first.cell);
  const cell = g.state.player.cell;
  g.click('SearchButton');
  const maze = g.state.maze;
  const passages = JSON.stringify(maze.passages());
  const route = [...g.state.route];
  const width = g.state.canvas.width;

  for (const [w, h, dpr] of [[390, 844, 3], [1920, 1080, 1], [800, 600, 1.5]]) {
    g.drawCalls.length = 0;
    g.resize(w, h, dpr);
    const size = Math.min(w, h * 0.625) * 0.9;
    assert.equal(g.state.canvas.style.width, `${size}px`, `${w}x${h}`);
    assert.equal(g.state.canvas.width, Math.floor(size * dpr), `${w}x${h}@${dpr}`);
    assert.equal(g.state.maze, maze);
    assert.equal(JSON.stringify(g.state.maze.passages()), passages);
    assert.equal(g.state.player.cell, cell);
    assert.deepEqual([...g.state.route], route);
    assert.ok(g.drawCalls.some(([n]) => n === 'stroke'), 'redrawn after resize');
  }
  assert.notEqual(g.state.canvas.width, width);
});

test('game: the square grid is drawn with the player and exit in their cells', async () => {
  const g = await loadGame();
  const { geometry, topology, renderer } = g.state;
  assert.equal(geometry.kind, 'square');
  assert.equal(geometry.bounds.maxX, topology.cols);
  const v = renderer.viewport;
  // The 5x5 grid fills the canvas, less one pixel of margin for the outer walls.
  const side = 768 * 0.625 * 0.9;
  assert.ok(Math.abs(v.toScreen({ x: 0, y: 0 }).x - 1) < EPS);
  assert.ok(Math.abs(v.toScreen({ x: 5, y: 5 }).y - (side - 1)) < EPS);
  // Markers: the last two fills are the exit then the player, each half a cell.
  const calls = g.drawCalls;
  const fills = calls.map(([n], k) => (n === 'fill' ? k : -1)).filter((k) => k >= 0);
  const markerPoints = (end) => {
    let start = end;
    while (calls[start][0] !== 'beginPath') start--;
    return calls.slice(start + 1, end).filter(([n]) => n === 'moveTo' || n === 'lineTo').map(([, x, y]) => ({ x, y }));
  };
  assert.deepEqual(markerPoints(fills.at(-2)), [{ x: 4.25, y: 4.25 }, { x: 4.75, y: 4.25 }, { x: 4.75, y: 4.75 }, { x: 4.25, y: 4.75 }]);
  assert.deepEqual(markerPoints(fills.at(-1)), [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }]);
});
