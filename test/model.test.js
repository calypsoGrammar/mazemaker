// Unit tests for the topology-independent maze model (CAL-1232 / MM-V1-03):
// topologies, passages, generation and navigation, on square, hexagonal,
// triangular and polar grids.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Maze, Topology, growingTree, hexTopology, isPerfect, polarTopology,
  reachable, shortestPath, squareTopology, triangleTopology,
} from '../src/javascripts/maze/index.js';

// Deterministic random numbers (mulberry32), as in the game harness.
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

const TOPOLOGIES = {
  'square 1x1': () => squareTopology(1, 1),
  'square 6x6': () => squareTopology(6, 6),
  'square 9x4': () => squareTopology(9, 4),
  'square 7x1': () => squareTopology(7, 1),
  'hex 1x1': () => hexTopology(1, 1),
  'hex 7x5': () => hexTopology(7, 5),
  'hex 8x8': () => hexTopology(8, 8),
  'triangle 1x1': () => triangleTopology(1, 1),
  'triangle 9x4': () => triangleTopology(9, 4),
  'triangle 8x8': () => triangleTopology(8, 8),
  'polar 1': () => polarTopology(1),
  'polar 2': () => polarTopology(2),
  'polar 7': () => polarTopology(7),
};

const degreeCounts = (t) => {
  const counts = {};
  for (const id of t.cells()) counts[t.neighbours(id).length] = (counts[t.neighbours(id).length] ?? 0) + 1;
  return counts;
};

for (const [name, make] of Object.entries(TOPOLOGIES)) {
  test(`${name}: IDs are 0..n-1, stable between builds, and adjacency is symmetric`, () => {
    const t = make();
    const again = make();
    assert.deepEqual(t.cells(), [...Array(t.size).keys()]);
    for (const id of t.cells()) {
      assert.deepEqual(again.links(id), t.links(id), `cell ${id} differs between builds`);
      const labels = t.links(id).map((n) => n.label);
      assert.equal(new Set(labels).size, labels.length, `cell ${id} labels are unique`);
      for (const { label, cell } of t.links(id)) {
        assert.equal(t.neighbourByLabel(id, label), cell);
        assert.ok(t.areNeighbours(cell, id), `${id} -> ${cell} has no reverse`);
      }
    }
    // Lattice coordinates round-trip through the stable IDs.
    for (const id of t.cells()) assert.equal(t.cellAt(...Object.values(t.coordsOf(id))), id);
  });

  test(`${name}: growing-tree makes a perfect maze with consistent two-way passages`, () => {
    const t = make();
    for (const seed of [1, 2, 3]) {
      const { maze, steps } = growingTree(t, { random: seeded(seed) });
      assert.deepEqual(maze.consistencyErrors(), []);
      assert.equal(maze.passages().length, t.size - 1);
      assert.equal(reachable(maze, 0).length, t.size);
      assert.ok(isPerfect(maze));
      assert.equal(steps, 2 * t.size - 1);
      for (const [a, b] of maze.passages()) {
        assert.ok(t.areNeighbours(a, b));
        assert.ok(maze.isLinked(a, b) && maze.isLinked(b, a));
        assert.ok(maze.traversableNeighbours(a).includes(b) && maze.traversableNeighbours(b).includes(a));
      }
    }
  });

  test(`${name}: the same seed gives the same maze`, () => {
    const one = growingTree(make(), { random: seeded(42) }).maze.passages();
    const two = growingTree(make(), { random: seeded(42) }).maze.passages();
    assert.deepEqual(one, two);
  });

  test(`${name}: shortestPath walks only through passages and is the unique route`, () => {
    const t = make();
    const { maze } = growingTree(t, { random: seeded(7) });
    const last = t.size - 1;
    const path = shortestPath(maze, 0, last);
    assert.equal(path[0], 0);
    assert.equal(path.at(-1), last);
    assert.equal(new Set(path).size, path.length);
    for (let k = 1; k < path.length; k++) assert.ok(maze.isLinked(path[k - 1], path[k]));
    assert.deepEqual(shortestPath(maze, last, 0), [...path].reverse());
    assert.deepEqual(shortestPath(maze, last, last), [last]);
  });
}

test('square topology numbers cells column by column, as the game always has', () => {
  const t = squareTopology(4, 3);
  assert.equal(t.kind, 'square');
  assert.equal(t.cellAt(2, 1), 2 * 3 + 1);
  assert.deepEqual(t.coordsOf(7), { column: 2, row: 1 });
  assert.deepEqual(t.links(7), [
    { label: 'UP', cell: 6 }, { label: 'DOWN', cell: 8 },
    { label: 'LEFT', cell: 4 }, { label: 'RIGHT', cell: 10 },
  ]);
  assert.deepEqual(t.links(0).map((n) => n.label), ['DOWN', 'RIGHT']);
  assert.deepEqual(degreeCounts(t), { 2: 4, 3: 6, 4: 2 });
  // A single row has no up/down neighbours at all.
  assert.deepEqual(squareTopology(5, 1).links(2).map((n) => n.label), ['LEFT', 'RIGHT']);
});

test('hex topology gives interior cells six neighbours', () => {
  const t = hexTopology(5, 5);
  assert.equal(t.kind, 'hex');
  const centre = t.cellAt(2, 2);
  assert.equal(t.neighbours(centre).length, 6);
  assert.deepEqual(
    t.links(centre).map(({ label, cell }) => [label, t.coordsOf(cell)]),
    [
      ['N', { column: 2, row: 1 }], ['S', { column: 2, row: 3 }],
      ['NE', { column: 3, row: 1 }], ['NW', { column: 1, row: 1 }],
      ['SE', { column: 3, row: 2 }], ['SW', { column: 1, row: 2 }],
    ],
  );
  assert.equal(Math.max(...Object.keys(degreeCounts(t)).map(Number)), 6);
});

