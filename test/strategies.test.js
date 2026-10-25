// Tests for the growing-tree selection strategies (CAL-1233 / MM-V1-04):
// every mode makes a perfect, solvable maze on every topology, a seed fixes
// the maze, the original mixed mode is unchanged, and work is bounded.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STRATEGY, MAX_CELLS, STRATEGIES, STRATEGY_NAMES, growingTree, hexTopology,
  isPerfect, polarTopology, reachable, resolveStrategy, seededRandom, shortestPath,
  squareTopology, triangleTopology,
} from '../src/javascripts/maze/index.js';
import { loadGame } from './harness.js';

const TOPOLOGIES = {
  'square 1x1': () => squareTopology(1, 1),
  'square 12x9': () => squareTopology(12, 9),
  'square 7x1': () => squareTopology(7, 1),
  'hex 7x5': () => hexTopology(7, 5),
  'triangle 9x4': () => triangleTopology(9, 4),
  'polar 6': () => polarTopology(6),
};

// Counts how many times `random` is called.
function counting(random) {
  const f = () => { f.calls++; return random(); };
  f.calls = 0;
  return f;
}

test('the four modes are newest, oldest, random and mixed, with mixed the default', () => {
  assert.deepEqual([...STRATEGY_NAMES].sort(), ['mixed', 'newest', 'oldest', 'random']);
  assert.equal(DEFAULT_STRATEGY, 'mixed');
  for (const name of STRATEGY_NAMES) {
    assert.equal(resolveStrategy(name), STRATEGIES[name]);
    assert.equal(STRATEGIES[name].name, name);
  }
  assert.equal(growingTree(squareTopology(3, 3), { seed: 1 }).strategy, 'mixed');
});

for (const strategy of STRATEGY_NAMES) {
  for (const [name, make] of Object.entries(TOPOLOGIES)) {
    test(`${strategy} on ${name}: perfect (spanning tree) and solvable`, () => {
      const t = make();
      for (const seed of [1, 2, 3, 4, 5]) {
        const result = growingTree(t, { strategy, seed });
        const { maze } = result;
        assert.equal(result.strategy, strategy);
        assert.equal(result.steps, 2 * t.size - 1);
        assert.deepEqual(maze.consistencyErrors(), []);
        // n - 1 passages and every cell reachable: a spanning tree.
        assert.equal(maze.passages().length, t.size - 1);
        assert.equal(reachable(maze, 0).length, t.size);
        assert.ok(isPerfect(maze));
        const path = shortestPath(maze, 0, t.size - 1);
        assert.equal(path[0], 0);
        assert.equal(path.at(-1), t.size - 1);
      }
    });

    test(`${strategy} on ${name}: the same seed gives the same maze`, () => {
      for (const seed of [0, 42, 0xFFFFFFFF]) {
        const one = growingTree(make(), { strategy, seed }).maze.passages();
        const two = growingTree(make(), { strategy, seed }).maze.passages();
        assert.deepEqual(one, two);
        const viaRandom = growingTree(make(), { strategy, random: seededRandom(seed) }).maze.passages();
        assert.deepEqual(viaRandom, one);
      }
    });
  }
}

test('different seeds and different modes give different mazes', () => {
  const t = squareTopology(12, 12);
  const mazes = new Set();
  for (const strategy of STRATEGY_NAMES) {
    for (const seed of [1, 2]) mazes.add(JSON.stringify(growingTree(t, { strategy, seed }).maze.passages()));
  }
  assert.equal(mazes.size, 2 * STRATEGY_NAMES.length);
});

// Dead ends (cells with one passage) tell the modes apart: depth-first mazes
// have few, Prim-like random selection has many.
test('newest makes fewer dead ends than random', () => {
  const t = squareTopology(30, 30);
  const deadEnds = (strategy) => {
    const { maze } = growingTree(t, { strategy, seed: 9 });
    return t.cells().filter((id) => maze.traversableNeighbours(id).length === 1).length;
  };
  assert.ok(deadEnds('newest') < deadEnds('random'), `${deadEnds('newest')} vs ${deadEnds('random')}`);
});

test('newest is depth-first: every step extends the cell added last', () => {
  const t = squareTopology(10, 10);
  const order = [];
  const strategy = {
    name: 'probe',
    create: (random) => {
      const select = STRATEGIES.newest.create(random);
      return (length) => { const i = select(length); order.push([i, length]); return i; };
    },
  };
  growingTree(t, { strategy, seed: 3 });
  assert.ok(order.length > 0);
  for (const [i, length] of order) assert.equal(i, length - 1);
});

test('the original mixed mode makes the same mazes as before strategies were extracted', () => {
  // Recorded from the CAL-1232 generator with mulberry32 seed 2024.
  assert.deepEqual(growingTree(squareTopology(4, 4), { seed: 2024 }).maze.passages(), [
    [0, 4], [1, 2], [2, 6], [3, 7], [4, 8], [5, 6], [6, 7], [6, 10],
    [8, 9], [8, 12], [9, 10], [9, 13], [10, 11], [11, 15], [14, 15],
  ]);
});

test('random draws are bounded: at most 3 per step plus 3 to set up', () => {
  for (const strategy of STRATEGY_NAMES) {
    const t = hexTopology(9, 9);
    const random = counting(seededRandom(5));
    growingTree(t, { strategy, random });
    assert.ok(random.calls <= 3 + 3 * (2 * t.size - 1), `${strategy} used ${random.calls}`);
  }
});

test('a topology over the cell limit is rejected before any random number is drawn', () => {
  const random = counting(Math.random);
  assert.throws(() => growingTree(squareTopology(5, 5), { random, maxCells: 24 }), RangeError);
  assert.equal(random.calls, 0);
  assert.equal(growingTree(squareTopology(5, 5), { seed: 1, maxCells: 25 }).maze.passages().length, 24);
  assert.ok(MAX_CELLS >= 50 * 50, 'the limit allows every size the game reaches by itself');
});

test('a faulty strategy is stopped instead of looping or reading outside the active list', () => {
  const t = squareTopology(4, 4);
  const outside = { name: 'outside', create: () => (length) => length };
  assert.throws(() => growingTree(t, { strategy: outside, seed: 1 }), /selected \d+ from \d+ active cells/);
  const fraction = { name: 'fraction', create: () => () => 0.5 };
  assert.throws(() => growingTree(t, { strategy: fraction, seed: 1 }), RangeError);
});

test('unknown strategies and bad seeds are rejected', () => {
  const t = squareTopology(3, 3);
  assert.throws(() => growingTree(t, { strategy: 'prim' }), RangeError);
  assert.throws(() => growingTree(t, { strategy: 'toString' }), RangeError);
  assert.throws(() => growingTree(t, { seed: 1.5 }), RangeError);
  assert.throws(() => growingTree(t, { seed: '1' }), RangeError);
});

test('the game refuses a size over the cell limit and keeps the current maze', async () => {
  const g = await loadGame({ seed: 4 });
  const { maze, topology } = g.state;
  const side = Math.ceil(Math.sqrt(MAX_CELLS)) + 1;
  const before = g.randomCalls;
  // main.js runs in jsdom's realm, so its RangeError is a different class.
  assert.throws(() => g.generate(side, side), { name: 'RangeError', message: /over the limit/ });
  assert.equal(g.randomCalls, before);
  assert.equal(g.state.maze, maze);
  assert.equal(g.state.topology, topology);
});
