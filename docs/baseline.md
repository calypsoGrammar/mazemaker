# Maze Maker baseline (CAL-1230 / MM-V1-01)

Audited 2026-10-25 against `main` at `1537877` (`15378772a7a50fb2d179e254bd8be8a778177407`).
This report records what the repository shows. The live site, the GitHub Pages
settings and real devices could not be reached from the audit environment; the
checks that need them are listed under [Checks for a person](#checks-for-a-person).

## Known-good revision

| | |
|---|---|
| Application source | `4db47b69ae2da2148a6877f3f52917d1373c6a7f` (2023-03-04), the last commit that touched app code. Every later commit changes only `WORKFLOW.md` and `.github/workflows/ci.yml`. |
| Current `main` | `15378772a7a50fb2d179e254bd8be8a778177407`. The app source is identical to `4db47b6`. |
| Last committed build | `dist/` at `53d88e41280beb02c4e6a9ad18e88ba9ce787072` (2023-02-26). It was deleted from `main` in `4db47b6`. |

`npm ci && npm run build` on current `main` gives output **byte-identical** to
that committed `dist/` (all 12 files compared):

| File | SHA-256 |
|---|---|
| `dist/index.html` | `aa26d581f2f6edeb987901ff511af531e7298f200d584fd780aea04479ceb93b` |
| `dist/assets/index-487d29ca.js` | `10f771c40b4a4e2ae94d8b80faf51031bfc1d9150c6dd9a370eacfb161e16a82` |
| `dist/assets/index-7cb51def.css` | `7cb51defbaa07d0637f071740cd71f03cbe5c4f80494935d92bb3e9fb200db71` |

Asset names to look for in the deployed HTML: `index-487d29ca.js` and
`index-7cb51def.css`. If the live page references these names, it is serving
the same build as `main`.

## Production URL and deployment (from the repository)

- **URL in the README:** `https://crhisgbibon.github.io/mazemaker/`. The repository is
  now `calypsoGrammar/mazemaker`. Its default Pages address would be
  `https://calypsogrammar.github.io/mazemaker/`. Which of these is the canonical
  production URL is **unconfirmed**. GitHub does not redirect a Pages site after the
  repository moves to another owner, so the README link may be stale.
- **Vite `base`:** `/mazemaker/` (`vite.config.js`). Built asset URLs are absolute
  under `/mazemaker/`, so the build only works when served at a `…/mazemaker/` path.
  It works on either `<owner>.github.io/mazemaker/` address, but not at the root
  of a custom domain.
- **Build:** `npm ci && npm run build` writes `dist/`. Tailwind is processed by
  PostCSS (`postcss.config.cjs`, content scanned from `index.html` only). The repo
  pins Vite 4.1.4 and Tailwind 3.2.7 through `package-lock.json`. The build is
  reproducible: the hashes above match a build made in 2023. Tested on Node 26
  locally; CI uses Node 22.
- **CI:** `.github/workflows/ci.yml` runs `npm ci`, `npm test` and `npm run build`
  on pull requests and pushes to `main` (tests added in CAL-1231). It does **not**
  deploy.
- **Deploy mechanism: not in the repository.** No workflow publishes to Pages,
  and `dist/` is not on `main` (it was committed by hand on 2023-02-26 and
  removed on 2023-03-04). The site is therefore published one of these ways:
  from a `gh-pages` (or similar) branch pushed by hand, which this checkout does
  not include; from a Pages source of "main / root", which would serve the
  **unbuilt** `index.html` without Tailwind; or by an older artefact that no longer
  matches anything on `main`. This must be checked in the repository settings.

## Rollback

The app has not changed since 2023, so rollback means restoring the known-good
build above.

1. **Revert on `main`.** For a bad change to app source: `git revert <sha>`,
   then merge. Confirm that `npm run build` again produces `index-487d29ca.js` and
   `index-7cb51def.css`, then redeploy.
2. **Rebuild the known-good revision.** `git checkout 4db47b6` (or current `main`
   for an identical result), then `npm ci && npm run build`, then publish `dist/`
   by whatever mechanism Pages uses.
3. **Restore the exact 2023 artefacts without building.**
   `git archive 53d88e4 dist | tar -x` restores the committed `dist/`. It is
   byte-identical to step 2.

How the result reaches the live site depends on the Pages source, which is
unconfirmed. For a branch source, push `dist/` contents to that branch. For an
Actions source, re-run the deploy for the chosen commit. No rollback was run
against the live site.

## Layout

The page is a single, fixed, full-viewport layout sized by a `--vh` custom
property (`innerHeight / 100`, recalculated on `resize` and `orientationchange`):

- **Header (7.5 vh):** four icon buttons, left to right:
  - Reset (undo icon)
  - Controller (gamepad icon)
  - Settings (sliders icon)
  - Search (magnifier icon)
- **Game area (62.5 vh, or 92.5 vh with the pad hidden):** a centred square canvas.
  Its side is 90% of the smaller of the window width and the game-area height.
- **Footer (30 vh):** an on-screen D-pad (3×3 grid, max 300 px wide) with
  up/left/right/down buttons. It is shown by default on desktop as well as mobile.
- **Settings panel:** a full-width white overlay below the header. It contains Maze
  Size (number), Auto-new (checkbox, on), Auto-increment (checkbox, on) and a
  Generate button.

Colours: walls `rgba(50,50,60)`, player green `rgba(150,250,150)`, exit red
`rgba(250,150,150)`, route translucent teal.

## Controls

| Input | Action |
|---|---|
| Arrow keys or `w` `a` `s` `d` (lower case only) | Move one cell. Moves into a wall are ignored. |
| D-pad buttons (click or tap) | Same as the keys. |
| Reset (undo) | New maze at the size **currently typed** in the settings field (not a reset to size 5). |
| Controller | Hides or shows the D-pad. The canvas grows or shrinks and keeps the player's cell. |
| Settings | Opens or closes the settings panel. |
| Search | Highlights the shortest route from the player's current cell to the exit. |

There is no swipe, drag or pointer-on-canvas control. Touch input works only
through the D-pad buttons, which use `click` handlers.

## Settings and progression

- First load: size 5 (5×5), Auto-new on, Auto-increment on.
- **Generate** reads the size and both checkboxes, closes the panel and makes a new
  maze.
- On reaching the exit (bottom-right cell):
  - With Auto-new on, a new maze starts immediately. There is no win message or
    any other feedback.
  - If Auto-increment is also on and the size is below 50, the size goes up by 1
    and the field updates.
  - With Auto-new off, nothing happens and the player stays on the exit.
- Nothing is saved. A reload returns to the defaults.

## Maze generation

Cells are stored column by column (`index = x * size + y`). Generation is a
**growing-tree** algorithm:

1. Start from a random cell.
2. Each step, open a wall from the current cell to a random unvisited neighbour.
3. Pick the next cell from the active list as the newest, the oldest or a random
   entry. The mix comes from three per-maze random thresholds (`t1`, `t3`), so the
   texture varies between long corridors and short branches.
4. Drop cells with no unvisited neighbours from the list.

The result is a perfect maze: outer walls closed, every cell reachable, exactly
one route between any two cells. This is verified for sizes 2–50 by
`test/baseline.test.js`. The start is always the top-left cell and the exit is
always the bottom-right cell.

## Pathfinding

`Find()` keeps a list of partial paths starting at the player's cell. Each step it
extends the shortest path to its open, unvisited neighbours and stops when it
reaches the exit. In a perfect maze, the route it returns is the shortest
(verified against an independent breadth-first search in the tests). The route:

- is drawn as translucent squares, including the player's cell;
- is **not** updated as the player moves, and stays until the next maze
  (*since CAL-1234:* it is recomputed from the player's cell after every move);
- has a hard cap of 10,000 iterations.

## Existing defects

Found by reading the code and running it in jsdom. None was fixed in this ticket.
CAL-1232 (`docs/model.md`) later fixed 3, 13, 14 and 15, and changed 1. Each of
those entries notes the change.

1. **Invalid sizes crash generation.** A size of 0, an empty field, a negative
   number or a decimal (for example 2.5) throws an uncaught `TypeError` in
   `MakeMaze`. The canvas is left blank until a valid size is generated. The input
   has no `min`, `max` or `step`.
   *Since CAL-1232:* the size is checked first and a `RangeError` is thrown. The
   previous maze stays in play. The input is still not validated.
2. **Size 1 cannot be won.** The single cell is both start and exit. The win check
   only runs after a move, and no move is possible, so the game is stuck until
   Reset or Generate.
3. **Search silently fails on large mazes.** At size 120 the 10,000-iteration cap
   is hit and no route is drawn. Sizes up to 100 worked in testing. Manual sizes
   are uncapped; only auto-increment stops at 50.
   *Fixed in CAL-1232:* search is a breadth-first search with no cap.
4. **Upper-case `W A S D` are ignored**, for example with Caps Lock on or Shift
   held.
5. **No win feedback.** With Auto-new on, the maze is simply replaced. With it
   off, nothing indicates a win.
6. **Reset uses unsaved input.** Reset generates at whatever is typed in the
   settings field, even if Generate was never pressed.
7. **Keyboard moves the player while the settings panel covers the maze.**
8. **Canvas ignores `devicePixelRatio`.** Walls render blurry on high-DPI phones
   and laptops. This was inferred from the code and needs checking on a device.
9. **Touch is untuned.** The D-pad uses `click` with no `touch-action`, so rapid
   taps may trigger double-tap zoom or delay on mobile browsers. Holding a pad
   button does not repeat, whereas holding a key does. This was inferred from the
   code and needs checking on a device.
10. **Accessibility.** The header and D-pad buttons are icon-only `<img>` elements
    with no `alt` text or `aria-label`. The maze has no text alternative.
11. **Dead code.** `iUp`/`iLeft`/`iRight`/`iDown` look up elements that do not exist,
    `FlipPad()` references an undefined `flipState` and is never called, and
    `mousePos`, `t2`, `currentPath` and the `visited` fill in `DrawMaze` do nothing.
    `rightIndex` uses `<=` where `<` is meant, but a wall always blocks that move.
    None of this affects gameplay today.
    *Since CAL-1232:* `mousePos`, `t2`, `currentPath`, the `visited` fill and
    `rightIndex` are gone with the old cell model. `iUp`… and `FlipPad()` remain.
12. **The README production link may be stale.** See the URL section above.

Found in CAL-1231 by running the generator on rectangular grids (the code keeps
separate `width` and `height`, but the UI only makes squares). None of these can
be reached from the UI today. They matter once non-square mazes are supported.
None was fixed.

13. **Horizontal moves update `player.index` by the width, not the height.**
    `Player.Move` adds or subtracts `width` for LEFT/RIGHT, but cells are stored
    column by column, so a column step is `height`. Wall checks are unaffected,
    because `CheckValidPos` recomputes the index from the drawn position before
    each move. Search, however, starts from `player.index`. On a non-square
    grid it starts from the wrong cell, or throws a `TypeError` when the index
    is past the end of the maze.
    *Fixed in CAL-1232:* the player position is a cell ID, and moves follow the
    topology's neighbours.
14. **A single-row grid gets its outer top and bottom walls opened.** With
    `height` 1, the up/down neighbour indices (index ± 1) equal the left/right
    ones (index ± height). When `MakeMaze` opens a passage, it matches both, so
    the player can walk out of the maze.
    *Fixed in CAL-1232:* a single row has no up/down neighbours in the topology.
15. **Search on the exit cell does nothing.** `Find()` never checks whether the
    start cell is the target. It explores the whole maze, then spins to its
    10,000-iteration cap, and the previous route (if any) stays drawn. This is
    reachable with Auto-new off.
    *Fixed in CAL-1232:* search returns the exit cell as the route.

## How this baseline was checked

- `npm ci && npm run build`: succeeds. The output was compared byte for byte with
  the 2023 `dist/` (identical).
- `npm test` runs `test/baseline.test.js`. It loads the unmodified `index.html`
  and `main.js` in jsdom with a seeded `Math.random`, and checks:
  - the defaults;
  - canvas sizing;
  - maze validity for sizes 2–50;
  - shortest-route search;
  - arrow, WASD and D-pad movement, and wall blocking;
  - the win, auto-new and auto-increment rules, including the cap at 50;
  - the settings panel, Reset and hiding the D-pad.

  The tests check state rather than pixels.
- `test/validation.test.js` (CAL-1231) checks the core rules. It runs on squares
  and on rectangles, through the harness's `generate(cols, rows)`, which runs
  the unmodified `NewMaze()` at a size the UI cannot express. It checks:
  - a perfect maze with the start and exit in the right corners;
  - generation ending by exhausting its work list, within a bounded number of
    steps (not at its safety cap);
  - a full tour of each maze up to 400 cells by key presses: every open
    passage moves the player one cell, every wall and outer edge blocks, and
    every cell is reachable;
  - reaching the exit, with and without Auto-new;
  - search from the start;
  - malformed sizes (`0`, empty, `-3`, `2.5`, `abc`).

  Tests named "known defect N" pin defects 1 and 2 as they behave today. A fix
  should update the test and this list together. Tests named "fixed defect N"
  cover 3, 13, 14 and 15, which CAL-1232 fixed.
- `test/model.test.js` (CAL-1232) tests the maze model on square, hexagonal,
  triangular and polar topologies (see `docs/model.md`).
- The geometry helpers in `test/harness.js` (`assertPerfectMaze`, `neighbours`,
  `shortestRoute`) take the number of columns and rows, so they can be reused
  for non-square mazes.
- No real browser or device was available. Layout and touch behaviour above come
  from the code, not from screenshots.

## Checks for a person

- [ ] Open the canonical production URL and record it here. If it is
      `calypsogrammar.github.io/mazemaker/` and not the README address, update the
      README.
- [ ] In **Settings → Pages**, record the source: a branch and folder, or GitHub
      Actions. If it is a branch, record which commit it is on.
- [ ] Check that the deployed page source references `assets/index-487d29ca.js`
      and `assets/index-7cb51def.css`. If it does, production matches `main`. If
      not, record what it serves.
- [ ] Play on a desktop browser with keyboard, and on a real phone with touch.
      Confirm the layout, the D-pad, hiding the D-pad, settings, search, the win
      and auto-increment, and rotation. Check defects 8 and 9.
- [ ] Choose the deploy and rollback mechanism (see the follow-ups). Once one exists,
      rehearse a rollback to the known-good build.
- [ ] Link this file from CAL-1230.
