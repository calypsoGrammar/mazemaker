// Animated corridor navigation (CAL-1237 / MM-V1-08): one move runs along a
// corridor, one animated step per passage, and stops at the first junction,
// dead end or the exit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  squareTopology, hexTopology, triangleTopology, polarTopology, growingTree, Maze, corridor,
} from '../src/javascripts/maze/index.js';
import { geometryFor, CanvasRenderer } from '../src/javascripts/render/index.js';
import { corridorRun, loadGame, neighbours } from './harness.js';

const ARROWS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' };

// A square maze with the passages along `cells`, a list of [column, row].
function pathMaze(cols, rows, ...paths) {
  const t = squareTopology(cols, rows);
  const maze = new Maze(t);
  for (const cells of paths) {
    for (let k = 1; k < cells.length; k++) maze.link(t.cellAt(...cells[k - 1]), t.cellAt(...cells[k]));
  }
  return maze;
}

// The model

test('corridor: one run covers a straight corridor of any length and stops at its dead end', () => {
  for (const length of [2, 3, 10, 50]) {
    const row = Array.from({ length }, (_, x) => [x, 0]);
    const maze = pathMaze(length, 1, row);
    const ids = row.map((c) => maze.topology.cellAt(...c));
    assert.deepEqual(corridor(maze, ids[0], ids[1]), ids.slice(1), `length ${length}`);
    assert.deepEqual(corridor(maze, ids.at(-1), ids.at(-2)), ids.slice(0, -1).reverse(), `length ${length} back`);
  }
});

test('corridor: forced 90° turns are followed', () => {
  // A snake through a 4x3 grid: right, down, left, down, right.
  const snake = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2]];
  const maze = pathMaze(4, 3, snake);
  const ids = snake.map((c) => maze.topology.cellAt(...c));
  assert.deepEqual(corridor(maze, ids[0], ids[1]), ids.slice(1));
});

test('corridor: stops at the first junction, not a later one', () => {
  // 0,0 → 3,0 with branches down at 2,0 and 3,0.
  const maze = pathMaze(4, 2, [[0, 0], [1, 0], [2, 0], [3, 0]], [[2, 0], [2, 1]], [[3, 0], [3, 1]]);
  const at = (x, y) => maze.topology.cellAt(x, y);
  assert.deepEqual(corridor(maze, at(0, 0), at(1, 0)), [at(1, 0), at(2, 0)]);
  // From the junction, the run turns the corner at 3,0 into the dead end below.
  assert.deepEqual(corridor(maze, at(2, 0), at(3, 0)), [at(3, 0), at(3, 1)]);
  // Coming into a junction the other way also stops there.
  assert.deepEqual(corridor(maze, at(2, 1), at(2, 0)), [at(2, 0)]);
});

test('corridor: stops on the destination even in the middle of a corridor', () => {
  const row = Array.from({ length: 8 }, (_, x) => [x, 0]);
  const maze = pathMaze(8, 1, row);
  assert.deepEqual(corridor(maze, 0, 1, { stopAt: 4 }), [1, 2, 3, 4]);
  assert.deepEqual(corridor(maze, 0, 1, { stopAt: 1 }), [1]);
});

