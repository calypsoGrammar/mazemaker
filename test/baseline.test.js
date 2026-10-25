// Behavioural baseline for the existing game (CAL-1230, docs/baseline.md).
// These tests describe what main currently does; they do not change it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPerfectMaze, corridorRun, followRoute, loadGame, neighbours, shortestRoute } from './harness.js';

const ARROWS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' };
const WASD = { UP: 'w', DOWN: 's', LEFT: 'a', RIGHT: 'd' };
const PAD = { UP: 'upButton', DOWN: 'downButton', LEFT: 'leftButton', RIGHT: 'rightButton' };

async function gameOfSize(n, { autoNew = true, increment = true, seed = n } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.document.getElementById('autoincrement').checked = increment;
  g.generateFromSettings(n);
  return g;
}

// Presses each direction in turn, letting each run finish; returns the cells
// the last run passed through.
function walk(g, dirs, keys = ARROWS) {
  let trail = [];
  for (const d of dirs) trail = g.key(keys[d]);
  return trail;
}

// Follows the shortest route from the player to `to` with as few presses as
// corridor runs allow.
function walkTo(g, to, keys = ARROWS) {
  const route = shortestRoute(g.state.maze, g.state.height, g.state.player.cell, to);
  return followRoute(g, route.cells, (d) => g.key(keys[d]));
}

test('first load: 5x5 maze, player top-left, exit bottom-right, settings hidden', async () => {
  const g = await loadGame();
  const { state, document } = g;
  assert.equal(state.width, 5);
  assert.equal(state.height, 5);
  assert.equal(state.topology.size, 25);
  assert.equal(document.getElementById('display001').value, '5');
  assert.equal(document.getElementById('autonew').checked, true);
  assert.equal(document.getElementById('autoincrement').checked, true);
  assert.equal(document.getElementById('settingsMenu').style.display, 'none');
  assert.equal(state.player.cell, 0);
  assert.equal(state.exitCell, 24);
  assert.equal(state.route.length, 0);
});

test('canvas is a square sized to 90% of the smaller of the width and 62.5% of the height', async () => {
  const desktop = await loadGame({ innerWidth: 1024, innerHeight: 768 });
  assert.equal(desktop.state.canvas.width, Math.floor(768 * 0.625 * 0.9));
  assert.equal(desktop.state.canvas.height, desktop.state.canvas.width);
  const phone = await loadGame({ innerWidth: 390, innerHeight: 844 });
  assert.equal(phone.state.canvas.width, Math.floor(390 * 0.9));
});

test('generation produces a perfect maze (spanning tree) for every size from 2 to 50', async () => {
  for (let n = 2; n <= 50; n++) {
    const { state } = await gameOfSize(n);
    assertPerfectMaze(assert, state.maze, n, n);
  }
});

test('search (magnifier) highlights the shortest route from the player to the exit', async () => {
  for (const n of [2, 5, 10, 25, 50]) {
    // Auto-new off: a run off the start may reach the exit.
    const g = await gameOfSize(n, { autoNew: false });
    // Move off the start so the route begins at the player's current cell.
    const [first] = neighbours(g.state.maze, n, 0);
    walk(g, [first[0]]);
    const from = g.state.player.cell;
    g.click('SearchButton');
    const route = g.state.route;
    const expected = shortestRoute(g.state.maze, n, from, n * n - 1);
    assert.equal(route[0], from);
    assert.equal(route.at(-1), n * n - 1);
    assert.equal(route.length, expected.cells.length, `n=${n} route length`);
    for (let k = 1; k < route.length; k++) {
      const steps = neighbours(g.state.maze, n, route[k - 1]).map(([, j]) => j);
      assert.ok(steps.includes(route[k]), `n=${n} step ${k} goes through a wall`);
    }
  }
});

// Changed in CAL-1234: the route used to stay as drawn when the player moved.
// Changed in CAL-1237: a move runs along the corridor, and the route follows
// every cell of the run.
test('after search, the highlighted route is recomputed from the player after every step', async () => {
  const g = await gameOfSize(10, { autoNew: false });
  // Before search, moving does not show a route.
  const [first] = neighbours(g.state.maze, 10, 0);
  walk(g, [first[0]]);
  assert.deepEqual([...g.state.route], []);
  g.click('ResetButton');
  g.click('SearchButton');
  assert.deepEqual([...g.state.route], shortestRoute(g.state.maze, 10, 0, 99).cells);
  // Run down every open passage out of the start, including ones off the
  // route into dead ends; the route is recomputed at every cell on the way.
  for (const [dir] of neighbours(g.state.maze, 10, 0)) {
    g.press(ARROWS[dir]);
    while (g.pendingFrames > 0) {
      g.tick(g.state.stepMs / 2);
      assert.deepEqual([...g.state.route], shortestRoute(g.state.maze, 10, g.state.player.cell, 99).cells);
    }
    assert.equal(g.state.player.cell, corridorRun(g.state.maze, 10, 0, dir, 99).at(-1));
    g.click('ResetButton');
    g.click('SearchButton');
  }
  // Following the route shortens it, down to the exit.
  walkTo(g, 99);
  assert.deepEqual([...g.state.route], [99]);
});

