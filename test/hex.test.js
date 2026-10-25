// Hexagonal mazes in the game (CAL-1240 / MM-V1-11): choosing the shape,
// generation, drawing, six-way keys and pad, animated runs and the viewport.
// Cells are checked against the hexagons' geometry, not the topology's labels:
// two hexagons with unit sides are neighbours when their centres are √3 apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexTopology, growingTree, seededRandom, shortestPath, corridor, isPerfect } from '../src/javascripts/maze/index.js';
import { geometryFor } from '../src/javascripts/render/index.js';
import { directionsAt, pickDirection, keyCommand, angleBetween, HEX_KEYS } from '../src/javascripts/input/index.js';
import { loadGame } from './harness.js';

const SQRT3 = Math.sqrt(3);
const LABELS = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];
// The way each side faces, in screen angles (y down).
const FACING = { N: -90, NE: -30, SE: 30, S: 90, SW: 150, NW: -150 };
// One key of each kind per side.
const KEYS = {
  N: ['w', 'W', 'ArrowUp', '8'],
  NE: ['e', 'E', '9', 'PageUp'],
  SE: ['d', 'D', '3', 'PageDown'],
  S: ['s', 'S', 'ArrowDown', '2'],
  SW: ['a', 'A', '1', 'End'],
  NW: ['q', 'Q', '7', 'Home'],
};

const rad = (degrees) => (degrees * Math.PI) / 180;
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

// The cell whose centre is √3 away facing `label`, found from the geometry.
function across(geometry, size, cell, label) {
  const from = geometry.centre(cell);
  const want = { x: from.x + SQRT3 * Math.cos(rad(FACING[label])), y: from.y + SQRT3 * Math.sin(rad(FACING[label])) };
  for (let other = 0; other < size; other++) if (distance(geometry.centre(other), want) < 1e-9) return other;
  return null;
}

async function hexGame(size, { seed = size, autoNew = false } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.generateFromSettings(size, 'hex');
  return g;
}

// Presses `key` with the player put on `cell`, lets the run finish, and
// returns the cells passed through after `cell`.
function pressFrom(g, cell, key) {
  g.state.player.cell = cell;
  return g.key(key).slice(1);
}

// Generation

test('settings: the shape list offers Square, Hexagon, Triangle and Circle, and starts on Square', async () => {
  const g = await loadGame();
  const select = g.document.getElementById('mazeShape');
  assert.deepEqual([...select.options].map((o) => [o.value, o.textContent]), [['square', 'Square'], ['hex', 'Hexagon'], ['triangle', 'Triangle'], ['polar', 'Circle']]);
  assert.equal(g.document.querySelector('label[for="mazeShape"]').textContent, 'Shape:');
  assert.equal(g.state.shape, 'square');
  assert.equal(g.state.topology.kind, 'square');
});

test('generate: a hex maze of every size from 2 to 50 is perfect, with the start top-left and the exit bottom-right', async () => {
  const g = await loadGame({ seed: 4 });
  g.document.getElementById('autonew').checked = false;
  for (let n = 2; n <= 50; n++) {
    g.generateFromSettings(n, 'hex');
    const { maze, topology, geometry, exitCell } = g.state;
    assert.equal(topology.kind, 'hex');
    assert.equal(geometry.kind, 'hex');
    assert.equal(topology.size, n * n, `size ${n}`);
    assert.deepEqual([g.state.width, g.state.height], [n, n]);
    assert.deepEqual(maze.consistencyErrors(), [], `size ${n}`);
    assert.ok(isPerfect(maze), `size ${n} is a spanning tree`);
    // Every passage joins two hexagons that share a side.
    for (const [a, b] of maze.passages()) {
      assert.ok(Math.abs(distance(geometry.centre(a), geometry.centre(b)) - SQRT3) < 1e-9, `size ${n}: ${a}-${b}`);
    }
    const centres = topology.cells().map((c) => geometry.centre(c));
    const minX = Math.min(...centres.map((p) => p.x));
    const maxX = Math.max(...centres.map((p) => p.x));
    assert.equal(g.state.player.cell, 0);
    assert.equal(centres[0].x, minX);
    assert.equal(centres[0].y, Math.min(...centres.filter((p) => p.x === minX).map((p) => p.y)));
    assert.equal(exitCell, n * n - 1);
    assert.equal(centres[exitCell].x, maxX);
    assert.equal(centres[exitCell].y, Math.max(...centres.filter((p) => p.x === maxX).map((p) => p.y)));
  }
});

