// Triangular mazes in the game (CAL-1241 / MM-V1-12): choosing the shape,
// generation, drawing, orientation-aware keys and pad, corridor runs and the
// viewport. Cells are checked against the triangles' geometry, not the
// topology's labels: two triangles are neighbours when they share a whole
// side (two corners), and triangles that only touch at a corner never are.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triangleTopology, growingTree, seededRandom, shortestPath, corridor, isPerfect, Maze } from '../src/javascripts/maze/index.js';
import { geometryFor } from '../src/javascripts/render/index.js';
import { directionsAt, pickDirection, keyCommand, angleBetween, TRIANGLE_FRAMES } from '../src/javascripts/input/index.js';
import { loadGame } from './harness.js';

const SQRT3 = Math.sqrt(3);
// Distance between the centres of two triangles with unit sides that share a side.
const ACROSS = 1 / SQRT3;
// The way each side faces, in screen angles (y down), for each orientation.
const FACING = {
  up: { LEFT: -150, RIGHT: -30, DOWN: 90 },
  down: { LEFT: 150, RIGHT: 30, UP: -90 },
};
// Keys for each side; each key takes one side only.
const KEYS = {
  LEFT: ['ArrowLeft', 'a', 'A'],
  RIGHT: ['ArrowRight', 'd', 'D'],
  UP: ['ArrowUp', 'w', 'W'],
  DOWN: ['ArrowDown', 's', 'S'],
};
const ALL_KEYS = Object.values(KEYS).flat();

const rad = (degrees) => (degrees * Math.PI) / 180;
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
// Corners are compared exactly: shared corners must be the same numbers.
const same = (p, q) => p.x === q.x && p.y === q.y;
const sharedCorners = (geometry, a, b) => geometry.outline(a).filter((p) => geometry.outline(b).some((q) => same(p, q))).length;
// Up when the apex is above the base, read from the outline.
const pointsUp = (geometry, cell) => {
  const ys = geometry.outline(cell).map((p) => p.y);
  return ys.filter((y) => y === Math.min(...ys)).length === 1;
};

async function triangleGame(size, { seed = size, autoNew = false } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.generateFromSettings(size, 'triangle');
  return g;
}

// Presses `key` with the player put on `cell`, lets the run finish, and
// returns the cells passed through after `cell`.
function pressFrom(g, cell, key) {
  g.state.player.cell = cell;
  return g.key(key).slice(1);
}

// Generation and topology

test('generate: a triangle maze of every size from 2 to 50 is perfect and solvable, n rows of 2n triangles', async () => {
  const g = await loadGame({ seed: 7 });
  g.document.getElementById('autonew').checked = false;
  for (let n = 2; n <= 50; n++) {
    g.generateFromSettings(n, 'triangle');
    const { maze, topology, geometry, exitCell } = g.state;
    assert.equal(g.state.shape, 'triangle');
    assert.equal(topology.kind, 'triangle');
    assert.equal(geometry.kind, 'triangle');
    assert.deepEqual([topology.cols, topology.rows], [2 * n, n], `size ${n}`);
    assert.equal(topology.size, 2 * n * n);
    assert.deepEqual([g.state.width, g.state.height], [n, n]);
    assert.deepEqual(maze.consistencyErrors(), [], `size ${n}`);
    assert.ok(isPerfect(maze), `size ${n} is a spanning tree`);
    const path = shortestPath(maze, 0, exitCell);
    assert.ok(path !== null && path[0] === 0 && path.at(-1) === exitCell, `size ${n} is solvable`);
    // Every passage crosses a whole side.
    for (const [a, b] of maze.passages()) {
      assert.equal(sharedCorners(geometry, a, b), 2, `size ${n}: ${a}-${b}`);
    }
    // Start at the top left, exit at the bottom right.
    assert.equal(g.state.player.cell, 0);
    assert.equal(exitCell, topology.size - 1);
    assert.deepEqual(topology.coordsOf(0), { column: 0, row: 0 });
    assert.deepEqual(topology.coordsOf(exitCell), { column: 2 * n - 1, row: n - 1 });
  }
});

