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
import { MOVES, assertPerfectMaze, loadGame, neighbours, shortestRoute } from './harness.js';

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

// The cell the player is drawn in, from its canvas position. This does not
// rely on player.index (see the known defect below).
function playerCell(g, cols, rows) {
  const { player, canvas } = g.state;
  const x = Math.floor(player.x / (canvas.width / cols));
  const y = Math.floor(player.y / (canvas.height / rows));
  return { x, y, index: x * rows + y };
}

for (const [cols, rows] of GEOMETRIES) {
  const at = `${cols}x${rows}`;

  test(`${at}: generation makes a perfect maze with the start top-left and the exit bottom-right`, async () => {
    for (const seed of [1, 2, 3]) {
      const g = await gameAt(cols, rows, { seed });
      const { maze } = g.state;
      assertPerfectMaze(assert, maze, cols, rows);
      assert.deepEqual(playerCell(g, cols, rows), { x: 0, y: 0, index: 0 });
      assert.deepEqual([...maze.keys()].filter((i) => maze[i].target), [cols * rows - 1]);
    }
  });

  test(`${at}: generation stops by exhausting its work list, within a bounded number of steps`, async () => {
    const g = await gameAt(cols, rows);
    const before = g.randomCalls;
    g.generate(cols, rows);
    const n = cols * rows;
    // The loop ended normally, not at its 100,000,000-step safety cap.
    assert.equal(g.state.running, false);
    assert.equal(g.state.history.length, 0);
    assert.ok(g.state.maze.every((c) => c.visited));
    // Each step carves one passage or retires one cell: 2n - 1 steps, using at
    // most three random numbers each, plus four to set up.
    assert.ok(g.randomCalls - before <= 4 + 3 * (2 * n - 1), `${at} used ${g.randomCalls - before} random numbers`);
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
      for (const [dir, { wall, delta }] of Object.entries(MOVES)) {
        g.key(ARROWS[dir]);
        const now = playerCell(g, cols, rows);
        if (maze[cell][wall] !== false) {
          assert.equal(now.index, cell, `${at} ${dir} from ${cell} should be blocked`);
          continue;
        }
        assert.equal(now.index, cell + delta(rows), `${at} ${dir} from ${cell}`);
        assert.ok(now.x >= 0 && now.x < cols && now.y >= 0 && now.y < rows, `${at} left the grid`);
        if (!visited.has(now.index)) visit(now.index);
        g.key(ARROWS[OPPOSITE[dir]]);
        assert.equal(playerCell(g, cols, rows).index, cell);
      }
    };
    visit(0);
    assert.equal(visited.size, cols * rows);
  });

  test(`${at}: walking the shortest route reaches the exit, and with auto-new a fresh maze starts`, async () => {
    const stay = await gameAt(cols, rows);
    const route = shortestRoute(stay.state.maze, rows, 0, cols * rows - 1);
    for (const d of route.dirs) stay.key(ARROWS[d]);
    assert.equal(playerCell(stay, cols, rows).index, cols * rows - 1);
    assert.equal(stay.state.maze.length, cols * rows);

    const next = await gameAt(cols, rows, { autoNew: true });
    const first = next.state.maze[0];
    for (const d of shortestRoute(next.state.maze, rows, 0, cols * rows - 1).dirs) next.key(ARROWS[d]);
    // NewMaze rebuilds the cells; the new maze takes its size from the size field.
    assert.notEqual(next.state.maze[0], first);
    const size = Number(next.document.getElementById('display001').value);
    assertPerfectMaze(assert, next.state.maze, size, size);
    assert.equal(next.state.player.index, 0);
  });

  test(`${at}: search from the start highlights the shortest route to the exit`, async () => {
    const g = await gameAt(cols, rows);
    g.click('SearchButton');
    const expected = shortestRoute(g.state.maze, rows, 0, cols * rows - 1);
    assert.deepEqual([...g.state.activePath.path], expected.cells);
  });
}

