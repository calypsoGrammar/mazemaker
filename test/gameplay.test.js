// Square-maze gameplay (CAL-1236 / MM-V1-07): restart versus new layout,
// progression settings, the completion state and keyboard handling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followRoute, loadGame, neighbours, shortestRoute } from './harness.js';

const ARROWS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' };

async function gameOfSize(n, { autoNew = true, increment = true, seed = n } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.document.getElementById('autoincrement').checked = increment;
  g.generateFromSettings(n);
  return g;
}

const layout = (g) => JSON.stringify(g.state.maze.passages());
const shown = (g, id) => g.document.getElementById(id).style.display !== 'none';

function solve(g) {
  const { size } = g.state.topology;
  const route = shortestRoute(g.state.maze, g.state.height, g.state.player.cell, size - 1);
  followRoute(g, route.cells, (d) => g.key(ARROWS[d]));
}

function keydown(g, init) {
  const event = new g.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  g.document.dispatchEvent(event);
  return event;
}

test('restart returns the player to the start of the same layout and clears the route', async () => {
  const g = await gameOfSize(8, { autoNew: false });
  const maze = g.state.maze;
  const before = layout(g);
  const [[dir]] = neighbours(maze, 8, 0);
  g.key(ARROWS[dir]);
  g.click('SearchButton');
  assert.notEqual(g.state.player.cell, 0);
  g.click('ResetButton');
  assert.equal(g.state.maze, maze);
  assert.equal(layout(g), before);
  assert.equal(g.state.player.cell, 0);
  assert.deepEqual([...g.state.route], []);
  // The route stays off after the restart until Search is pressed again.
  g.key(ARROWS[dir]);
  assert.deepEqual([...g.state.route], []);
});

test('new maze makes another layout at the size in play, not the size typed but not generated', async () => {
  const g = await gameOfSize(10, { autoNew: false });
  const seen = new Set([layout(g)]);
  g.document.getElementById('display001').value = 20;
  for (let k = 0; k < 5; k++) {
    g.click('NewMazeButton');
    assert.equal(g.state.width, 10);
    assert.equal(g.state.height, 10);
    assert.equal(g.state.player.cell, 0);
    seen.add(layout(g));
  }
  assert.equal(seen.size, 6);
});

test('restart and new maze keep the size, Auto-new and Auto-increment settings', async () => {
  const g = await gameOfSize(7, { autoNew: false, increment: false });
  for (const button of ['ResetButton', 'NewMazeButton', 'ResetButton']) {
    g.click(button);
    assert.equal(g.state.width, 7);
    assert.equal(g.state.autoNew, false);
    assert.equal(g.state.increment, false);
    assert.equal(g.document.getElementById('autonew').checked, false);
    assert.equal(g.document.getElementById('autoincrement').checked, false);
  }
});

test('the Auto-new and Auto-increment checkboxes take effect when changed', async () => {
  const g = await gameOfSize(5);
  g.click('OptionsButton');
  g.click('autonew');
  assert.equal(g.state.autoNew, false);
  g.click('autoincrement');
  assert.equal(g.state.increment, false);
  g.click('OptionsButton');
  solve(g);
  assert.equal(g.state.player.cell, 24);
  assert.equal(g.state.completed, true);
});

test('with Auto-new off, reaching the exit shows the completion state until restart or a new maze', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  assert.equal(shown(g, 'completeBanner'), false);
  assert.equal(g.state.completed, false);
  const before = layout(g);
  solve(g);
  assert.equal(g.state.player.cell, 35);
  assert.equal(g.state.completed, true);
  assert.equal(shown(g, 'completeBanner'), true);
  assert.equal(layout(g), before);

  // Moving off the exit keeps the maze complete.
  const [[dir]] = neighbours(g.state.maze, 6, 35);
  g.key(ARROWS[dir]);
  assert.equal(g.state.completed, true);

  g.click('completeRestart');
  assert.equal(g.state.completed, false);
  assert.equal(shown(g, 'completeBanner'), false);
  assert.equal(layout(g), before);
  assert.equal(g.state.player.cell, 0);

  solve(g);
  assert.equal(shown(g, 'completeBanner'), true);
  g.click('completeNew');
  assert.equal(g.state.completed, false);
  assert.equal(shown(g, 'completeBanner'), false);
  assert.notEqual(layout(g), before);
  assert.equal(g.state.width, 6);
});

test('the goal is only the exit cell: no other cell completes the maze', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const { cells } = shortestRoute(g.state.maze, 6, 0, 35);
  followRoute(g, cells, (d) => {
    assert.equal(g.state.completed, false);
    g.press(ARROWS[d]);
    const trail = [g.state.player.cell];
    while (g.pendingFrames > 0) {
      g.tick(g.state.stepMs / 2);
      if (g.state.player.cell !== trail.at(-1)) trail.push(g.state.player.cell);
      assert.equal(g.state.completed, g.state.player.cell === 35);
    }
    return trail;
  });
  assert.equal(g.state.completed, true);
});

test('with Auto-new on, reaching the exit starts the next maze without the completion state', async () => {
  const g = await gameOfSize(5, { increment: false });
  const before = layout(g);
  solve(g);
  assert.equal(g.state.completed, false);
  assert.equal(shown(g, 'completeBanner'), false);
  assert.equal(g.state.width, 5);
  assert.equal(g.state.player.cell, 0);
  assert.notEqual(layout(g), before);
});

test('Auto-increment grows the maze one cell per side per win, up to 50', async () => {
  const g = await gameOfSize(48);
  for (const expected of [49, 50, 50]) {
    solve(g);
    assert.equal(g.state.width, expected);
    assert.equal(g.state.height, expected);
    assert.equal(g.document.getElementById('display001').value, String(expected));
  }
});

test('keys do not move the player while the settings panel is open', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const [[dir, cell]] = neighbours(g.state.maze, 6, 0);
  g.click('OptionsButton');
  assert.deepEqual(g.key(ARROWS[dir]), [0]);
  g.click('OptionsButton');
  assert.equal(g.key(ARROWS[dir])[1], cell);
});

test('movement keys are consumed; browser shortcuts and other keys are left alone', async () => {
  const g = await gameOfSize(6, { autoNew: false });
  const [[dir, cell]] = neighbours(g.state.maze, 6, 0);
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    const event = keydown(g, { key: ARROWS[dir], [modifier]: true });
    assert.equal(event.defaultPrevented, false, modifier);
    assert.deepEqual(g.settle(), [0], modifier);
  }
  assert.equal(keydown(g, { key: 'Tab' }).defaultPrevented, false);
  assert.equal(keydown(g, { key: ARROWS[dir] }).defaultPrevented, true);
  assert.equal(g.settle()[1], cell);
});
