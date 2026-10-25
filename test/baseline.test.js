// Behavioural baseline for the existing game (CAL-1230, docs/baseline.md).
// These tests describe what main currently does; they do not change it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPerfectMaze, loadGame, neighbours, shortestRoute } from './harness.js';

const ARROWS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' };
const WASD = { UP: 'w', DOWN: 's', LEFT: 'a', RIGHT: 'd' };
const PAD = { UP: 'upButton', DOWN: 'downButton', LEFT: 'leftButton', RIGHT: 'rightButton' };

async function gameOfSize(n, { autoNew = true, increment = true, seed = n } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('display001').value = n;
  g.document.getElementById('autonew').checked = autoNew;
  g.document.getElementById('autoincrement').checked = increment;
  g.click('ResetButton');
  return g;
}

function walk(g, dirs, keys = ARROWS) {
  for (const d of dirs) g.key(keys[d]);
}

test('first load: 5x5 maze, player top-left, exit bottom-right, settings hidden', async () => {
  const g = await loadGame();
  const { state, document } = g;
  assert.equal(state.width, 5);
  assert.equal(state.height, 5);
  assert.equal(state.maze.length, 25);
  assert.equal(document.getElementById('display001').value, '5');
  assert.equal(document.getElementById('autonew').checked, true);
  assert.equal(document.getElementById('autoincrement').checked, true);
  assert.equal(document.getElementById('settingsMenu').style.display, 'none');
  assert.equal(state.player.index, 0);
  assert.equal(state.maze.at(-1).target, true);
  assert.equal(state.maze.filter((c) => c.target).length, 1);
  assert.equal(state.activePath.path.length, 0);
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
    const g = await gameOfSize(n);
    // Move off the start so the route begins at the player's current cell.
    const [first] = neighbours(g.state.maze, n, 0);
    walk(g, [first[0]]);
    const from = g.state.player.index;
    g.click('SearchButton');
    const route = g.state.activePath.path;
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

test('the highlighted route stays as drawn when the player moves', async () => {
  const g = await gameOfSize(10, { autoNew: false });
  g.click('SearchButton');
  const before = [...g.state.activePath.path];
  const [first] = neighbours(g.state.maze, 10, 0);
  walk(g, [first[0]]);
  assert.deepEqual([...g.state.activePath.path], before);
});

for (const [name, input] of [
  ['arrow keys', (g, dirs) => walk(g, dirs, ARROWS)],
  ['WASD keys', (g, dirs) => walk(g, dirs, WASD)],
  ['on-screen pad', (g, dirs) => dirs.forEach((d) => g.click(PAD[d]))],
]) {
  test(`${name} move one cell through open passages only`, async () => {
    const g = await gameOfSize(8, { autoNew: false });
    const { maze } = g.state;
    // From the start, every walled direction is refused and every open one moves.
    for (const [dir, delta] of [['UP', -1], ['DOWN', 1], ['LEFT', -8], ['RIGHT', 8]]) {
      const open = maze[0][dir.toLowerCase()] === false;
      input(g, [dir]);
      assert.equal(g.state.player.index, open ? delta : 0, `${dir} from start`);
      if (open) input(g, [{ UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }[dir]]);
      assert.equal(g.state.player.index, 0);
    }
    const route = shortestRoute(maze, 8, 0, 63);
    input(g, route.dirs);
    assert.equal(g.state.player.index, 63);
  });
}

test('upper-case WASD (Shift or Caps Lock) is ignored', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const [[dir]] = neighbours(g.state.maze, 6, 0);
  g.key(WASD[dir].toUpperCase());
  assert.equal(g.state.player.index, 0);
});

test('reaching the exit with auto-new and auto-increment starts a maze one size larger', async () => {
  const g = await gameOfSize(5);
  const old = g.state.maze;
  walk(g, shortestRoute(old, 5, 0, 24).dirs);
  assert.equal(g.state.maze.length, 36);
  assert.equal(g.document.getElementById('display001').value, '6');
  assert.equal(g.state.player.index, 0);
});

test('auto-increment stops at size 50', async () => {
  const g = await gameOfSize(50);
  walk(g, shortestRoute(g.state.maze, 50, 0, 2499).dirs);
  assert.equal(g.state.width, 50);
  assert.equal(g.state.player.index, 0);
});

test('reaching the exit with auto-new on and auto-increment off starts a new maze of the same size', async () => {
  const g = await gameOfSize(5, { increment: false });
  walk(g, shortestRoute(g.state.maze, 5, 0, 24).dirs);
  assert.equal(g.state.maze.length, 25);
  assert.equal(g.state.player.index, 0);
});

test('reaching the exit with auto-new off leaves the player on the exit', async () => {
  const g = await gameOfSize(5, { autoNew: false });
  walk(g, shortestRoute(g.state.maze, 5, 0, 24).dirs);
  assert.equal(g.state.player.index, 24);
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
  assert.equal(g.state.maze.length, 144);
  assert.equal(g.state.autoNew, false);
  assert.equal(g.state.increment, false);
});

test('reset (undo icon) makes a new maze at the size currently in the settings field', async () => {
  const g = await loadGame();
  const old = g.state.maze.map((c) => [c.up, c.down, c.left, c.right].join());
  g.document.getElementById('display001').value = 7;
  g.click('ResetButton');
  assert.equal(g.state.maze.length, 49);
  g.document.getElementById('display001').value = 5;
  g.click('ResetButton');
  assert.equal(g.state.maze.length, 25);
  assert.notDeepEqual(g.state.maze.map((c) => [c.up, c.down, c.left, c.right].join()), old);
});

test('controller button hides the on-screen pad and enlarges the canvas, keeping the player cell', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const [[dir, cell]] = neighbours(g.state.maze, 6, 0);
  walk(g, [dir]);
  const small = g.state.canvas.width;
  g.click('ControllerButton');
  assert.equal(g.document.getElementById('footerControls').style.display, 'none');
  assert.ok(g.state.canvas.width > small);
  assert.equal(g.state.player.index, cell);
  g.click('ControllerButton');
  assert.equal(g.document.getElementById('footerControls').style.display, '');
  assert.equal(g.state.canvas.width, small);
});