test('a new maze clears the route and stops recomputing it', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  g.click('SearchButton');
  assert.ok(g.state.route.length > 0);
  g.click('NewMazeButton');
  assert.deepEqual([...g.state.route], []);
  const [first] = neighbours(g.state.maze, 6, 0);
  walk(g, [first[0]]);
  assert.deepEqual([...g.state.route], []);
});

for (const [name, input] of [
  ['arrow keys', (g, d) => g.key(ARROWS[d])],
  ['WASD keys', (g, d) => g.key(WASD[d])],
  ['on-screen pad', (g, d) => { g.click(PAD[d]); return g.settle(); }],
]) {
  // Changed in CAL-1237: a move used to go one cell; it now runs along the corridor.
  test(`${name} move through open passages only`, async () => {
    const g = await gameOfSize(8, { autoNew: false });
    const { maze } = g.state;
    // From the start, every walled direction is refused and every open one
    // runs to the end of its corridor.
    for (const [dir, delta] of [['UP', -1], ['DOWN', 1], ['LEFT', -8], ['RIGHT', 8]]) {
      const open = neighbours(maze, 8, 0).some(([d]) => d === dir);
      const trail = input(g, dir);
      if (open) {
        assert.equal(trail[1], delta, `${dir} from start`);
        assert.deepEqual(trail, [0, ...corridorRun(maze, 8, 0, dir, 63)], `${dir} from start`);
      } else assert.deepEqual(trail, [0], `${dir} from start`);
      g.click('ResetButton');
    }
    followRoute(g, shortestRoute(maze, 8, 0, 63).cells, (d) => input(g, d));
    assert.equal(g.state.player.cell, 63);
  });
}

// Changed in CAL-1236: upper-case WASD used to be ignored (defect 4).
test('upper-case WASD (Shift or Caps Lock) moves like lower case', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const [[dir, cell]] = neighbours(g.state.maze, 6, 0);
  const trail = g.key(WASD[dir].toUpperCase());
  assert.equal(trail[1], cell);
});

test('reaching the exit with auto-new and auto-increment starts a maze one size larger', async () => {
  const g = await gameOfSize(5);
  const old = g.state.maze;
  walkTo(g, 24);
  assert.equal(g.state.topology.size, 36);
  assert.equal(g.document.getElementById('display001').value, '6');
  assert.equal(g.state.player.cell, 0);
});

test('auto-increment stops at size 50', async () => {
  const g = await gameOfSize(50);
  walkTo(g, 2499);
  assert.equal(g.state.width, 50);
  assert.equal(g.state.player.cell, 0);
});

test('reaching the exit with auto-new on and auto-increment off starts a new maze of the same size', async () => {
  const g = await gameOfSize(5, { increment: false });
  walkTo(g, 24);
  assert.equal(g.state.topology.size, 25);
  assert.equal(g.state.player.cell, 0);
});

test('reaching the exit with auto-new off leaves the player on the exit', async () => {
  const g = await gameOfSize(5, { autoNew: false });
  walkTo(g, 24);
  assert.equal(g.state.player.cell, 24);
  assert.equal(g.state.topology.size, 25);
});

test('settings button toggles the settings panel; Generate applies size and toggles and closes it', async () => {
  const g = await loadGame();
  const menu = g.document.getElementById('settingsMenu');
  g.click('OptionsButton');
  assert.equal(menu.style.display, '');
  g.click('OptionsButton');
  assert.equal(menu.style.display, 'none');

  g.click('OptionsButton');
  g.document.getElementById('display001').value = 12;
  g.click('autonew');
  g.click('autoincrement');
  g.click('generateMaze');
  assert.equal(menu.style.display, 'none');
  assert.equal(g.state.topology.size, 144);
  assert.equal(g.state.autoNew, false);
  assert.equal(g.state.increment, false);
});

// Changed in CAL-1236: Reset used to make a new maze at whatever size was
// typed in the settings field (defect 6). It now restarts the current maze;
// the new-maze button makes another layout at the size in play.
test('reset (undo icon) restarts the current maze; the new-maze button makes another layout', async () => {
  const g = await loadGame();
  const old = JSON.stringify(g.state.maze.passages());
  g.document.getElementById('display001').value = 7;
  g.click('ResetButton');
  assert.equal(g.state.topology.size, 25);
  assert.equal(JSON.stringify(g.state.maze.passages()), old);
  g.click('NewMazeButton');
  assert.equal(g.state.topology.size, 25);
  assert.notEqual(JSON.stringify(g.state.maze.passages()), old);
});

test('controller button hides the on-screen pad and enlarges the canvas, keeping the player cell', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const [[dir]] = neighbours(g.state.maze, 6, 0);
  const cell = walk(g, [dir]).at(-1);
  assert.notEqual(cell, 0);
  const small = g.state.canvas.width;
  g.click('ControllerButton');
  assert.equal(g.document.getElementById('footerControls').style.display, 'none');
  assert.ok(g.state.canvas.width > small);
  assert.equal(g.state.player.cell, cell);
  g.click('ControllerButton');
  assert.equal(g.document.getElementById('footerControls').style.display, '');
  assert.equal(g.state.canvas.width, small);
});