test('topology: triangles alternate up and down, and neighbour exactly the triangles they share a side with', () => {
  for (const [cols, rows] of [[1, 1], [2, 1], [1, 3], [6, 5], [9, 4], [14, 7]]) {
    const t = triangleTopology(cols, rows);
    const geometry = geometryFor(t);
    for (const cell of t.cells()) {
      const { column, row } = t.coordsOf(cell);
      const up = (column + row) % 2 === 0;
      assert.equal(pointsUp(geometry, cell), up, `${cols}x${rows} cell ${cell} orientation`);
      assert.equal(t.pointsUp(cell), up);
      const outline = geometry.outline(cell);
      assert.equal(outline.length, 3);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(distance(outline[k], outline[(k + 1) % 3]) - 1) < 1e-9, 'unit sides');
      assert.ok(t.links(cell).length <= 3);
      assert.deepEqual(t.links(cell).map((n) => n.label).sort(), Object.keys(FACING[up ? 'up' : 'down'])
        .filter((label) => t.neighbourByLabel(cell, label) !== null).sort());
      for (let other = 0; other < t.size; other++) {
        if (other === cell) continue;
        const shared = sharedCorners(geometry, cell, other);
        // Sharing a side: neighbours, centres 1/√3 apart, facing the side's way.
        // Sharing a corner only: never neighbours.
        assert.equal(t.areNeighbours(cell, other), shared === 2, `${cols}x${rows}: ${cell}/${other} share ${shared}`);
        if (shared === 2) {
          assert.ok(Math.abs(distance(geometry.centre(cell), geometry.centre(other)) - ACROSS) < 1e-9);
          const label = t.links(cell).find((n) => n.cell === other).label;
          const c = geometry.centre(cell);
          const o = geometry.centre(other);
          assert.ok(angleBetween(Math.atan2(o.y - c.y, o.x - c.x), rad(FACING[up ? 'up' : 'down'][label])) < 1e-9);
        }
      }
    }
  }
});

test('shape: New maze, Restart, Auto-increment and reopening the settings keep triangles until another shape is chosen', async () => {
  const g = await triangleGame(4, { autoNew: true });
  const first = g.state.maze;
  g.click('NewMazeButton');
  assert.notEqual(g.state.maze, first);
  assert.equal(g.state.topology.kind, 'triangle');
  g.click('ResetButton');
  assert.equal(g.state.topology.kind, 'triangle');
  // Win with Auto-new and Auto-increment: the next maze is triangles, one larger.
  const path = shortestPath(g.state.maze, 0, g.state.exitCell);
  g.state.player.cell = path.at(-2);
  const last = g.state.maze.topology.links(path.at(-2)).find((n) => n.cell === path.at(-1)).label;
  g.key(KEYS[last][0]);
  assert.equal(g.state.width, 5);
  assert.equal(g.state.topology.kind, 'triangle');
  assert.equal(g.state.topology.size, 50);
  g.click('OptionsButton');
  assert.equal(g.document.getElementById('mazeShape').value, 'triangle');
  assert.equal(g.document.getElementById('display001').value, '5');
  g.click('OptionsButton');
  g.generateFromSettings(6, 'hex');
  assert.equal(g.state.topology.kind, 'hex');
  g.generateFromSettings(6, 'triangle');
  assert.equal(g.state.topology.kind, 'triangle');
  g.generateFromSettings(6, 'square');
  assert.equal(g.state.topology.kind, 'square');
});

