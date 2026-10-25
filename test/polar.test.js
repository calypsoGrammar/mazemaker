// Circular (polar) mazes in the game (CAL-1242 / MM-V1-13): choosing the
// shape, generation, ring transitions, drawing arcs and radial walls,
// ring-relative keys, distinct outward choices on the pad, corridor runs and
// the viewport under zoom. Cells are checked against the rings' geometry: a
// cell of ring r lies between radius r and r + 1, clockwise is the way screen
// angles grow (y points down), and outward passages are numbered clockwise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polarTopology, polarRingSizes, growingTree, seededRandom, shortestPath, corridor, isPerfect, Maze } from '../src/javascripts/maze/index.js';
import { geometryFor } from '../src/javascripts/render/index.js';
import { directionsAt, chooseDirection, keyCommand, angleBetween, directionName } from '../src/javascripts/input/index.js';
import { loadGame } from './harness.js';

const TAU = 2 * Math.PI;
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const radius = (p) => Math.hypot(p.x, p.y);
// Angle about the maze's centre, clockwise on screen from the positive x axis, in [0, 2π).
const turn = (p) => ((Math.atan2(p.y, p.x) % TAU) + TAU) % TAU;
// Points are compared exactly: shared corners must be the same numbers.
const same = (p, q) => p.x === q.x && p.y === q.y;
const samePolyline = (a, b) => a.length === b.length && (a.every((p, k) => same(p, b[k])) || a.every((p, k) => same(p, b[b.length - 1 - k])));
const isOutward = (label) => /^OUT\d+$/.test(label);

// Keys for each ring-relative direction. Outward passages also have a number
// key each; Up takes one only when no other outward passage is open.
const KEYS = { IN: ['ArrowDown', 's', 'S'], CW: ['ArrowRight', 'd', 'D'], CCW: ['ArrowLeft', 'a', 'A'] };
const UP_KEYS = ['ArrowUp', 'w', 'W'];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// A key that takes `label` from `cell`: its own key, or the outward
// passage's number.
const keyFor = (label) => (isOutward(label) ? String(Number(label.slice(3)) + 1) : KEYS[label][0]);

const choose = (dirs, key) => {
  const command = keyCommand(key, 'polar');
  return command === undefined ? undefined : chooseDirection(dirs, command);
};

async function polarGame(size, { seed = size, autoNew = false } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.generateFromSettings(size, 'polar');
  return g;
}

// Presses `key` with the player put on `cell`, lets the run finish, and
// returns the cells passed through after `cell`.
function pressFrom(g, cell, key) {
  g.state.player.cell = cell;
  return g.key(key).slice(1);
}

// Generation and topology

test('generate: a circle of every size from 2 to 50 is perfect and solvable, n rings from the centre to the outer edge', async () => {
  const g = await loadGame({ seed: 5 });
  g.document.getElementById('autonew').checked = false;
  for (let n = 2; n <= 50; n++) {
    g.generateFromSettings(n, 'polar');
    const { maze, topology, geometry, exitCell } = g.state;
    assert.equal(g.state.shape, 'polar');
    assert.equal(topology.kind, 'polar');
    assert.equal(geometry.kind, 'polar');
    assert.equal(topology.rings, n);
    assert.deepEqual(topology.ringSizes, polarRingSizes(n));
    assert.equal(topology.size, polarRingSizes(n).reduce((s, c) => s + c, 0));
    assert.deepEqual([g.state.width, g.state.height], [n, n]);
    assert.deepEqual(maze.consistencyErrors(), [], `size ${n}`);
    assert.ok(isPerfect(maze), `size ${n} is a spanning tree`);
    const path = shortestPath(maze, 0, exitCell);
    assert.ok(path !== null && path[0] === 0 && path.at(-1) === exitCell, `size ${n} is solvable`);
    // Start in the centre, exit on the outer ring.
    assert.equal(g.state.player.cell, 0);
    assert.deepEqual(topology.coordsOf(0), { ring: 0, index: 0 });
    assert.equal(topology.coordsOf(exitCell).ring, n - 1);
  }
});