test('topology: each hex cell neighbours exactly the hexagons it shares a side with', () => {
  for (const [cols, rows] of [[1, 1], [1, 4], [4, 1], [6, 5], [7, 7]]) {
    const t = hexTopology(cols, rows);
    const geometry = geometryFor(t);
    for (const cell of t.cells()) {
      for (const label of LABELS) {
        assert.equal(t.neighbourByLabel(cell, label), across(geometry, t.size, cell, label), `${cols}x${rows} cell ${cell} ${label}`);
      }
    }
  }
});

test('shape: New maze, Restart, Auto-increment and reopening the settings keep hex until Square is chosen', async () => {
  const g = await hexGame(5, { autoNew: true });
  assert.equal(g.state.topology.kind, 'hex');
  const first = g.state.maze;
  g.click('NewMazeButton');
  assert.notEqual(g.state.maze, first);
  assert.equal(g.state.topology.kind, 'hex');
  g.click('ResetButton');
  assert.equal(g.state.topology.kind, 'hex');
  // Win with Auto-new and Auto-increment: the next maze is hex, one larger.
  const path = shortestPath(g.state.maze, 0, g.state.exitCell);
  g.state.player.cell = path.at(-2);
  const last = g.state.maze.topology.links(path.at(-2)).find((n) => n.cell === path.at(-1)).label;
  g.key(KEYS[last][0]);
  assert.equal(g.state.width, 6);
  assert.equal(g.state.topology.kind, 'hex');
  assert.equal(g.state.topology.size, 36);
  g.click('OptionsButton');
  assert.equal(g.document.getElementById('mazeShape').value, 'hex');
  // A shape picked but not generated is discarded when the panel closes.
  g.document.getElementById('mazeShape').value = 'square';
  g.click('OptionsButton');
  g.click('OptionsButton');
  assert.equal(g.document.getElementById('mazeShape').value, 'hex');
  g.generateFromSettings(7, 'square');
  assert.equal(g.state.topology.kind, 'square');
  assert.equal(g.state.shape, 'square');
});

test('shape: an invalid size keeps the hex maze in play and the shape unchanged', async () => {
  const g = await hexGame(6);
  const maze = g.state.maze;
  g.generateFromSettings('1', 'square');
  assert.equal(g.state.maze, maze);
  assert.equal(g.state.shape, 'hex');
  assert.notEqual(g.document.getElementById('sizeError').style.display, 'none');
});

test('StartMaze: an unknown shape is refused and the current maze stays', async () => {
  const g = await hexGame(4);
  const maze = g.state.maze;
  // main.js runs in jsdom's realm, so its RangeError is matched by name.
  assert.throws(() => g.generate(4, 4, 'octagon'), { name: 'RangeError' });
  assert.equal(g.state.maze, maze);
});

// Drawing

// The wall segments drawn in the last frame, as [from, to] in world units.
function drawnWalls(calls) {
  const end = calls.findIndex(([name]) => name === 'stroke');
  let start = end;
  while (calls[start][0] !== 'beginPath') start--;
  const segments = [];
  let at = null;
  for (const [name, x, y] of calls.slice(start + 1, end)) {
    if (name === 'lineTo') segments.push([at, { x, y }]);
    at = { x, y };
  }
  return segments;
}

const sameSegment = ([a, b], [c, d]) =>
  (distance(a, c) < 1e-9 && distance(b, d) < 1e-9) || (distance(a, d) < 1e-9 && distance(b, c) < 1e-9);

test('render: hex walls are drawn once each, open passages are not drawn, and the outer boundary is closed', async () => {
  for (const n of [2, 5, 9]) {
    const g = await hexGame(n);
    const { maze, topology, geometry } = g.state;
    g.drawCalls.length = 0;
    g.click('ResetButton');
    const drawn = drawnWalls(g.drawCalls);
    const expected = [];
    for (const cell of topology.cells()) {
      const walls = geometry.walls(cell);
      assert.equal(walls.length, 6, `cell ${cell} is a hexagon`);
      for (const { neighbour, points } of walls) {
        assert.ok(Math.abs(distance(points[0], points[1]) - 1) < 1e-9, 'unit sides');
        if (neighbour === null || (neighbour > cell && !maze.isLinked(cell, neighbour))) expected.push(points);
        if (neighbour !== null && maze.isLinked(cell, neighbour)) {
          assert.ok(!drawn.some((s) => sameSegment(s, points)), `size ${n}: passage ${cell}-${neighbour} drawn as a wall`);
        }
      }
    }
    assert.equal(drawn.length, expected.length, `size ${n}: one stroke per wall`);
    for (const side of expected) assert.ok(drawn.some((s) => sameSegment(s, side)), `size ${n}: a wall is missing`);
    // Every side on the outer edge is closed.
    const boundary = topology.cells().flatMap((c) => geometry.walls(c).filter((w) => w.neighbour === null));
    assert.ok(boundary.length > 0);
    for (const { points } of boundary) assert.ok(drawn.some((s) => sameSegment(s, points)), `size ${n}: boundary gap`);
  }
});