test('triangle topology gives every cell at most three neighbours, alternating up and down', () => {
  const t = triangleTopology(6, 4);
  assert.equal(t.kind, 'triangle');
  const up = t.cellAt(2, 2);
  const down = t.cellAt(3, 2);
  assert.ok(t.pointsUp(up));
  assert.ok(!t.pointsUp(down));
  assert.deepEqual(t.links(up).map((n) => n.label), ['LEFT', 'RIGHT', 'DOWN']);
  assert.deepEqual(t.links(down).map((n) => n.label), ['LEFT', 'RIGHT', 'UP']);
  assert.ok(Object.keys(degreeCounts(t)).every((d) => d <= 3));
});

test('polar topology has a centre cell and rings that split outwards', () => {
  const t = polarTopology(5);
  assert.equal(t.kind, 'polar');
  assert.deepEqual(t.ringSizes, [1, 6, 12, 24, 24]);
  assert.equal(t.size, 67);
  // The centre touches every cell of ring 1.
  assert.deepEqual(t.neighbours(0), [1, 2, 3, 4, 5, 6]);
  // A ring-1 cell: around the ring, in to the centre, and out to two cells.
  assert.deepEqual(t.links(1).map((n) => n.label), ['CW', 'CCW', 'IN', 'OUT0', 'OUT1']);
  // Ring 3 -> ring 4 does not split, so cells there have one outward neighbour.
  assert.deepEqual(t.links(t.cellAt(3, 0)).map((n) => n.label), ['CW', 'CCW', 'IN', 'OUT0']);
  // The outer ring wraps around: the last cell is next to the first.
  assert.equal(t.neighbourByLabel(t.cellAt(4, 23), 'CW'), t.cellAt(4, 0));
  assert.deepEqual(new Set(Object.keys(degreeCounts(t)).map(Number)), new Set([3, 4, 5, 6]));
});

test('Topology rejects one-way, self and unknown neighbours, and duplicate labels', () => {
  assert.throws(() => new Topology('x', [[{ label: 'A', cell: 1 }], []]), /not the reverse/);
  assert.throws(() => new Topology('x', [[{ label: 'A', cell: 0 }]]), /its own neighbour/);
  assert.throws(() => new Topology('x', [[{ label: 'A', cell: 5 }]]), /does not exist/);
  assert.throws(() => new Topology('x', [
    [{ label: 'A', cell: 1 }, { label: 'A', cell: 2 }],
    [{ label: 'B', cell: 0 }],
    [{ label: 'B', cell: 0 }],
  ]), /duplicate label/);
  for (const bad of [0, -1, 2.5, NaN, '3']) {
    assert.throws(() => squareTopology(bad), RangeError);
    assert.throws(() => hexTopology(bad), RangeError);
    assert.throws(() => triangleTopology(bad), RangeError);
    assert.throws(() => polarTopology(bad), RangeError);
  }
});

test('passages are always two-way: link and unlink change both sides', () => {
  const t = hexTopology(3, 3);
  const maze = new Maze(t);
  const [a, b] = [t.cellAt(1, 1), t.cellAt(1, 0)];
  assert.equal(maze.isLinked(a, b), false);
  maze.link(a, b);
  assert.ok(maze.isLinked(a, b));
  assert.ok(maze.isLinked(b, a));
  assert.deepEqual(maze.traversableNeighbours(a), [b]);
  assert.deepEqual(maze.traversableNeighbours(b), [a]);
  assert.equal(maze.move(a, 'N'), b);
  assert.equal(maze.move(b, 'S'), a);
  assert.equal(maze.move(a, 'S'), null);
  maze.unlink(b, a);
  assert.equal(maze.isLinked(a, b), false);
  assert.equal(maze.isLinked(b, a), false);
  assert.deepEqual(maze.consistencyErrors(), []);
});

test('passages can only join neighbouring cells', () => {
  const t = squareTopology(3, 3);
  const maze = new Maze(t);
  assert.throws(() => maze.link(0, 4), /not neighbours/);
  assert.throws(() => maze.link(0, 0), /not neighbours/);
  assert.throws(() => maze.link(99, 0), /does not exist/);
  assert.throws(() => Maze.fromPassages(t, [[0, 1], [0, 8]]), /not neighbours/);
  assert.deepEqual(Maze.fromPassages(t, [[1, 0], [0, 3]]).passages(), [[0, 1], [0, 3]]);
});

test('navigation reports unreachable cells', () => {
  const t = triangleTopology(4, 1);
  const maze = Maze.fromPassages(t, [[0, 1], [2, 3]]);
  assert.deepEqual(reachable(maze, 0), [0, 1]);
  assert.equal(shortestPath(maze, 0, 3), null);
  assert.equal(isPerfect(maze), false);
});

test('generation and navigation use no screen coordinates or direction names', () => {
  for (const file of ['generate.js', 'navigate.js', 'maze.js']) {
    const source = readFileSync(new URL(`../src/javascripts/maze/${file}`, import.meta.url), 'utf8')
      .replace(/\/\/.*$/gm, '');
    for (const word of ['UP', 'DOWN', 'LEFT', 'RIGHT', 'canvas', 'window', 'document', 'width', 'height']) {
      assert.ok(!new RegExp(`\\b${word}\\b`).test(source), `${file} mentions ${word}`);
    }
  }
});