test('topology: ring sizes change outward, and in, out, clockwise and anticlockwise lead where the rings say', () => {
  for (const rings of [1, 2, 3, 5, 9, 20]) {
    const t = polarTopology(rings);
    const geometry = geometryFor(t);
    const sizes = t.ringSizes;
    assert.equal(sizes[0], 1);
    for (let r = 1; r < rings; r++) {
      assert.ok(sizes[r] >= 6, `ring ${r} has room to go round`);
      assert.equal(sizes[r] % sizes[r - 1], 0, `ring ${r} splits ring ${r - 1} evenly`);
    }
    // Several neighbour counts occur, not just one.
    const counts = new Set(t.cells().map((c) => t.links(c).length));
    if (rings >= 5) assert.ok(counts.size >= 3, `${rings} rings: neighbour counts ${[...counts]}`);
    for (const cell of t.cells()) {
      const { ring, index } = t.coordsOf(cell);
      const c = geometry.centre(cell);
      const labels = t.links(cell).map((n) => n.label);
      assert.equal(labels.includes('IN'), ring > 0);
      assert.equal(labels.includes('CW'), ring > 0);
      assert.equal(labels.includes('CCW'), ring > 0);
      const outward = t.links(cell).filter((n) => isOutward(n.label));
      assert.equal(outward.length, ring < rings - 1 ? sizes[ring + 1] / sizes[ring] : 0, `cell ${cell} outward count`);
      if (ring > 0) {
        const step = TAU / sizes[ring];
        for (const [label, sign] of [['CW', 1], ['CCW', -1]]) {
          const n = t.neighbourByLabel(cell, label);
          assert.equal(t.coordsOf(n).ring, ring);
          assert.ok(angleBetween(turn(geometry.centre(n)), turn(c) + sign * step) < 1e-9, `cell ${cell} ${label}`);
        }
        const inner = t.neighbourByLabel(cell, 'IN');
        assert.equal(t.coordsOf(inner).ring, ring - 1);
        // The inner cell lists this one among its outward neighbours.
        assert.ok(t.links(inner).some((n) => isOutward(n.label) && n.cell === cell), `cell ${cell} is outward of ${inner}`);
        assert.equal(t.coordsOf(inner).index, Math.floor(index / (sizes[ring] / sizes[ring - 1])));
      }
      // Outward neighbours lie in the next ring, numbered clockwise, and each
      // has this cell as its IN.
      outward.forEach(({ label, cell: n }, k) => {
        assert.equal(label, `OUT${k}`);
        assert.equal(t.coordsOf(n).ring, ring + 1);
        assert.equal(t.neighbourByLabel(n, 'IN'), cell);
        if (k > 0) assert.ok(t.coordsOf(n).index === t.coordsOf(outward[k - 1].cell).index + 1);
      });
    }
  }
});

test('shape: New maze, Restart, Auto-increment and reopening the settings keep the circle until another shape is chosen', async () => {
  const g = await polarGame(4, { autoNew: true });
  const first = g.state.maze;
  g.click('NewMazeButton');
  assert.notEqual(g.state.maze, first);
  assert.equal(g.state.topology.kind, 'polar');
  g.click('ResetButton');
  assert.equal(g.state.topology.kind, 'polar');
  // Win with Auto-new and Auto-increment: the next maze is a circle, one ring larger.
  const path = shortestPath(g.state.maze, 0, g.state.exitCell);
  g.state.player.cell = path.at(-2);
  const last = g.state.maze.topology.links(path.at(-2)).find((n) => n.cell === path.at(-1)).label;
  g.key(keyFor(last));
  assert.equal(g.state.width, 5);
  assert.equal(g.state.topology.kind, 'polar');
  assert.equal(g.state.topology.rings, 5);
  g.click('OptionsButton');
  assert.equal(g.document.getElementById('mazeShape').value, 'polar');
  assert.equal(g.document.getElementById('display001').value, '5');
  g.click('OptionsButton');
  g.generateFromSettings(6, 'hex');
  assert.equal(g.state.topology.kind, 'hex');
  g.generateFromSettings(6, 'polar');
  assert.equal(g.state.topology.kind, 'polar');
});

test('StartMaze: a fractional, empty or oversized circle is refused and the current maze stays', async () => {
  const g = await polarGame(4);
  const maze = g.state.maze;
  for (const [cols, rows] of [[1.5, 1.5], [0, 0], [2, 0], [1e9, 1e9]]) {
    assert.throws(() => g.generate(cols, rows, 'polar'), { name: 'RangeError' }, `${cols}x${rows}`);
    assert.equal(g.state.maze, maze);
  }
  // Rings hold more cells further out, and they count against the limit.
  const rings = polarRingSizes(300).length;
  assert.ok(polarRingSizes(300).reduce((s, c) => s + c, 0) > 250000);
  assert.throws(() => g.generate(rings, rings, 'polar'), { name: 'RangeError' });
  assert.equal(g.state.maze, maze);
});

