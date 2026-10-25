// Regression checks for the core game rules (CAL-1231 / MM-V1-02): connectivity,
// boundaries, movement, reaching the exit, malformed sizes and generator
// termination. Every rule check takes a cols x rows geometry, so it runs on
// rectangles as well as the squares the UI can make today.
//
// Tests named "known defect" pin behaviour recorded in docs/baseline.md. They
// describe what main does now, not what it should do; a fix should update the
// test and the report together.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, assertPerfectMaze, loadGame, neighbours, shortestRoute, step } from './harness.js';

const ARROWS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' };
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const MAX_TOUR_CELLS = 400;

// [cols, rows]. Squares are what the UI produces; the rest run main.js's
// generator directly at sizes the size field cannot express.
const GEOMETRIES = [
  [2, 2], [5, 5], [17, 17], [50, 50],
  [1, 8], [2, 9], [9, 2], [3, 7], [7, 3], [12, 30], [30, 12],
];

async function gameAt(cols, rows, { autoNew = false, increment = false, seed = cols * 100 + rows } = {}) {
  const g = await loadGame({ seed });
  g.document.getElementById('autonew').checked = autoNew;
  g.document.getElementById('autoincrement').checked = increment;
  g.generate(cols, rows);
  return g;
}

const playerCell = (g) => g.state.player.cell;

for (const [cols, rows] of GEOMETRIES) {
  const at = `${cols}x${rows}`;

  test(`${at}: generation makes a perfect maze with the start top-left and the exit bottom-right`, async () => {
    for (const seed of [1, 2, 3]) {
      const g = await gameAt(cols, rows, { seed });
      const { maze } = g.state;
      assertPerfectMaze(assert, maze, cols, rows);
      assert.equal(playerCell(g), 0);
      assert.equal(g.state.exitCell, cols * rows - 1);
      assert.deepEqual(maze.topology.coordsOf(g.state.exitCell), { column: cols - 1, row: rows - 1 });
    }
  });

  test(`${at}: generation stops within a bounded number of random draws`, async () => {
    const g = await gameAt(cols, rows);
    const before = g.randomCalls;
    g.generate(cols, rows);
    const n = cols * rows;
    // Each step carves one passage or retires one cell: 2n - 1 steps, using at
    // most three random numbers each, plus three to set up.
    assert.ok(g.randomCalls - before <= 3 + 3 * (2 * n - 1), `${at} used ${g.randomCalls - before} random numbers`);
    assertPerfectMaze(assert, g.state.maze, cols, rows);
  });

  // Every move redraws the whole maze, so a full tour of 50x50 takes ~15 s.
  test(`${at}: every move goes through an open passage and never leaves the grid; every cell can be reached`, {
    skip: cols * rows > MAX_TOUR_CELLS && 'too slow for a full tour; covered structurally above',
  }, async () => {
    const g = await gameAt(cols, rows);
    const { maze } = g.state;
    const visited = new Set();
    const visit = (cell) => {
      visited.add(cell);
      for (const dir of Object.keys(MOVES)) {
        g.key(ARROWS[dir]);
        const now = playerCell(g);
        const target = step(cols, rows, cell, dir);
        if (target === null || !maze.isLinked(cell, target)) {
          assert.equal(now, cell, `${at} ${dir} from ${cell} should be blocked`);
          continue;
        }
        assert.equal(now, target, `${at} ${dir} from ${cell}`);
        if (!visited.has(now)) visit(now);
        g.key(ARROWS[OPPOSITE[dir]]);
        assert.equal(playerCell(g), cell);
      }
    };
    visit(0);
    assert.equal(visited.size, cols * rows);
  });

  test(`${at}: walking the shortest route reaches the exit, and with auto-new a fresh maze starts`, async () => {
    const stay = await gameAt(cols, rows);
    const route = shortestRoute(stay.state.maze, rows, 0, cols * rows - 1);
    for (const d of route.dirs) stay.key(ARROWS[d]);
    assert.equal(playerCell(stay), cols * rows - 1);
    assert.equal(stay.state.topology.size, cols * rows);

    const next = await gameAt(cols, rows, { autoNew: true });
    const first = next.state.maze;
    for (const d of shortestRoute(next.state.maze, rows, 0, cols * rows - 1).dirs) next.key(ARROWS[d]);
    // Auto-new keeps the size in play (Auto-increment is off here).
    assert.notEqual(next.state.maze, first);
    assertPerfectMaze(assert, next.state.maze, cols, rows);
    assert.equal(next.state.player.cell, 0);
  });

  test(`${at}: search from the start highlights the shortest route to the exit`, async () => {
    const g = await gameAt(cols, rows);
    g.click('SearchButton');
    const expected = shortestRoute(g.state.maze, rows, 0, cols * rows - 1);
    assert.deepEqual([...g.state.route], expected.cells);
  });
}

