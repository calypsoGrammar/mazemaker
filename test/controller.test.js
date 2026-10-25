// Adaptable directional controller (CAL-1238 / MM-V1-09): an input adapter
// from keys and on-screen controls to open passages, an SVG pad for any set of
// directions, and canvas gestures that never move the player.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  squareTopology, hexTopology, triangleTopology, polarTopology, growingTree, seededRandom, Maze,
} from '../src/javascripts/maze/index.js';
import { geometryFor } from '../src/javascripts/render/index.js';
import {
  angleBetween, directionsAt, pickDirection, keyAngle, DirectionPad, layoutAngles, directionName,
} from '../src/javascripts/input/index.js';
import { corridorRun, loadGame, neighbours } from './harness.js';

const ARROWS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' };
const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
const LEFT = Math.PI;
const RIGHT = 0;

const TOPOLOGIES = [
  ['square 6x5', () => squareTopology(6, 5)],
  ['hex 6x5', () => hexTopology(6, 5)],
  ['triangle 7x4', () => triangleTopology(7, 4)],
  ['polar 5', () => polarTopology(5)],
];

function perfect(topology, seed = 3) {
  return growingTree(topology, { random: seededRandom(seed) }).maze;
}

// The adapter

test('directionsAt: a square cell always has UP, RIGHT, DOWN, LEFT at their screen angles', () => {
  const t = squareTopology(4, 3);
  const maze = perfect(t);
  const geometry = geometryFor(t);
  for (const cell of t.cells()) {
    const dirs = directionsAt(maze, geometry, cell);
    assert.deepEqual(dirs.map((d) => d.label), ['UP', 'RIGHT', 'DOWN', 'LEFT']);
    for (const [k, angle] of [UP, RIGHT, DOWN, LEFT].entries()) {
      assert.ok(angleBetween(dirs[k].angle, angle) < 1e-9, `cell ${cell} ${dirs[k].label}`);
      const neighbour = t.neighbourByLabel(cell, dirs[k].label);
      assert.equal(dirs[k].cell, neighbour);
      assert.equal(dirs[k].open, neighbour !== null && maze.isLinked(cell, neighbour));
    }
  }
});

for (const [name, make] of TOPOLOGIES) {
  test(`directionsAt (${name}): every neighbour once, facing it, open only through a passage`, () => {
    const t = make();
    const maze = perfect(t);
    const geometry = geometryFor(t);
    for (const cell of t.cells()) {
      const dirs = directionsAt(maze, geometry, cell);
      const real = dirs.filter((d) => d.cell !== null);
      assert.deepEqual(real.map((d) => d.label).sort(), t.links(cell).map((n) => n.label).sort(), `cell ${cell}`);
      const from = geometry.centre(cell);
      for (const d of dirs) {
        if (d.cell === null) { assert.equal(d.open, false); continue; }
        assert.equal(d.open, maze.isLinked(cell, d.cell), `cell ${cell} ${d.label}`);
        const to = geometry.centre(d.cell);
        const towards = Math.atan2(to.y - from.y, to.x - from.x);
        assert.ok(angleBetween(d.angle, towards) < Math.PI / 2, `cell ${cell} ${d.label} faces its neighbour`);
      }
    }
  });
}

test('directionsAt: hex cells keep all six directions in compass order', () => {
  const t = hexTopology(3, 3);
  const maze = perfect(t);
  const dirs = directionsAt(maze, geometryFor(t), 0);
  assert.deepEqual(dirs.map((d) => d.label), ['N', 'NE', 'SE', 'S', 'SW', 'NW']);
  // The top-left cell (an even column, so its diagonals reach the row above)
  // has only SE and S neighbours.
  for (const d of dirs) assert.equal(d.cell === null, !['SE', 'S'].includes(d.label), d.label);
});

test('pickDirection: on a square grid a key only ever takes its own direction', () => {
  const all = [['UP', UP], ['RIGHT', RIGHT], ['DOWN', DOWN], ['LEFT', LEFT]];
  for (let mask = 0; mask < 16; mask++) {
    const dirs = all.map(([label, angle], k) => ({ label, angle, open: Boolean(mask & (1 << k)) }));
    for (const [k, [label, angle]] of all.entries()) {
      assert.equal(pickDirection(dirs, angle), mask & (1 << k) ? label : null, `mask ${mask} ${label}`);
    }
  }
});