// Geometry and drawing

test('geometry: cells fill their rings, and every shared arc or radial side is exactly the same from both cells', () => {
  for (const rings of [1, 2, 4, 9, 30]) {
    const t = polarTopology(rings);
    const geometry = geometryFor(t);
    for (const cell of t.cells()) {
      const { ring } = t.coordsOf(cell);
      for (const p of geometry.outline(cell)) {
        assert.ok(radius(p) >= ring - 1e-9 && radius(p) <= ring + 1 + 1e-9, `cell ${cell} outline stays in ring ${ring}`);
      }
      const c = geometry.centre(cell);
      assert.ok(Math.abs(radius(c) - (ring === 0 ? 0 : ring + 0.5)) < 1e-9);
      const walls = geometry.walls(cell);
      // One side per neighbour, plus the outer edge on the last ring.
      const neighbours = walls.filter((w) => w.neighbour !== null).map((w) => w.neighbour).sort((a, b) => a - b);
      assert.deepEqual(neighbours, [...t.neighbours(cell)].sort((a, b) => a - b), `cell ${cell} sides`);
      assert.equal(walls.length - neighbours.length, ring === rings - 1 ? 1 : 0);
      for (const { neighbour, points } of walls) {
        if (neighbour === null) {
          assert.ok(points.every((p) => Math.abs(radius(p) - rings) < 1e-9), 'the outer edge is on the last radius');
          continue;
        }
        const back = geometry.walls(neighbour).find((w) => w.neighbour === cell);
        assert.ok(samePolyline(points, back.points), `rings ${rings}: side ${cell}-${neighbour} differs between its cells`);
      }
      // The outer side's pieces run clockwise end to end across the whole cell.
      const outwardCells = t.links(cell).filter((n) => isOutward(n.label)).map((n) => n.cell);
      const outer = walls.filter((w) => w.neighbour === null || outwardCells.includes(w.neighbour));
      assert.ok(outer.length > 0);
      for (const w of outer) assert.ok(w.points.every((p) => Math.abs(radius(p) - (ring + 1)) < 1e-9), `cell ${cell} outer side on radius ${ring + 1}`);
      for (let k = 1; k < outer.length; k++) assert.ok(same(outer[k - 1].points.at(-1), outer[k].points[0]), `cell ${cell} outer pieces join`);
      if (ring === 0) assert.ok(same(outer.at(-1).points.at(-1), outer[0].points[0]), 'the centre is closed all round');
      else {
        // From the outer end of the anticlockwise wall to that of the clockwise one.
        const ray = (label) => walls.find((w) => w.neighbour === t.neighbourByLabel(cell, label)).points;
        assert.ok(same(outer[0].points[0], ray('CCW')[1]), `cell ${cell} outer side starts at its anticlockwise wall`);
        assert.ok(same(outer.at(-1).points.at(-1), ray('CW')[1]), `cell ${cell} outer side ends at its clockwise wall`);
        assert.ok(same(ray('IN')[0], ray('CCW')[0]) && same(ray('IN').at(-1), ray('CW')[0]), `cell ${cell} inner side meets its walls`);
      }
    }
  }
});

// The polylines stroked in the last frame's wall pass, in world units.
function drawnWalls(calls) {
  const end = calls.findIndex(([name]) => name === 'stroke');
  let start = end;
  while (calls[start][0] !== 'beginPath') start--;
  const lines = [];
  for (const [name, x, y] of calls.slice(start + 1, end)) {
    if (name === 'moveTo') lines.push([{ x, y }]);
    if (name === 'lineTo') lines.at(-1).push({ x, y });
  }
  return lines;
}