test('corridor: a loop without junctions ends back where it started', () => {
  const maze = pathMaze(2, 2, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  const at = (x, y) => maze.topology.cellAt(x, y);
  assert.deepEqual(corridor(maze, at(0, 0), at(1, 0)), [at(1, 0), at(1, 1), at(0, 1), at(0, 0)]);
});

test('corridor: refuses to start through a wall', () => {
  const maze = pathMaze(3, 1, [[0, 0], [1, 0]]);
  assert.throws(() => corridor(maze, 1, 2), RangeError);
  assert.throws(() => corridor(maze, 0, 2), RangeError);
});

// Every run, from every cell in every open direction, on every topology:
// it only crosses passages, passes only through cells with one way on, and
// stops where there is not exactly one way on.
for (const [name, make] of [
  ['square 9x7', () => squareTopology(9, 7)],
  ['hex 7x6', () => hexTopology(7, 6)],
  ['triangle 10x5', () => triangleTopology(10, 5)],
  ['polar 5', () => polarTopology(5)],
]) {
  test(`corridor on ${name}: runs follow passages and stop at the first junction or dead end`, () => {
    for (const strategy of ['newest', 'oldest', 'random']) {
      const { maze } = growingTree(make(), { strategy, seed: 7 });
      const t = maze.topology;
      for (const from of t.cells()) {
        for (const next of maze.traversableNeighbours(from)) {
          const cells = corridor(maze, from, next);
          const all = [from, ...cells];
          for (let k = 1; k < all.length; k++) {
            assert.ok(maze.isLinked(all[k - 1], all[k]), `${name} ${strategy} ${all[k - 1]}-${all[k]}`);
            const degree = maze.traversableNeighbours(all[k]).length;
            if (k < all.length - 1) assert.equal(degree, 2, `${name} ${strategy} passes a junction at ${all[k]}`);
            else assert.notEqual(degree, 2, `${name} ${strategy} stops mid-corridor at ${all[k]}`);
          }
        }
      }
    }
  });
}

// The game

async function gameAt(cols, rows, { autoNew = false, seed = 1 } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.document.getElementById('autoincrement').checked = false;
  g.generate(cols, rows);
  return g;
}

// Records the scene of every render.
function recordScenes(g) {
  const scenes = [];
  const { renderer } = g.state;
  const render = renderer.render;
  renderer.render = function (scene) {
    scenes.push(scene);
    return render.call(this, scene);
  };
  return scenes;
}


test('game: one press runs the length of a straight corridor, one animated step per passage', async () => {
  for (const length of [3, 12, 40]) {
    // A single row is one straight corridor from the start to the exit.
    const g = await gameAt(length, 1);
    const scenes = recordScenes(g);
    g.press(ARROWS.RIGHT);
    assert.equal(g.state.player.cell, 0, 'nothing moves before the first frame');
    while (g.pendingFrames > 0) g.tick(g.state.stepMs / 3);
    assert.equal(g.state.player.cell, length - 1);
    assert.equal(g.state.completed, true);
    // Each step is drawn part of the way between its cells.
    for (let cell = 0; cell < length - 1; cell++) {
      assert.ok(scenes.some(({ player: m }) => typeof m === 'object' && m.from === cell && m.to === cell + 1
        && m.progress > 0 && m.progress < 1), `step ${cell}-${cell + 1} is animated`);
    }
  }
});

test('game: forced turns are followed and the run stops at the first junction', async () => {
  const g = await gameAt(10, 10, { seed: 3 });
  const { maze } = g.state;
  const turns = (cells) => cells.slice(2).some((c, k) => c - cells[k + 1] !== cells[k + 1] - cells[k]);
  // A run off the start that turns a corner on its way.
  const [dir, run] = neighbours(maze, 10, 0)
    .map(([d]) => [d, [0, ...corridorRun(maze, 10, 0, d, 99)]])
    .find(([, cells]) => turns(cells));
  assert.deepEqual(g.key(ARROWS[dir]), run);
  const end = run.at(-1);
  assert.ok(end === 99 || neighbours(maze, 10, end).length !== 2, 'stopped at a junction, dead end or the exit');
});

test('game: every step takes the same time', async () => {
  const g = await gameAt(30, 1);
  const { stepMs } = g.state;
  g.press(ARROWS.RIGHT);
  g.tick(16); // The run starts on this frame.
  let elapsed = 0;
  for (const frame of [5, 17, 3, 40, 16, 16, 9, 33, 16, 25]) {
    g.tick(frame);
    elapsed += frame;
    assert.equal(g.state.player.cell, Math.floor(elapsed / stepMs), `after ${elapsed} ms`);
  }
});

test('game: moves are ignored while the player is moving', async () => {
  const g = await gameAt(20, 1);
  g.press(ARROWS.RIGHT);
  g.tick(16);
  g.tick(g.state.stepMs * 1.5);
  const cell = g.state.player.cell;
  assert.ok(cell > 0);
  g.press(ARROWS.LEFT);
  g.click('leftButton');
  const trail = g.settle();
  assert.deepEqual(trail, Array.from({ length: 20 - cell }, (_, k) => cell + k));
});

for (const [name, action] of [
  ['restart', (g) => g.click('ResetButton')],
  ['a new maze', (g) => g.click('NewMazeButton')],
  ['generate', (g) => g.generateFromSettings(6)],
]) {
  test(`game: ${name} cancels a run under way`, async () => {
    const g = await gameAt(20, 1);
    g.press(ARROWS.RIGHT);
    g.tick(16);
    g.tick(g.state.stepMs * 2.5);
    assert.ok(g.state.player.moving);
    action(g);
    assert.equal(g.state.player.moving, false);
    assert.equal(g.state.player.cell, 0);
    assert.equal(g.pendingFrames, 0);
    assert.deepEqual(g.settle(), [0]);
    assert.equal(g.state.completed, false);
    // The player can move again straight away.
    const [[dir, cell]] = neighbours(g.state.maze, g.state.height, 0);
    assert.equal(g.key(ARROWS[dir])[1], cell);
  });
}

test('game: completion and Auto-new wait until the run has finished', async () => {
  const off = await gameAt(10, 1);
  off.press(ARROWS.RIGHT);
  while (off.pendingFrames > 0) {
    assert.equal(off.state.completed, false);
    assert.equal(off.document.getElementById('completeBanner').style.display, 'none');
    off.tick(off.state.stepMs / 2);
  }
  assert.equal(off.state.player.cell, 9);
  assert.equal(off.state.completed, true);
  assert.equal(off.document.getElementById('completeBanner').style.display, '');

  const on = await gameAt(10, 1, { autoNew: true });
  const first = on.state.maze;
  const scenes = recordScenes(on);
  on.press(ARROWS.RIGHT);
  while (on.pendingFrames > 0) {
    assert.equal(on.state.maze, first);
    on.tick(on.state.stepMs / 2);
  }
  assert.notEqual(on.state.maze, first);
  assert.equal(on.state.player.cell, 0);
  // The old maze's last frame shows the player on the exit.
  assert.equal(scenes.filter((s) => s.maze === first).at(-1).player, 9);
});

test('game: resizing during a run redraws the player part of the way along its step', async () => {
  const g = await gameAt(10, 1);
  g.press(ARROWS.RIGHT);
  g.tick(16);
  g.tick(g.state.stepMs * 1.5);
  const scenes = recordScenes(g);
  g.resize(800, 600);
  // The marker comes from main.js's realm, so compare it field by field.
  const { from, to, progress } = scenes.at(-1).player;
  assert.deepEqual({ from, to, progress }, { from: 1, to: 2, progress: 0.5 });
});

// The renderer

test('render: a moving player is drawn part of the way between two cells', () => {
  const canvas = {
    width: 0, height: 0, style: {},
    getContext() {
      const calls = this.calls = [];
      return new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : (...args) => { calls.push([key, ...args]); }),
        set: (target, key, value) => { target[key] = value; return true; },
      });
    },
  };
  const topology = squareTopology(3, 3);
  const maze = growingTree(topology, { seed: 1 }).maze;
  const renderer = new CanvasRenderer(canvas);
  renderer.resize(300, 300);
  const geometry = geometryFor(topology);
  // From cell 0 (column 0, row 0) a quarter of the way to cell 3 (column 1).
  renderer.render({ maze, geometry, player: { from: 0, to: 3, progress: 0.25 } });
  const calls = canvas.calls;
  let start = calls.length - 1;
  while (calls[start][0] !== 'beginPath') start--;
  const points = calls.slice(start).filter(([n]) => n === 'moveTo' || n === 'lineTo').map(([, x, y]) => ({ x, y }));
  assert.deepEqual(points, [{ x: 0.5, y: 0.25 }, { x: 1, y: 0.25 }, { x: 1, y: 0.75 }, { x: 0.5, y: 0.75 }]);
});