// Malformed sizes. Since CAL-1236 the size field takes whole numbers from 2 to
// 50 only (it used to throw on bad input, defect 1, and let size 1 make an
// unwinnable maze, defect 2).

function captureErrors(g) {
  const errors = [];
  g.window.addEventListener('error', (event) => {
    event.preventDefault();
    errors.push(event.error);
  });
  return errors;
}

for (const value of ['0', '1', '', ' ', '-3', '2.5', '1e1', '51', '9999999999', 'abc']) {
  test(`fixed defect 1: size ${JSON.stringify(value)} is refused with a message and keeps the current maze`, async () => {
    const g = await loadGame();
    const before = g.state.maze;
    const errors = captureErrors(g);
    const randomCalls = g.randomCalls;
    g.generateFromSettings(value);
    assert.deepEqual(errors, []);
    // No maze was generated: the 5x5 maze stays in play and the panel stays open.
    assert.equal(g.randomCalls, randomCalls);
    assert.equal(g.state.maze, before);
    assert.equal(g.state.width, 5);
    assert.equal(g.document.getElementById('settingsMenu').style.display, '');
    assert.equal(g.document.getElementById('sizeError').style.display, '');

    g.generateFromSettings(6);
    assert.deepEqual(errors, []);
    assert.equal(g.document.getElementById('settingsMenu').style.display, 'none');
    assertPerfectMaze(assert, g.state.maze, 6, 6);
    // Reopening the panel shows the size in play, without the message.
    g.click('OptionsButton');
    assert.equal(g.document.getElementById('display001').value, '6');
    assert.equal(g.document.getElementById('sizeError').style.display, 'none');
  });
}

for (const size of [2, 12, 50]) {
  test(`size ${JSON.stringify(size)} is accepted`, async () => {
    const g = await loadGame();
    g.generateFromSettings(size);
    assertPerfectMaze(assert, g.state.maze, size, size);
  });
}

test('the size field declares its whole-number range', async () => {
  const g = await loadGame();
  const field = g.document.getElementById('display001');
  assert.equal(field.min, '2');
  assert.equal(field.max, '50');
  assert.equal(field.step, '1');
});

// Defects 13 and 14 showed only on geometries the UI cannot make yet; 3 and 15
// were in the old search. The topology-independent model (CAL-1232) fixed them.

test('fixed defect 13: horizontal moves step one column on a non-square grid, and search starts there', async () => {
  const cols = 7;
  const rows = 3;
  const g = await gameAt(cols, rows);
  // Walk to the first cell with an open passage to the right, then step right.
  const from = g.state.topology.cells().find((i) => neighbours(g.state.maze, rows, i).some(([d]) => d === 'RIGHT'));
  for (const d of shortestRoute(g.state.maze, rows, 0, from).dirs) g.key(ARROWS[d]);
  assert.equal(playerCell(g), from);
  g.key(ARROWS.RIGHT);
  assert.equal(playerCell(g), from + rows);
  g.click('SearchButton');
  assert.deepEqual([...g.state.route], shortestRoute(g.state.maze, rows, from + rows, cols * rows - 1).cells);
});

test('fixed defect 14: with a single row, generation keeps the outer top and bottom walls closed', async () => {
  const g = await gameAt(6, 1);
  assertPerfectMaze(assert, g.state.maze, 6, 1);
  g.key(ARROWS.DOWN);
  g.key(ARROWS.UP);
  assert.equal(playerCell(g), 0);
});

test('fixed defect 15: search while standing on the exit highlights just the exit cell', async () => {
  const g = await gameAt(5, 5);
  for (const d of shortestRoute(g.state.maze, 5, 0, 24).dirs) g.key(ARROWS[d]);
  assert.equal(playerCell(g), 24);
  g.click('SearchButton');
  assert.deepEqual([...g.state.route], [24]);
});

test('fixed defect 3: search finds the route on large mazes', async () => {
  const g = await gameAt(120, 120);
  g.click('SearchButton');
  assert.deepEqual([...g.state.route], shortestRoute(g.state.maze, 120, 0, 120 * 120 - 1).cells);
});