test('render: arcs and radial walls are drawn once each, passages are not, and the outer edge is a closed circle', async () => {
  for (const n of [2, 5, 12, 50]) {
    const g = await polarGame(n);
    const { maze, topology, geometry } = g.state;
    g.drawCalls.length = 0;
    g.click('ResetButton');
    const drawn = drawnWalls(g.drawCalls);
    const expected = [];
    for (const cell of topology.cells()) {
      for (const { neighbour, points } of geometry.walls(cell)) {
        if (neighbour === null || (neighbour > cell && !maze.isLinked(cell, neighbour))) expected.push(points);
        else if (neighbour !== null && maze.isLinked(cell, neighbour)) {
          assert.ok(!drawn.some((line) => samePolyline(line, points)), `size ${n}: passage ${cell}-${neighbour} drawn as a wall`);
        }
      }
    }
    assert.equal(drawn.length, expected.length, `size ${n}: one stroke per wall`);
    for (const side of expected) assert.ok(drawn.some((line) => samePolyline(line, side)), `size ${n}: a wall is missing`);
    // The outer edge: one arc per outer-ring cell, ending exactly where the
    // next begins, all the way round.
    const edge = topology.cells().flatMap((c) => geometry.walls(c).filter((w) => w.neighbour === null).map((w) => w.points));
    assert.equal(edge.length, topology.ringSizes.at(-1));
    edge.forEach((arc, k) => assert.ok(same(arc.at(-1), edge[(k + 1) % edge.length][0]), `size ${n}: gap after edge arc ${k}`));
    const swept = edge.reduce((s, arc) => s + ((turn(arc.at(-1)) - turn(arc[0]) + TAU) % TAU), 0);
    assert.ok(Math.abs(swept - TAU) < 1e-9, 'the edge goes once round');
  }
});

test('render: the player and exit markers are their cells shrunk to half size around the centre', async () => {
  const g = await polarGame(4);
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
    const c = geometry.centre(cell);
    const outline = geometry.outline(cell);
    assert.equal(marker.length, outline.length);
    outline.forEach((corner, k) => {
      assert.ok(distance(marker[k], { x: (c.x + corner.x) / 2, y: (c.y + corner.y) / 2 }) < 1e-9, `cell ${cell}`);
    });
  }
});

// Keys

test('keys: on circles every key takes exactly its ring-relative direction, or nothing', () => {
  const t = polarTopology(9);
  const maze = growingTree(t, { random: seededRandom(11) }).maze;
  const geometry = geometryFor(t);
  let splitsChecked = 0;
  for (const cell of t.cells()) {
    const dirs = directionsAt(maze, geometry, cell);
    const open = (label) => { const n = t.neighbourByLabel(cell, label); return n !== null && maze.isLinked(cell, n); };
    for (const [label, keys] of Object.entries(KEYS)) {
      for (const key of keys) assert.equal(choose(dirs, key), open(label) ? label : null, `cell ${cell} ${key}`);
    }
    const openOut = t.links(cell).filter((n) => isOutward(n.label) && maze.isLinked(cell, n.cell)).map((n) => n.label);
    for (const key of UP_KEYS) assert.equal(choose(dirs, key), openOut.length === 1 ? openOut[0] : null, `cell ${cell} ${key}`);
    if (openOut.length > 1) splitsChecked++;
    DIGITS.forEach((key, k) => assert.equal(choose(dirs, key), open(`OUT${k}`) ? `OUT${k}` : null, `cell ${cell} ${key}`));
  }
  assert.ok(splitsChecked > 0, 'some cells have several open outward passages');
});

test('keys: where several outward passages are open, Up picks none and each number picks its own', () => {
  const t = polarTopology(3);
  // The centre opens onto all six cells of ring 1; cell 1 opens onto both of
  // its outward cells; cell 2 onto only its second.
  const [a, b] = t.neighbours(1).filter((n) => t.coordsOf(n).ring === 2);
  const c = t.neighbourByLabel(2, 'OUT1');
  const maze = Maze.fromPassages(t, [...t.neighbours(0).map((n) => [0, n]), [1, a], [1, b], [2, c]]);
  const geometry = geometryFor(t);
  const centre = directionsAt(maze, geometry, 0);
  assert.equal(choose(centre, 'ArrowUp'), null);
  assert.deepEqual(DIGITS.map((key) => choose(centre, key)), ['OUT0', 'OUT1', 'OUT2', 'OUT3', 'OUT4', 'OUT5', null, null, null]);
  for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowRight']) assert.equal(choose(centre, key), null, `centre ${key}`);
  const split = directionsAt(maze, geometry, 1);
  assert.equal(choose(split, 'w'), null);
  assert.deepEqual(['1', '2', '3'].map((key) => choose(split, key)), ['OUT0', 'OUT1', null]);
  assert.equal(choose(split, 'ArrowDown'), 'IN');
  // One open outward passage: Up takes it, and so does its number; the other number does nothing.
  const single = directionsAt(maze, geometry, 2);
  assert.deepEqual(['ArrowUp', '1', '2'].map((key) => choose(single, key)), ['OUT1', null, 'OUT1']);
});