test('pickDirection: takes the nearest open passage, and nothing when two are equally near', () => {
  const hex = [['N', UP], ['NE', -Math.PI / 6], ['SE', Math.PI / 6], ['S', DOWN], ['SW', (5 * Math.PI) / 6], ['NW', (-5 * Math.PI) / 6]];
  const dirs = (...open) => hex.map(([label, angle]) => ({ label, angle, open: open.includes(label) }));
  assert.equal(pickDirection(dirs('N', 'NE', 'SW'), UP), 'N');
  assert.equal(pickDirection(dirs('SW'), LEFT), 'SW');
  assert.equal(pickDirection(dirs('NW', 'SW'), LEFT), null);
  assert.equal(pickDirection(dirs('N'), DOWN), null);
  assert.equal(pickDirection(dirs('NE'), UP), 'NE');
  assert.equal(pickDirection(dirs('NE'), UP, { tolerance: Math.PI / 6 - 0.01 }), null);
  assert.equal(pickDirection([], UP), null);
});

test('keyAngle: arrow keys and WASD in either case; nothing else', () => {
  for (const [keys, angle] of [[['ArrowUp', 'w', 'W'], UP], [['ArrowDown', 's', 'S'], DOWN], [['ArrowLeft', 'a', 'A'], LEFT], [['ArrowRight', 'd', 'D'], RIGHT]]) {
    for (const key of keys) assert.equal(keyAngle(key), angle, key);
  }
  for (const key of ['Enter', ' ', 'q', 'constructor', 'toString', '__proto__']) assert.equal(keyAngle(key), undefined, key);
});

// The pad layout

test('layoutAngles: well-spaced directions keep their own angles', () => {
  for (const angles of [[UP, RIGHT, DOWN, LEFT], [UP, -Math.PI / 6, Math.PI / 6, DOWN, (5 * Math.PI) / 6, (-5 * Math.PI) / 6], [0, 2, 4], [1]]) {
    const out = layoutAngles(angles);
    out.angles.forEach((a, k) => assert.ok(angleBetween(a, angles[k]) < 1e-9, `${angles} ${k}`));
  }
});

test('layoutAngles: crowded directions are pushed apart, in order, to at least 60° (or an even share)', () => {
  const random = seededRandom(9);
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + Math.floor(random() * 10);
    // Bunch the angles up so they need spreading.
    const base = random() * 7;
    const angles = Array.from({ length: n }, () => base + random() * 0.8);
    const { angles: out, gap } = layoutAngles(angles);
    const need = Math.min((2 * Math.PI) / n, Math.PI / 3);
    assert.ok(gap >= need - 1e-6, `trial ${trial}: gap ${gap} < ${need}`);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) assert.ok(angleBetween(out[i], out[j]) >= need - 1e-6, `trial ${trial} ${i}-${j}`);
    }
  }
});

test('directionName: readable names for every label the topologies use', () => {
  assert.equal(directionName('UP'), 'up');
  assert.equal(directionName('NW'), 'north-west');
  assert.equal(directionName('CCW'), 'anticlockwise');
  assert.equal(directionName('OUT0'), 'outward 1');
  assert.equal(directionName('OUT2'), 'outward 3');
  assert.equal(directionName('SIDEWAYS'), 'sideways');
});

// The SVG pad on its own

function padDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><svg id="pad"></svg></body>');
  const svg = dom.window.document.getElementById('pad');
  const chosen = [];
  const pad = new DirectionPad(svg, { onSelect: (label) => chosen.push(label) });
  return { dom, svg, pad, chosen, window: dom.window };
}

const tap = (window, node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

// Each button's circle, in the pad's coordinates.
function circles(pad) {
  return pad.buttons.map((b) => {
    const c = b.querySelector('circle');
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) };
  });
}

function assertFits(pad, at) {
  const list = circles(pad);
  for (const [i, c] of list.entries()) {
    assert.ok(Math.abs(c.x) + c.r <= 100 && Math.abs(c.y) + c.r <= 100, `${at}: button ${i} inside the pad`);
    assert.ok(c.r >= 10, `${at}: button ${i} big enough to tap`);
    for (const d of list.slice(i + 1)) assert.ok(Math.hypot(c.x - d.x, c.y - d.y) >= c.r + d.r, `${at}: buttons overlap`);
  }
}

test('pad: draws any direction set, one non-overlapping button per direction, where it faces', () => {
  const { pad, svg } = padDom();
  assert.equal(svg.getAttribute('viewBox'), '-100 -100 200 200');
  for (let n = 1; n <= 10; n++) {
    const dirs = Array.from({ length: n }, (_, k) => ({ label: `D${k}`, angle: (k * 2 * Math.PI) / n - Math.PI / 2, open: true }));
    pad.update(dirs);
    assert.equal(pad.buttons.length, n);
    assert.deepEqual(pad.buttons.map((b) => b.getAttribute('data-label')), dirs.map((d) => d.label));
    assertFits(pad, `${n} directions`);
    circles(pad).forEach((c, k) => {
      if (n > 1) assert.ok(angleBetween(Math.atan2(c.y, c.x), dirs[k].angle) < 0.01, `${n}: button ${k} faces its direction`);
    });
  }
});