test('render: the player and exit markers are half-size hexagons in their cells', async () => {
  const g = await hexGame(5);
  const { geometry, exitCell } = g.state;
  g.drawCalls.length = 0;
  g.click('ResetButton');
  const calls = g.drawCalls;
  const fills = [];
  let points = [];
  for (const [name, x, y] of calls.slice(calls.findIndex(([n]) => n === 'stroke') + 1)) {
    if (name === 'beginPath') points = [];
    if (name === 'moveTo' || name === 'lineTo') points.push({ x, y });
    if (name === 'fill') fills.push(points);
  }
  assert.equal(fills.length, 2);
  for (const [cell, marker] of [[exitCell, fills[0]], [0, fills[1]]]) {
    assert.equal(marker.length, 6);
    const c = geometry.centre(cell);
    for (const p of marker) assert.ok(Math.abs(distance(p, c) - 0.5) < 1e-9, `cell ${cell} marker corner`);
  }
});

// Keys

test('keys: each six-way key takes exactly its own side of a hex cell, and nothing when it is walled', () => {
  const t = hexTopology(7, 6);
  const maze = growingTree(t, { random: seededRandom(5) }).maze;
  const geometry = geometryFor(t);
  for (const cell of t.cells()) {
    const dirs = directionsAt(maze, geometry, cell);
    for (const label of LABELS) {
      const neighbour = t.neighbourByLabel(cell, label);
      const open = neighbour !== null && maze.isLinked(cell, neighbour);
      for (const key of KEYS[label]) {
        const { angle, tolerance } = keyCommand(key, 'hex');
        assert.ok(angleBetween(angle, rad(FACING[label])) < 1e-9, key);
        assert.equal(pickDirection(dirs, angle, { tolerance }), open ? label : null, `cell ${cell} ${key}`);
      }
    }
  }
});

test('keys: on hex, Left and Right take NW/SW or NE/SE only when just one of the two is open', () => {
  const t = hexTopology(7, 6);
  const maze = growingTree(t, { random: seededRandom(6) }).maze;
  const geometry = geometryFor(t);
  let seen = 0;
  for (const cell of t.cells()) {
    const dirs = directionsAt(maze, geometry, cell);
    const open = (label) => dirs.find((d) => d.label === label).open;
    for (const [key, a, b] of [['ArrowLeft', 'NW', 'SW'], ['ArrowRight', 'NE', 'SE']]) {
      const { angle, tolerance } = keyCommand(key, 'hex');
      const expected = open(a) === open(b) ? null : open(a) ? a : b;
      assert.equal(pickDirection(dirs, angle, { tolerance }), expected, `cell ${cell} ${key}`);
      if (expected !== null) seen++;
    }
  }
  assert.ok(seen > 0);
});

test('keys: the six-way extras do nothing on a square grid; square keys are unchanged', () => {
  for (const key of ['q', 'e', '7', '9', '1', '3', '8', '2', 'Home', 'PageUp', 'End', 'PageDown']) {
    assert.equal(keyCommand(key, 'square'), undefined, key);
  }
  for (const [key, degrees] of [['ArrowUp', -90], ['d', 0], ['S', 90], ['a', 180]]) {
    assert.ok(angleBetween(keyCommand(key, 'square').angle, rad(degrees)) < 1e-9, key);
  }
  for (const key of ['x', 'Enter', ' ', 'constructor', '__proto__', '5']) assert.equal(keyCommand(key, 'hex'), undefined, key);
  assert.equal(Object.keys(HEX_KEYS).length, 20);
});

test('game: every key in every hex cell runs the corridor through its own side, or does nothing', async () => {
  const g = await hexGame(6);
  const { maze, topology, geometry, exitCell } = g.state;
  for (const cell of topology.cells()) {
    for (const label of LABELS) {
      const next = across(geometry, topology.size, cell, label);
      const open = next !== null && maze.isLinked(cell, next);
      const expected = open ? corridor(maze, cell, next, { stopAt: exitCell }) : [];
      const key = KEYS[label][cell % KEYS[label].length];
      const trail = pressFrom(g, cell, key);
      assert.deepEqual(trail, expected, `cell ${cell} ${key}`);
      // The player only ever crosses open passages.
      [cell, ...trail].slice(1).forEach((c, k) => assert.ok(maze.isLinked([cell, ...trail][k], c), `cell ${cell} ${key} crosses a wall`));
    }
  }
});