test('keys: hex extras and other keys do nothing on circles; directions keep their names for screen readers', () => {
  for (const key of ['q', 'e', 'Home', 'PageUp', 'End', 'PageDown', '0', 'x', 'Enter', ' ', '__proto__', 'constructor']) {
    assert.equal(keyCommand(key, 'polar'), undefined, key);
  }
  assert.deepEqual(['CW', 'CCW', 'IN', 'OUT0', 'OUT1'].map(directionName), ['clockwise', 'anticlockwise', 'inward', 'outward 1', 'outward 2']);
});

// The game

test('game: every key in every cell runs the corridor its own way, or does nothing', async () => {
  const g = await polarGame(5);
  const { maze, topology, exitCell } = g.state;
  for (const cell of topology.cells()) {
    const dirs = directionsAt(maze, g.state.geometry, cell);
    for (const key of [...UP_KEYS, ...Object.values(KEYS).flat(), ...DIGITS].filter((_, k) => (k + cell) % 2 === 0)) {
      const label = choose(dirs, key);
      const expected = label === null ? [] : corridor(maze, cell, topology.neighbourByLabel(cell, label), { stopAt: exitCell });
      assert.deepEqual(pressFrom(g, cell, key), expected, `cell ${cell} ${key}`);
    }
  }
});

test('game: every passage between rings can be crossed outward and back inward', async () => {
  const g = await polarGame(8);
  const { maze, topology, exitCell } = g.state;
  let crossings = 0;
  for (const [a, b] of maze.passages()) {
    const [inner, outer] = topology.coordsOf(a).ring < topology.coordsOf(b).ring ? [a, b] : [b, a];
    if (topology.coordsOf(inner).ring === topology.coordsOf(outer).ring) continue;
    const { label } = topology.links(inner).find((n) => n.cell === outer);
    const out = pressFrom(g, inner, keyFor(label));
    assert.equal(out[0], outer, `${inner} -> ${outer} with ${keyFor(label)}`);
    assert.deepEqual(out, corridor(maze, inner, outer, { stopAt: exitCell }));
    const back = pressFrom(g, outer, 'ArrowDown');
    assert.equal(back[0], inner, `${outer} -> ${inner} inward`);
    assert.deepEqual(back, corridor(maze, outer, inner, { stopAt: exitCell }));
    crossings++;
  }
  assert.ok(crossings >= topology.rings - 1);
});

test('game: following the solver route with keys reaches the exit on the outer ring and completes the maze', async () => {
  for (const n of [6, 15]) {
    const g = await polarGame(n);
    const { maze, topology, exitCell } = g.state;
    const route = shortestPath(maze, 0, exitCell);
    let presses = 0;
    while (g.state.player.cell !== exitCell) {
      const at = route.indexOf(g.state.player.cell);
      assert.ok(at >= 0, 'the player stays on the route');
      const { label } = topology.links(route[at]).find((x) => x.cell === route[at + 1]);
      // Up when it is the only open way out, otherwise the passage's own key.
      const onlyOut = isOutward(label) && maze.traversableLinks(route[at]).filter((x) => isOutward(x.label)).length === 1;
      g.key(onlyOut && presses % 2 === 0 ? 'ArrowUp' : keyFor(label));
      assert.ok(++presses <= route.length, 'every press makes progress');
    }
    assert.equal(g.state.completed, true);
    assert.equal(g.document.getElementById('completeBanner').style.display, '');
  }
});

test('game: Search shows the solver route on a circle and follows the player', async () => {
  const g = await polarGame(9);
  g.click('SearchButton');
  const { maze, exitCell } = g.state;
  assert.deepEqual(g.state.route, shortestPath(maze, 0, exitCell));
  const [first] = maze.traversableLinks(0);
  g.key(keyFor(first.label));
  assert.deepEqual(g.state.route, shortestPath(maze, g.state.player.cell, exitCell));
});

// Pad

const enabled = (g) => g.state.pad.buttons
  .filter((b) => b.getAttribute('aria-disabled') === 'false')
  .map((b) => b.getAttribute('data-label'))
  .sort();