// Malformed sizes. The input is a free <input type="number"> with no limits.

function captureErrors(g) {
  const errors = [];
  g.window.addEventListener('error', (event) => {
    event.preventDefault();
    errors.push(event.error);
  });
  return errors;
}

for (const value of ['0', '', '-3', '2.5', 'abc']) {
  test(`known defect 1: size ${JSON.stringify(value)} throws a TypeError and leaves no maze; Reset at a valid size recovers`, async () => {
    const g = await loadGame();
    const errors = captureErrors(g);
    g.click('OptionsButton');
    g.document.getElementById('display001').value = value;
    g.click('generateMaze');
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof g.window.TypeError, String(errors[0]));
    // 2.5 builds a 3x3 grid of cells but cannot carve it; the others build none.
    assert.equal(g.state.maze.length, value === '2.5' ? 9 : 0);
    assert.equal(g.document.getElementById('settingsMenu').style.display, 'none');

    g.document.getElementById('display001').value = 6;
    g.click('ResetButton');
    assert.equal(errors.length, 1);
    assertPerfectMaze(assert, g.state.maze, 6, 6);
  });
}

test('known defect 2: size 1 makes a single cell that is both start and exit, and cannot be won', async () => {
  const g = await gameAt(1, 1, { autoNew: true, increment: true });
  assertPerfectMaze(assert, g.state.maze, 1, 1);
  const before = g.state.maze;
  for (const key of Object.values(ARROWS)) g.key(key);
  assert.equal(g.state.maze, before);
  assert.equal(g.state.player.index, 0);
});

// Defects that only show on geometries the UI cannot make yet. They will matter
// once non-square mazes are supported.

test('known defect 13: horizontal moves step player.index by the width, not the height', async () => {
  const cols = 7;
  const rows = 3;
  const g = await gameAt(cols, rows);
  const errors = captureErrors(g);
  // Walk to the first cell with an open right wall, then step right.
  const from = g.state.maze.findIndex((c) => c.right === false);
  for (const d of shortestRoute(g.state.maze, rows, 0, from).dirs) g.key(ARROWS[d]);
  assert.equal(g.state.player.index, from);
  g.key(ARROWS.RIGHT);
  // The player is drawn one column right (from + rows), but player.index is from + cols.
  assert.equal(playerCell(g, cols, rows).index, from + rows);
  assert.equal(g.state.player.index, from + cols);
  // Search starts from player.index, so it starts from the wrong cell, or throws
  // when that index is past the end of the maze.
  g.click('SearchButton');
  if (from + cols < cols * rows) assert.equal(g.state.activePath.path[0], from + cols);
  else assert.equal(errors.length, 1);
});

test('known defect 14: with a single row, generation also opens the outer top and bottom walls', async () => {
  const g = await gameAt(6, 1);
  const { maze } = g.state;
  // Passages along the row are right, but the up/down checks match the same
  // neighbour indices (index +/- 1), so the outer walls are opened too.
  assert.ok(maze.some((c) => c.down === false));
  assert.ok(maze.some((c) => c.up === false));
  const start = playerCell(g, 6, 1);
  if (maze[0].down === false) {
    g.key(ARROWS.DOWN);
    assert.equal(playerCell(g, 6, 1).y, start.y + 1);
  }
});

test('known defect 15: search while standing on the exit draws nothing and runs to its 10,000-step cap', async () => {
  const g = await gameAt(5, 5);
  for (const d of shortestRoute(g.state.maze, 5, 0, 24).dirs) g.key(ARROWS[d]);
  assert.equal(g.state.player.index, 24);
  g.click('SearchButton');
  assert.equal(g.state.activePath.path.length, 0);
});

test('known defect 3: search finds no route once a maze needs more than 10,000 search steps', async () => {
  const g = await gameAt(120, 120);
  g.click('SearchButton');
  assert.equal(g.state.activePath.path.length, 0);
});