test('game: following the solver route with six-way keys reaches the exit and completes the maze', async () => {
  const g = await hexGame(12);
  const { maze, exitCell } = g.state;
  const route = shortestPath(maze, 0, exitCell);
  let presses = 0;
  while (g.state.player.cell !== exitCell) {
    const at = route.indexOf(g.state.player.cell);
    assert.ok(at >= 0, 'the player stays on the route');
    const { label } = maze.topology.links(route[at]).find((n) => n.cell === route[at + 1]);
    g.key(KEYS[label][0]);
    assert.ok(++presses <= route.length, 'every press makes progress');
  }
  assert.equal(g.state.completed, true);
  assert.equal(g.document.getElementById('completeBanner').style.display, '');
});

test('game: Search shows the solver route on a hex maze and follows the player', async () => {
  const g = await hexGame(10);
  g.click('SearchButton');
  const { maze, exitCell } = g.state;
  assert.deepEqual(g.state.route, shortestPath(maze, 0, exitCell));
  const [first] = maze.traversableLinks(0);
  g.key(KEYS[first.label][0]);
  assert.deepEqual(g.state.route, shortestPath(maze, g.state.player.cell, exitCell));
});

// Pad

const enabled = (g) => g.state.pad.buttons
  .filter((b) => b.getAttribute('aria-disabled') === 'false')
  .map((b) => b.getAttribute('data-label'))
  .sort();

test('pad: six buttons around the hexagon, in place as the player moves, offering only open sides', async () => {
  const g = await hexGame(8);
  const buttons = g.state.pad.buttons;
  assert.deepEqual(buttons.map((b) => b.id), ['nButton', 'neButton', 'seButton', 'sButton', 'swButton', 'nwButton']);
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')),
    ['Move north', 'Move north-east', 'Move south-east', 'Move south', 'Move south-west', 'Move north-west']);
  for (const b of buttons) {
    const c = b.querySelector('circle');
    const angle = Math.atan2(Number(c.getAttribute('cy')), Number(c.getAttribute('cx')));
    assert.ok(angleBetween(angle, rad(FACING[b.getAttribute('data-label')])) < 0.01, `${b.id} sits on its side`);
  }
  const { maze, exitCell } = g.state;
  for (let k = 0; k < 25; k++) {
    const cell = g.state.player.cell;
    const links = maze.traversableLinks(cell);
    assert.deepEqual(enabled(g), links.map((n) => n.label).sort(), `cell ${cell}`);
    // A walled side does nothing.
    for (const label of LABELS.filter((l) => !links.some((n) => n.label === l))) {
      g.click(`${label.toLowerCase()}Button`);
      assert.equal(g.pendingFrames, 0, `cell ${cell} ${label}`);
    }
    const { label, cell: next } = links[k % links.length];
    g.click(`${label.toLowerCase()}Button`);
    assert.deepEqual(g.settle().slice(1), corridor(maze, cell, next, { stopAt: exitCell }));
    if (g.state.player.cell === exitCell) break;
  }
  assert.deepEqual(g.state.pad.buttons, buttons);
});

test('pad: switching shape swaps four buttons for six and back', async () => {
  const g = await loadGame({ seed: 3 });
  assert.equal(g.state.pad.buttons.length, 4);
  g.generateFromSettings(5, 'hex');
  assert.equal(g.state.pad.buttons.length, 6);
  g.generateFromSettings(5, 'square');
  assert.deepEqual(g.state.pad.buttons.map((b) => b.id), ['upButton', 'rightButton', 'downButton', 'leftButton']);
});

test('pad: the six hex buttons fit a small phone and stay thumb-sized', async () => {
  const g = await loadGame({ seed: 2, innerWidth: 320, innerHeight: 568 });
  g.generateFromSettings(5, 'hex');
  const circles = g.state.pad.buttons.map((b) => {
    const c = b.querySelector('circle');
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) };
  });
  // The footer is 30% of the screen height; the pad's 200 units fill it.
  const pxPerUnit = Math.min(320, 568 * 0.3, 300) / 200;
  for (const [i, c] of circles.entries()) {
    assert.ok(Math.abs(c.x) + c.r <= 100 && Math.abs(c.y) + c.r <= 100, `button ${i} inside the pad`);
    assert.ok(2 * c.r * pxPerUnit >= 44, `button ${i} is at least 44 px across`);
    for (const d of circles.slice(i + 1)) assert.ok(Math.hypot(c.x - d.x, c.y - d.y) >= c.r + d.r, 'buttons overlap');
  }
});

// Animation and viewport