function circles(g) {
  return g.state.pad.buttons.map((b) => {
    const c = b.querySelector('circle');
    return { label: b.getAttribute('data-label'), x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) };
  });
}

// Shows the pad for the player on `cell`, as after a move there.
function standOn(g, cell) {
  g.state.player.cell = cell;
  g.click('SearchButton');
}

test('pad: one distinct, named button per direction, facing it, with outward choices in clockwise order', async () => {
  const g = await polarGame(10);
  const { maze, topology, geometry } = g.state;
  let splits = 0;
  for (const cell of topology.cells()) {
    standOn(g, cell);
    const buttons = g.state.pad.buttons;
    const links = topology.links(cell);
    assert.deepEqual(buttons.map((b) => b.getAttribute('data-label')), links.map((n) => n.label), `cell ${cell}`);
    // Distinct IDs and names, so no two choices can be confused.
    assert.equal(new Set(buttons.map((b) => b.id)).size, buttons.length);
    assert.equal(new Set(buttons.map((b) => b.getAttribute('aria-label'))).size, buttons.length);
    assert.deepEqual(enabled(g), maze.traversableLinks(cell).map((n) => n.label).sort(), `cell ${cell}`);
    // Each chevron points where its side faces; buttons never overlap.
    const dirs = directionsAt(maze, geometry, cell);
    const placed = circles(g);
    buttons.forEach((b, k) => {
      const rotate = /rotate\(([-\d.]+)\)/.exec(b.querySelector('path').getAttribute('transform'))[1];
      assert.ok(angleBetween((Number(rotate) * Math.PI) / 180, dirs[k].angle) < 1e-3, `cell ${cell} ${b.id} chevron`);
      for (const other of placed.slice(k + 1)) assert.ok(Math.hypot(placed[k].x - other.x, placed[k].y - other.y) >= placed[k].r + other.r - 1e-9);
    });
    const outward = dirs.filter((d) => isOutward(d.label));
    if (outward.length > 1) {
      splits++;
      // Outward passages face distinct ways, OUT0 furthest anticlockwise.
      for (let k = 1; k < outward.length; k++) {
        const prev = geometry.centre(outward[k - 1].cell);
        const next = geometry.centre(outward[k].cell);
        assert.ok(angleBetween(outward[k - 1].angle, outward[k].angle) > 0.1, `cell ${cell} outward choices face apart`);
        assert.ok(angleBetween(turn(next), turn(prev) + TAU / topology.ringSizes[topology.coordsOf(outward[k].cell).ring]) < 1e-9);
      }
    }
  }
  assert.ok(splits > 0);
});

test('pad: tapping each open outward button of a split cell takes its own passage', async () => {
  const g = await polarGame(10, { seed: 4 });
  const { maze, topology, exitCell } = g.state;
  const split = topology.cells().filter((c) => maze.traversableLinks(c).filter((n) => isOutward(n.label)).length > 1);
  assert.ok(split.length > 0, 'the maze has a cell with several open outward passages');
  for (const cell of split.slice(0, 5)) {
    for (const { label, cell: next } of maze.traversableLinks(cell).filter((n) => isOutward(n.label))) {
      standOn(g, cell);
      g.click(`${label.toLowerCase()}Button`);
      assert.deepEqual(g.settle().slice(1), corridor(maze, cell, next, { stopAt: exitCell }), `cell ${cell} ${label}`);
    }
    // Walled buttons do nothing.
    standOn(g, cell);
    for (const b of g.state.pad.buttons.filter((b) => b.getAttribute('aria-disabled') === 'true')) {
      g.click(b.id);
      assert.equal(g.pendingFrames, 0, `cell ${cell} ${b.id} is walled`);
    }
  }
});

test('pad: the six centre buttons and five-way ring buttons fit a small phone and stay thumb-sized', async () => {
  const g = await loadGame({ seed: 2, innerWidth: 320, innerHeight: 568 });
  g.generateFromSettings(5, 'polar');
  const pxPerUnit = Math.min(320, 568 * 0.3, 300) / 200;
  const { topology } = g.state;
  for (const cell of [0, topology.cellAt(1, 2), topology.cellAt(3, 7)]) {
    standOn(g, cell);
    const placed = circles(g);
    assert.equal(placed.length, topology.links(cell).length);
    for (const [i, c] of placed.entries()) {
      assert.ok(Math.abs(c.x) + c.r <= 100 && Math.abs(c.y) + c.r <= 100, `cell ${cell} button ${i} inside the pad`);
      assert.ok(2 * c.r * pxPerUnit >= 44, `cell ${cell} button ${i} is at least 44 px across`);
    }
  }
});