test('pad: square buttons sit up, right, down and left and keep the old button IDs', () => {
  const { pad, dom } = padDom();
  pad.update([['UP', UP], ['RIGHT', RIGHT], ['DOWN', DOWN], ['LEFT', LEFT]].map(([label, angle]) => ({ label, angle, open: true })));
  const doc = dom.window.document;
  const at = (id) => { const c = doc.querySelector(`#${id} circle`); return [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]; };
  assert.deepEqual(at('upButton'), [0, -62]);
  assert.deepEqual(at('rightButton'), [62, 0]);
  assert.deepEqual(at('downButton'), [0, 62]);
  assert.deepEqual(at('leftButton'), [-62, 0]);
  assert.equal(doc.getElementById('upButton').getAttribute('aria-label'), 'Move up');
  assert.equal(doc.getElementById('upButton').getAttribute('role'), 'button');
});

test('pad: only open directions can be chosen, by tap or by Enter/Space', () => {
  const { pad, chosen, window } = padDom();
  pad.update([{ label: 'A', angle: 0, open: true }, { label: 'B', angle: 2, open: false }, { label: 'C', angle: 4, open: true }]);
  const [a, b, c] = pad.buttons;
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  assert.equal(b.getAttribute('tabindex'), '-1');
  assert.equal(a.getAttribute('aria-disabled'), 'false');
  tap(window, b);
  tap(window, b.querySelector('path'));
  tap(window, a.querySelector('circle'));
  tap(window, c.querySelector('path'));
  for (const key of ['Enter', ' ', 'x']) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    assert.equal(event.defaultPrevented, key !== 'x', key);
  }
  // A tap on the pad between buttons chooses nothing.
  tap(window, pad.buttons[0].parentNode);
  assert.deepEqual(chosen, ['A', 'C', 'A', 'A']);
});

test('pad: changing which passages are open keeps the same buttons; a new direction set redraws', () => {
  const { pad } = padDom();
  const square = (open) => [['UP', UP], ['RIGHT', RIGHT], ['DOWN', DOWN], ['LEFT', LEFT]].map(([label, angle], k) => ({ label, angle, open: open[k] }));
  pad.update(square([true, false, false, true]));
  const before = pad.buttons;
  pad.update(square([false, true, true, false]));
  assert.deepEqual(pad.buttons, before);
  assert.deepEqual(pad.buttons.map((b) => b.getAttribute('aria-disabled')), ['true', 'false', 'false', 'true']);
  pad.update([{ label: 'LEFT', angle: LEFT, open: true }, { label: 'RIGHT', angle: RIGHT, open: true }, { label: 'UP', angle: UP, open: false }]);
  assert.equal(pad.buttons.length, 3);
  assert.notEqual(pad.buttons[0], before[3]);
});

for (const [name, make] of TOPOLOGIES) {
  test(`pad (${name}): every cell's controls fit and offer exactly its open passages`, () => {
    const t = make();
    const maze = perfect(t);
    const geometry = geometryFor(t);
    const { pad, chosen, window } = padDom();
    for (const cell of t.cells()) {
      const dirs = directionsAt(maze, geometry, cell);
      pad.update(dirs);
      assertFits(pad, `${name} cell ${cell}`);
      chosen.length = 0;
      for (const button of pad.buttons) tap(window, button);
      assert.deepEqual(chosen.map((label) => maze.move(cell, label)).sort((x, y) => x - y), maze.traversableNeighbours(cell).sort((x, y) => x - y), `${name} cell ${cell}`);
    }
  });
}

test('pad: a polar centre cell offers one button per outward passage', () => {
  const t = polarTopology(3);
  const maze = new Maze(t);
  for (const n of t.neighbours(0)) maze.link(0, n);
  const { pad } = padDom();
  pad.update(directionsAt(maze, geometryFor(t), 0));
  assert.equal(pad.buttons.length, t.neighbours(0).length);
  assert.ok(pad.buttons.every((b) => b.getAttribute('aria-disabled') === 'false'));
});

test('pad: pointer and touch gestures on the pad do not reach the page', () => {
  const { svg, pad, window } = padDom();
  pad.update([{ label: 'A', angle: 0, open: true }]);
  const seen = [];
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel']) {
    window.document.addEventListener(type, () => seen.push(type));
    pad.buttons[0].dispatchEvent(new window.Event(type, { bubbles: true }));
  }
  assert.deepEqual(seen, []);
  assert.ok(svg.contains(pad.buttons[0]));
});

// The game

async function squareGame(n, seed = n) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(n);
  return g;
}

const enabled = (g) => g.state.pad.buttons
  .filter((b) => b.getAttribute('aria-disabled') === 'false')
  .map((b) => b.getAttribute('data-label'))
  .sort();

