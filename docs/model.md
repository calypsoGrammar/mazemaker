# Maze model (CAL-1232 / MM-V1-03)

The maze code in `src/javascripts/maze/` does not depend on the grid shape. It
has no screen coordinates and no fixed set of directions. `main.js` uses it for
the square game, and keeps input and the player. Drawing is in
`src/javascripts/render/` (CAL-1235, `docs/rendering.md`).

| Layer | Where | Knows about |
|---|---|---|
| Topology | `maze/topology.js` | Which cells exist and which are neighbours. |
| Passages | `maze/maze.js` (`Maze`) | Which neighbouring cells are joined. Any other pair is walled. |
| Generation | `maze/generate.js` (`growingTree`) | Cell IDs and neighbour lists only. |
| Navigation | `maze/navigate.js` (`shortestPath`, `reachable`, `isPerfect`) | Traversable neighbours only. |
| Rendering | `render/` (see `docs/rendering.md`) | Cell shapes for each topology, the viewport and the Canvas 2D renderer. |
| Input | `main.js` | The key → direction mapping. |
| Player | `main.js` (`Player.cell`) | A cell ID. |

## Topology

A `Topology` has `size` cells with IDs `0 … size-1`. Each cell lists its
neighbours as `{ label, cell }` pairs. A cell can have any number of
neighbours. Labels are unique within a cell. They name a direction, for input
and rendering, and generation and navigation never read them. The constructor
rejects adjacency that is one-way, a cell listed as its own neighbour, an
unknown cell, or a duplicate label or neighbour.

The factories number cells deterministically from their arguments:

| Factory | Numbering | Labels | Most neighbours |
|---|---|---|---|
| `squareTopology(cols, rows)` | column by column, `column * rows + row`, as the game always has | `UP` `DOWN` `LEFT` `RIGHT` | 4 |
| `hexTopology(cols, rows)` | row by row, `row * cols + column`. Flat-topped, odd columns shifted down. | `N` `S` `NE` `NW` `SE` `SW` | 6 |
| `triangleTopology(cols, rows)` | row by row. A cell points up when `column + row` is even. | `LEFT` `RIGHT` and `DOWN` (up-pointing) or `UP` (down-pointing) | 3 |
| `polarTopology(rings)` | centre first, then ring by ring, each ring from the same spoke | `CW` `CCW` `IN` `OUT0` `OUT1` … | 6 for the centre, 5 for other cells |

In the polar grid, each ring has as many cells as the ring inside it,
multiplied by `round(2π · ring / inner count)`. For example, 5 rings give
1, 6, 12, 24 and 24 cells. Each factory also provides `cellAt(...)` and
`coordsOf(id)` for its lattice coordinates (column/row or ring/index). These
are not pixels.

Every factory throws a `RangeError` when a dimension is not a positive whole
number.

## Passages

`Maze` stores passages for one topology:

- `link(a, b)` and `unlink(a, b)` change both directions together. They throw
  when `a` and `b` are not neighbours, so a passage is always two-way and never
  leaves the grid.
- `isLinked(a, b)`, `traversableNeighbours(id)` and `traversableLinks(id)` are
  the operations that generation, navigation and movement use.
- `move(id, label)` gives the cell reached through the passage in direction
  `label`, or `null` when there is a wall or no neighbour.
- `passages()` lists every passage once, as `[a, b]` with `a < b`.
- `consistencyErrors()` checks the stored data and returns its problems. It
  is used by the tests.

## Changes in the game

Gameplay is unchanged for every maze the UI can make. Cell IDs, the start
(cell 0) and the exit (last cell) are the same as before. Search returns the
same shortest route, and drawing uses the same coordinates. The growing-tree
generator picks cells in the same way, but it draws random numbers in a
different order. A given seed therefore produces a different maze than it did
before this change.

Some recorded defects (`docs/baseline.md`) were caused by the old four-direction
code and are fixed by the new model:

- 3: search no longer has a cap.
- 13: the player position is a cell ID.
- 14: a single row has no up/down neighbours.
- 15: search on the exit returns the exit cell.

Defect 1 changed: an invalid size now throws a `RangeError` before any state
changes, so the previous maze stays in play. Before, a `TypeError` left the
canvas blank. The size field still has no validation.

The build output no longer matches the 2023 hashes recorded in
`docs/baseline.md`. That revision is still the rollback target.