test('animation: a hex step morphs the marker from one cell to the next, one step per passage', async () => {
  const g = await hexGame(9);
  const { maze, geometry, exitCell } = g.state;
  const [{ label, cell: next }] = maze.traversableLinks(0);
  const run = corridor(maze, 0, next, { stopAt: exitCell });
  g.press(KEYS[label][0]);
  g.tick(1);
  g.drawCalls.length = 0;
  g.tick(g.state.stepMs / 2);
  const marker = g.state.player.marker;
  assert.deepEqual([marker.from, marker.to], [0, next]);
  assert.ok(Math.abs(marker.progress - 0.5) < 1e-9);
  // The last fill is the player: a hexagon centred halfway between the cells.
  const calls = g.drawCalls;
  const fill = calls.findLastIndex(([n]) => n === 'fill');
  let start = fill;
  while (calls[start][0] !== 'beginPath') start--;
  const points = calls.slice(start + 1, fill).filter(([n]) => n === 'moveTo' || n === 'lineTo').map(([, x, y]) => ({ x, y }));
  assert.equal(points.length, 6);
  const mid = { x: points.reduce((s, p) => s + p.x, 0) / 6, y: points.reduce((s, p) => s + p.y, 0) / 6 };
  const a = geometry.centre(0);
  const b = geometry.centre(next);
  assert.ok(distance(mid, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) < 1e-9);
  // Input is ignored mid-run, and the run ends where the corridor engine says.
  g.press('s');
  assert.deepEqual(g.settle(), [0, ...run]);
  assert.equal(g.state.player.cell, run.at(-1));
});

test('viewport: the whole hex maze is fitted inside the canvas, centred, and maps back to its cells', async () => {
  const g = await hexGame(15);
  const { topology, geometry, renderer, canvas } = g.state;
  const side = parseFloat(canvas.style.width);
  const view = renderer.viewport;
  const corners = topology.cells().flatMap((c) => geometry.outline(c)).map((p) => view.toScreen(p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= side && Math.min(...ys) >= 0 && Math.max(...ys) <= side);
  // Centred, and touching the margin on the longer side (hex mazes are taller than wide).
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - side / 2) < 1e-6);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - side / 2) < 1e-6);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - (side - 2 * renderer.lineWidth)) < 1e-6);
  for (const cell of topology.cells()) {
    const back = view.toWorld(view.toScreen(geometry.centre(cell)));
    assert.ok(distance(back, geometry.centre(cell)) < 1e-9);
  }
});

test('viewport: zoom and pan move the hex maze about the canvas centre, and the game keeps drawing through them', async () => {
  const g = await hexGame(8);
  const { renderer, geometry, canvas } = g.state;
  const side = parseFloat(canvas.style.width);
  const fit = renderer.viewport;
  renderer.setView({ zoom: 2, panX: 30, panY: -20 });
  g.drawCalls.length = 0;
  g.click('ResetButton');
  const view = renderer.viewport;
  assert.ok(Math.abs(view.scale - 2 * fit.scale) < 1e-9);
  const middle = { x: side / 2, y: side / 2 };
  const before = fit.toWorld(middle);
  const after = view.toScreen(before);
  assert.ok(distance(after, { x: side / 2 + 30, y: side / 2 - 20 }) < 1e-9);
  const dpr = view.dpr;
  assert.deepEqual(g.drawCalls.find(([n, ...args]) => n === 'setTransform' && args[0] !== 1).slice(1), view.matrix());
  assert.equal(view.matrix()[0], view.scale * dpr);
  // A point on screen maps to the hexagon drawn there.
  const cell = 10;
  const world = view.toWorld(view.toScreen(geometry.centre(cell)));
  assert.ok(distance(world, geometry.centre(cell)) < 1e-9);
  renderer.setView({ zoom: 1, panX: 0, panY: 0 });
});

test('viewport: resizing the window or hiding the pad keeps the hex maze, the player and the route', async () => {
  const g = await hexGame(7);
  const [first] = g.state.maze.traversableLinks(0);
  g.key(KEYS[first.label][0]);
  g.click('SearchButton');
  const { maze, route } = g.state;
  const cell = g.state.player.cell;
  g.resize(500, 900, 2);
  g.click('ControllerButton');
  assert.equal(g.state.maze, maze);
  assert.equal(g.state.topology.kind, 'hex');
  assert.equal(g.state.player.cell, cell);
  assert.deepEqual(g.state.route, route);
  assert.equal(g.state.renderer.viewport.dpr, 2);
  assert.equal(g.state.canvas.width, Math.floor(parseFloat(g.state.canvas.style.width) * 2));
});