// Animation and viewport

test('animation: a step out of the centre slides the marker one passage at a time, and input waits for the run', async () => {
  const g = await polarGame(6);
  const { maze, exitCell } = g.state;
  const [{ label, cell: next }] = maze.traversableLinks(0);
  const run = corridor(maze, 0, next, { stopAt: exitCell });
  g.press(keyFor(label));
  g.tick(1);
  g.tick(g.state.stepMs / 2);
  const marker = g.state.player.marker;
  assert.deepEqual([marker.from, marker.to], [0, next]);
  assert.ok(marker.progress > 0 && marker.progress < 1);
  g.press('ArrowDown');
  assert.deepEqual(g.settle(), [0, ...run]);
  assert.equal(g.state.player.cell, run.at(-1));
});

function wheel(g, { x, y, deltaY }) {
  g.state.canvas.dispatchEvent(new g.window.WheelEvent('wheel', { clientX: x, clientY: y, deltaY, bubbles: true, cancelable: true }));
}

test('viewport: the whole circle is fitted inside the canvas and centred', async () => {
  const g = await polarGame(15);
  const { topology, geometry, renderer, canvas } = g.state;
  const side = parseFloat(canvas.style.width);
  const view = renderer.viewport;
  const corners = topology.cells().flatMap((c) => geometry.outline(c)).map((p) => view.toScreen(p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= side && Math.min(...ys) >= 0 && Math.max(...ys) <= side);
  const centre = view.toScreen({ x: 0, y: 0 });
  assert.ok(Math.abs(centre.x - side / 2) < 1e-6 && Math.abs(centre.y - side / 2) < 1e-6);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - (side - 2 * renderer.lineWidth)) < 1e-3, 'the circle spans the canvas');
});

test('viewport: zoomed in, the circle is drawn through the zoomed view and keys and the pad still reach the exit', async () => {
  const g = await polarGame(12);
  wheel(g, { x: 80, y: 60, deltaY: -600 });
  const v = g.state.renderer.viewport;
  assert.ok(v.zoom > 1);
  const { maze, topology, geometry, exitCell } = g.state;
  // The drawing uses the zoomed transform, and every cell maps back to itself.
  g.drawCalls.length = 0;
  g.click('ResetButton');
  const transform = g.drawCalls.filter(([name]) => name === 'setTransform').at(-1).slice(1);
  assert.deepEqual(transform, v.matrix());
  for (const cell of topology.cells()) {
    const back = v.toWorld(v.toScreen(geometry.centre(cell)));
    assert.ok(distance(back, geometry.centre(cell)) < 1e-9);
  }
  // Alternate keys and pad taps along the solver route.
  const route = shortestPath(maze, 0, exitCell);
  let presses = 0;
  while (g.state.player.cell !== exitCell) {
    const at = route.indexOf(g.state.player.cell);
    assert.ok(at >= 0, 'the player stays on the route');
    const { label } = topology.links(route[at]).find((x) => x.cell === route[at + 1]);
    if (presses % 2 === 0) g.key(keyFor(label));
    else {
      g.click(`${label.toLowerCase()}Button`);
      g.settle();
    }
    assert.ok(++presses <= route.length);
    const now = g.state.renderer.viewport;
    assert.deepEqual([now.zoom, now.panX, now.panY], [v.zoom, v.panX, v.panY], 'moving keeps the view');
  }
  assert.equal(g.state.completed, true);
});

test('viewport: resizing the window or hiding the pad keeps the circle, the player and the route', async () => {
  const g = await polarGame(7);
  const [first] = g.state.maze.traversableLinks(0);
  g.key(keyFor(first.label));
  g.click('SearchButton');
  const { maze, route } = g.state;
  const cell = g.state.player.cell;
  g.resize(500, 900, 2);
  g.click('ControllerButton');
  assert.equal(g.state.maze, maze);
  assert.equal(g.state.topology.kind, 'polar');
  assert.equal(g.state.player.cell, cell);
  assert.deepEqual(g.state.route, route);
  assert.equal(g.state.renderer.viewport.dpr, 2);
});