test('game: the pad is an SVG with four buttons that follow the player cell by cell', async () => {
  const g = await squareGame(8);
  const svg = g.document.getElementById('directionPad');
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.closest('#footerControls') !== null, true);
  const ids = () => g.state.pad.buttons.map((b) => b.id);
  assert.deepEqual(ids(), ['upButton', 'rightButton', 'downButton', 'leftButton']);
  const buttons = g.state.pad.buttons;
  for (let k = 0; k < 20; k++) {
    const cell = g.state.player.cell;
    assert.deepEqual(enabled(g), neighbours(g.state.maze, 8, cell).map(([d]) => d).sort(), `cell ${cell}`);
    const [dir] = neighbours(g.state.maze, 8, cell)[k % neighbours(g.state.maze, 8, cell).length];
    g.click(`${dir.toLowerCase()}Button`);
    const trail = g.settle();
    assert.deepEqual(trail.slice(1), corridorRun(g.state.maze, 8, cell, dir, 63));
  }
  // The same four buttons all along.
  assert.deepEqual(g.state.pad.buttons, buttons);
});

test('game: a walled direction on the pad cannot be chosen', async () => {
  const g = await squareGame(8);
  const open = neighbours(g.state.maze, 8, 0).map(([d]) => d);
  for (const dir of ['UP', 'RIGHT', 'DOWN', 'LEFT'].filter((d) => !open.includes(d))) {
    assert.equal(g.document.getElementById(`${dir.toLowerCase()}Button`).getAttribute('aria-disabled'), 'true');
    g.click(`${dir.toLowerCase()}Button`);
    assert.equal(g.pendingFrames, 0, dir);
    assert.deepEqual(g.settle(), [0], dir);
  }
});

test('game: Enter on a focused pad button moves like a tap, through the corridor engine', async () => {
  const g = await squareGame(8);
  const [[dir]] = neighbours(g.state.maze, 8, 0);
  const button = g.document.getElementById(`${dir.toLowerCase()}Button`);
  button.dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.deepEqual(g.settle().slice(1), corridorRun(g.state.maze, 8, 0, dir, 63));
});

test('game: the pad shows the new maze after Restart, New maze and Generate', async () => {
  const g = await squareGame(6);
  for (const action of [() => g.click('NewMazeButton'), () => g.click('ResetButton'), () => g.generateFromSettings(9)]) {
    const [[dir]] = neighbours(g.state.maze, g.state.height, 0);
    g.key(ARROWS[dir]);
    action();
    assert.equal(g.state.player.cell, 0);
    assert.deepEqual(enabled(g), neighbours(g.state.maze, g.state.height, 0).map(([d]) => d).sort());
  }
});

test('game: touching, dragging or clicking the maze never moves the player', async () => {
  const g = await squareGame(8);
  const { window, document } = g;
  const canvas = document.getElementById('ctx');
  const targets = [canvas, document.getElementById('canvasHolder'), document.getElementById('gameDiv')];
  const event = (type, x, y) => {
    const init = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    if (type.startsWith('pointer')) return new (window.PointerEvent ?? window.MouseEvent)(type, { ...init, pointerType: 'touch' });
    if (type.startsWith('mouse') || type === 'click') return new window.MouseEvent(type, init);
    return new window.Event(type, init);
  };
  for (const target of targets) {
    // A tap, then a drag in each direction.
    for (const [dx, dy] of [[0, 0], [0, -200], [200, 0], [0, 200], [-200, 0]]) {
      for (const [type, x, y] of [
        ['pointerdown', 100, 100], ['touchstart', 100, 100], ['mousedown', 100, 100],
        ['pointermove', 100 + dx, 100 + dy], ['touchmove', 100 + dx, 100 + dy], ['mousemove', 100 + dx, 100 + dy],
        ['pointerup', 100 + dx, 100 + dy], ['touchend', 100 + dx, 100 + dy], ['mouseup', 100 + dx, 100 + dy],
        ['click', 100 + dx, 100 + dy], ['wheel', 100, 100],
      ]) target.dispatchEvent(event(type, x, y));
      assert.equal(g.pendingFrames, 0);
      assert.equal(g.state.player.cell, 0);
    }
  }
  // The pad and keys still work afterwards.
  const [[dir, cell]] = neighbours(g.state.maze, 8, 0);
  assert.equal(g.key(ARROWS[dir])[1], cell);
});

test('game: the pad fits a small phone screen', async () => {
  const g = await loadGame({ seed: 2, innerWidth: 320, innerHeight: 568 });
  const svg = g.document.getElementById('directionPad');
  assert.equal(svg.getAttribute('viewBox'), '-100 -100 200 200');
  assert.equal(g.state.pad.buttons.length, 4);
  assertFits(g.state.pad, 'phone');
  // The canvas and the footer share the screen without overlapping.
  assert.ok(parseFloat(g.state.canvas.style.height) <= 568 * 0.625);
});