test('StartMaze: a fractional or oversized triangle maze is refused and the current maze stays', async () => {
  const g = await triangleGame(4);
  const maze = g.state.maze;
  // 1.5 units would be a whole 3 triangles across; it must still be refused.
  for (const [cols, rows] of [[1.5, 2], [2, 0], [400, 400]]) {
    assert.throws(() => g.generate(cols, rows, 'triangle'), { name: 'RangeError' }, `${cols}x${rows}`);
    assert.equal(g.state.maze, maze);
  }
  // Two triangles per unit count against the cell limit.
  assert.throws(() => g.generate(354, 354, 'triangle'), { name: 'RangeError' });
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

const sameSegment = ([a, b], [c, d]) => (same(a, c) && same(b, d)) || (same(a, d) && same(b, c));

test('render: triangle walls are drawn once each, open passages are not, and the outline is closed without gaps', async () => {
  for (const n of [2, 5, 11, 50]) {
    const g = await triangleGame(n);
    const { maze, topology, geometry } = g.state;
    g.drawCalls.length = 0;
    g.click('ResetButton');
    const drawn = drawnWalls(g.drawCalls);
    const expected = [];
    for (const cell of topology.cells()) {
      for (const { neighbour, points } of geometry.walls(cell)) {
        if (neighbour === null || (neighbour > cell && !maze.isLinked(cell, neighbour))) expected.push(points);
        if (neighbour === null) continue;
        // Both cells give the very same corners for a shared side.
        const back = geometry.walls(neighbour).find((w) => w.neighbour === cell);
        assert.ok(sameSegment(points, back.points), `size ${n}: side ${cell}-${neighbour} differs between its cells`);
        if (maze.isLinked(cell, neighbour)) {
          assert.ok(!drawn.some((s) => sameSegment(s, points)), `size ${n}: passage ${cell}-${neighbour} drawn as a wall`);
        }
      }
    }
    assert.equal(drawn.length, expected.length, `size ${n}: one stroke per wall`);
    for (const side of expected) assert.ok(drawn.some((s) => sameSegment(s, side)), `size ${n}: a wall is missing`);
    // The outer edge is one closed loop: every corner on it ends exactly two
    // boundary sides, and there is one side per row at each end and one per
    // unit along the top and bottom.
    const boundary = topology.cells().flatMap((c) => geometry.walls(c).filter((w) => w.neighbour === null).map((w) => w.points));
    for (const side of boundary) assert.ok(drawn.some((s) => sameSegment(s, side)), `size ${n}: boundary gap`);
    const ends = new Map();
    for (const p of boundary.flat()) ends.set(`${p.x},${p.y}`, (ends.get(`${p.x},${p.y}`) ?? 0) + 1);
    for (const [corner, count] of ends) assert.equal(count, 2, `size ${n}: boundary corner ${corner}`);
    assert.equal(boundary.length, 2 * n + 2 * n);
  }
});

test('render: the player and exit markers are half-size triangles pointing the way their cells do', async () => {
  for (const n of [3, 4]) {
    const g = await triangleGame(n);
    const { geometry, exitCell } = g.state;
    g.drawCalls.length = 0;
    g.click('ResetButton');
    const calls = g.drawCalls;
    const fills = [];
    let points = [];
    for (const [name, x, y] of calls.slice(calls.findIndex(([m]) => m === 'stroke') + 1)) {
      if (name === 'beginPath') points = [];
      if (name === 'moveTo' || name === 'lineTo') points.push({ x, y });
      if (name === 'fill') fills.push(points);
    }
    assert.equal(fills.length, 2);
    for (const [cell, marker] of [[exitCell, fills[0]], [0, fills[1]]]) {
      assert.equal(marker.length, 3);
      const c = geometry.centre(cell);
      geometry.outline(cell).forEach((corner, k) => {
        assert.ok(distance(marker[k], { x: (c.x + corner.x) / 2, y: (c.y + corner.y) / 2 }) < 1e-9, `size ${n} cell ${cell}`);
      });
    }
  }
});

// Keys

test('keys: on triangles each key takes only the side it names, and nothing when it is walled or missing', () => {
  const t = triangleTopology(12, 6);
  const maze = growingTree(t, { random: seededRandom(3) }).maze;
  const geometry = geometryFor(t);
  for (const cell of t.cells()) {
    const dirs = directionsAt(maze, geometry, cell);
    // All three sides, in a fixed order for each orientation; a side on the
    // outer edge is closed.
    const frame = TRIANGLE_FRAMES[t.pointsUp(cell) ? 'up' : 'down'];
    assert.deepEqual(dirs.map((d) => d.label), frame.map(([label]) => label), `cell ${cell} directions`);
    dirs.forEach((d, k) => {
      assert.ok(angleBetween(d.angle, frame[k][1]) < 1e-9, `cell ${cell} ${d.label} angle`);
      assert.equal(d.cell, t.neighbourByLabel(cell, d.label));
      if (d.cell === null) assert.equal(d.open, false);
    });
    for (const [label, keys] of Object.entries(KEYS)) {
      const neighbour = t.neighbourByLabel(cell, label);
      const open = neighbour !== null && maze.isLinked(cell, neighbour);
      for (const key of keys) {
        const { angle, tolerance } = keyCommand(key, 'triangle');
        assert.equal(pickDirection(dirs, angle, { tolerance }), open ? label : null, `cell ${cell} ${key}`);
      }
    }
  }
});

test('keys: Up on an up-pointing triangle and Down on a down-pointing one never slip onto a slanted side', () => {
  const t = triangleTopology(4, 2);
  // Cell 1 (row 0) points down and cell 5 (row 1) points up. Both have their
  // level side on the outer edge and both slanted sides open.
  const maze = Maze.fromPassages(t, [[0, 1], [1, 2], [4, 5], [5, 6], [0, 4]]);
  const geometry = geometryFor(t);
  assert.ok(!t.pointsUp(1) && t.pointsUp(5));
  for (const [cell, key] of [[5, 'ArrowUp'], [5, 'w'], [1, 'ArrowDown'], [1, 's']]) {
    const dirs = directionsAt(maze, geometry, cell);
    assert.ok(dirs.some((d) => d.open && d.label !== 'UP' && d.label !== 'DOWN'));
    const { angle, tolerance } = keyCommand(key, 'triangle');
    assert.equal(pickDirection(dirs, angle, { tolerance }), null, `cell ${cell} ${key}`);
  }
  // The level side and the slanted sides are each taken by their own key.
  const dirs = directionsAt(maze, geometry, 0);
  const pick = (key) => { const { angle, tolerance } = keyCommand(key, 'triangle'); return pickDirection(dirs, angle, { tolerance }); };
  assert.deepEqual(['ArrowRight', 'ArrowDown'].map(pick), ['RIGHT', 'DOWN']);
});

test('keys: hex extras do nothing on triangles; other keys are ignored', () => {
  for (const key of ['q', 'e', '7', '9', '1', '3', '8', '2', 'Home', 'PageUp', 'End', 'PageDown', 'x', 'Enter', ' ', '__proto__']) {
    assert.equal(keyCommand(key, 'triangle'), undefined, key);
  }
});

test('game: every key in every triangle runs the corridor through its own side, or does nothing', async () => {
  const g = await triangleGame(6);
  const { maze, topology, geometry, exitCell } = g.state;
  for (const cell of topology.cells()) {
    for (const [label, keys] of Object.entries(KEYS)) {
      const next = topology.neighbourByLabel(cell, label);
      const open = next !== null && maze.isLinked(cell, next);
      const expected = open ? corridor(maze, cell, next, { stopAt: exitCell }) : [];
      const key = keys[cell % keys.length];
      const trail = pressFrom(g, cell, key);
      assert.deepEqual(trail, expected, `cell ${cell} ${key}`);
      // Each step crosses an open passage through a whole side, never a corner.
      [cell, ...trail].slice(1).forEach((c, k) => {
        const from = [cell, ...trail][k];
        assert.ok(maze.isLinked(from, c), `cell ${cell} ${key} crosses a wall`);
        assert.equal(sharedCorners(geometry, from, c), 2, `cell ${cell} ${key} moves through a corner`);
      });
    }
  }
});

test('game: runs follow forced turns and stop at junctions, dead ends and the exit', async () => {
  const g = await triangleGame(10);
  const { maze, topology, geometry, exitCell } = g.state;
  const degree = (c) => maze.traversableNeighbours(c).length;
  let turns = 0;
  let junctions = 0;
  for (const cell of topology.cells()) {
    for (const { label } of maze.traversableLinks(cell)) {
      const keys = KEYS[label];
      const trail = pressFrom(g, cell, keys[0]);
      const path = [cell, ...trail];
      // Every cell passed through has a single way on, and the run changes
      // heading there (a forced turn: triangles have no straight-through cells).
      for (let k = 1; k < path.length - 1; k++) {
        assert.equal(degree(path[k]), 2, `cell ${cell} ${label}: passed a junction at ${path[k]}`);
        const [a, b, c] = [path[k - 1], path[k], path[k + 1]].map((x) => geometry.centre(x));
        assert.ok(angleBetween(Math.atan2(b.y - a.y, b.x - a.x), Math.atan2(c.y - b.y, c.x - b.x)) > rad(59));
        turns++;
      }
      const end = trail.at(-1);
      assert.ok(end === exitCell || end === cell || degree(end) !== 2, `cell ${cell} ${label}: stopped at ${end} in a corridor`);
      if (degree(end) === 3 && end !== exitCell) junctions++;
    }
  }
  assert.ok(turns > 0, 'some runs take forced turns');
  assert.ok(junctions > 0, 'some runs stop at junctions');
});

test('game: following the solver route with keys reaches the exit and completes the maze', async () => {
  const g = await triangleGame(14);
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

test('game: Search shows the solver route on a triangle maze and follows the player', async () => {
  const g = await triangleGame(9);
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

test('pad: three buttons on the sides of the player\'s triangle, flipping with it, offering only open sides', async () => {
  const g = await triangleGame(8);
  const { maze, topology, exitCell } = g.state;
  let flips = 0;
  let orientation = null;
  for (let k = 0; k < 40; k++) {
    const cell = g.state.player.cell;
    const up = topology.pointsUp(cell);
    if (orientation !== null && orientation !== up) flips++;
    orientation = up;
    const buttons = g.state.pad.buttons;
    const facing = FACING[up ? 'up' : 'down'];
    // One button per side, including sides on the outer edge, which are closed.
    assert.deepEqual(buttons.map((b) => b.getAttribute('data-label')), Object.keys(facing));
    for (const b of buttons) {
      const label = b.getAttribute('data-label');
      assert.equal(b.id, `${label.toLowerCase()}Button`);
      const c = b.querySelector('circle');
      const angle = Math.atan2(Number(c.getAttribute('cy')), Number(c.getAttribute('cx')));
      assert.ok(angleBetween(angle, rad(facing[label])) < 0.01, `cell ${cell}: ${b.id} sits on its side`);
    }
    const links = maze.traversableLinks(cell);
    assert.deepEqual(enabled(g), links.map((n) => n.label).sort(), `cell ${cell}`);
    for (const b of buttons.filter((b) => !links.some((n) => n.label === b.getAttribute('data-label')))) {
      g.click(b.id);
      assert.equal(g.pendingFrames, 0, `cell ${cell} ${b.id} is walled`);
    }
    // Take a run that ends on the other orientation when there is one, so the
    // pad has to flip.
    const ends = (n) => corridor(maze, cell, n.cell, { stopAt: exitCell }).at(-1);
    const { label, cell: next } = links.find((n) => topology.pointsUp(ends(n)) !== up) ?? links[k % links.length];
    g.click(`${label.toLowerCase()}Button`);
    assert.deepEqual(g.settle().slice(1), corridor(maze, cell, next, { stopAt: exitCell }));
    if (g.state.player.cell === exitCell) break;
  }
  assert.ok(flips > 0, 'the pad followed the player onto both orientations');
});

test('pad: the three triangle buttons fit a small phone and stay thumb-sized', async () => {
  const g = await loadGame({ seed: 2, innerWidth: 320, innerHeight: 568 });
  g.generateFromSettings(5, 'triangle');
  const circles = g.state.pad.buttons.map((b) => {
    const c = b.querySelector('circle');
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) };
  });
  assert.equal(circles.length, 3);
  const pxPerUnit = Math.min(320, 568 * 0.3, 300) / 200;
  for (const [i, c] of circles.entries()) {
    assert.ok(Math.abs(c.x) + c.r <= 100 && Math.abs(c.y) + c.r <= 100, `button ${i} inside the pad`);
    assert.ok(2 * c.r * pxPerUnit >= 44, `button ${i} is at least 44 px across`);
    for (const d of circles.slice(i + 1)) assert.ok(Math.hypot(c.x - d.x, c.y - d.y) >= c.r + d.r, 'buttons overlap');
  }
});

// Animation and viewport

test('animation: a triangle step turns the marker from one cell into the next, one step per passage', async () => {
  const g = await triangleGame(9);
  const { maze, geometry, exitCell } = g.state;
  const [{ label, cell: next }] = maze.traversableLinks(0);
  const run = corridor(maze, 0, next, { stopAt: exitCell });
  g.press(KEYS[label][0]);
  g.tick(1);
  g.drawCalls.length = 0;
  g.tick(g.state.stepMs / 2);
  const marker = g.state.player.marker;
  assert.deepEqual([marker.from, marker.to], [0, next]);
  const calls = g.drawCalls;
  const fill = calls.findLastIndex(([n]) => n === 'fill');
  let start = fill;
  while (calls[start][0] !== 'beginPath') start--;
  const points = calls.slice(start + 1, fill).filter(([n]) => n === 'moveTo' || n === 'lineTo').map(([, x, y]) => ({ x, y }));
  assert.equal(points.length, 3);
  const mid = { x: points.reduce((s, p) => s + p.x, 0) / 3, y: points.reduce((s, p) => s + p.y, 0) / 3 };
  const a = geometry.centre(0);
  const b = geometry.centre(next);
  assert.ok(distance(mid, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) < 1e-9);
  // Input is ignored mid-run, and the run ends where the corridor engine says.
  g.press('ArrowLeft');
  assert.deepEqual(g.settle(), [0, ...run]);
  assert.equal(g.state.player.cell, run.at(-1));
});

test('viewport: the whole triangle maze is fitted inside the canvas, centred, and maps back to its cells', async () => {
  const g = await triangleGame(15);
  const { topology, geometry, renderer, canvas } = g.state;
  const side = parseFloat(canvas.style.width);
  const view = renderer.viewport;
  const corners = topology.cells().flatMap((c) => geometry.outline(c)).map((p) => view.toScreen(p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= side && Math.min(...ys) >= 0 && Math.max(...ys) <= side);
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - side / 2) < 1e-6);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - side / 2) < 1e-6);
  // Wider than tall, so it touches the margin left and right.
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - (side - 2 * renderer.lineWidth)) < 1e-6);
  for (const cell of topology.cells()) {
    const back = view.toWorld(view.toScreen(geometry.centre(cell)));
    assert.ok(distance(back, geometry.centre(cell)) < 1e-9);
  }
});

test('viewport: resizing the window or hiding the pad keeps the triangle maze, the player and the route', async () => {
  const g = await triangleGame(7);
  const [first] = g.state.maze.traversableLinks(0);
  g.key(KEYS[first.label][0]);
  g.click('SearchButton');
  const { maze, route } = g.state;
  const cell = g.state.player.cell;
  g.resize(500, 900, 2);
  g.click('ControllerButton');
  assert.equal(g.state.maze, maze);
  assert.equal(g.state.topology.kind, 'triangle');
  assert.equal(g.state.player.cell, cell);
  assert.deepEqual(g.state.route, route);
  assert.equal(g.state.renderer.viewport.dpr, 2);
});
