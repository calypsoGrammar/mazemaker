# Triangular mazes (CAL-1241 / MM-V1-12)

The settings panel's **Shape** list has a third entry, Triangle. It works like
Hexagon (`docs/hex.md`): Generate applies it with the size, and New maze,
Restart and Auto-increment keep it.

## The grid

A size *n* triangle maze has *n* rows of 2*n* equilateral triangles
(`triangleTopology(2n, n)`), so it is about as wide as it is tall. Triangles
alternate: a cell points up when `column + row` is even. Each cell has up to
three neighbours, one through each side: `LEFT`, `RIGHT`, and `DOWN` (pointing
up) or `UP` (pointing down). Triangles that only touch at a corner are never
neighbours, so no move is diagonal or corner-only. The start is cell 0, at the
top left. The exit is the last cell, at the bottom right.

In `main.js`, `SHAPES` gives the number of cells per unit of size (two for
triangles), and the `MAX_CELLS` check counts them. A size that is not a
positive whole number is refused before the maze is built.

Generation (`growingTree`, `'mixed'`), the BFS solver (`shortestPath`) and
corridor runs (`corridor`) are the same as for the other shapes
(`docs/model.md`). A triangle has no straight-through cell, so every cell a
run passes through is a forced turn. Runs stop at junctions (three open
sides), dead ends and the exit.

## Drawing

`triangleGeometry` gives every cell three unit sides. A side between two
cells is the same segment for both. A row's bottom edge and the next row's
top edge are computed the same way, so the corners match exactly and walls
meet without gaps. Each wall is drawn once, and every side on the outer edge
is a wall. The player and exit markers are triangles half the size of a cell,
pointing the same way. During a step the marker turns into the next cell's
triangle, its corners moving in straight lines.

## Controls

- **Pad:** three buttons, one on each side of the player's triangle, with
  chevrons pointing out through that side. They flip when the player moves
  onto a triangle pointing the other way. A walled side, including a side on
  the outer edge, is faded and does nothing.
- **Keys:** arrows and WASD. Left and Right take the slanted side on that
  side. Up and Down take only the level side, so each key takes at most one
  side. See `docs/controls.md`.

## Tests

`test/triangle.test.js` checks triangle mazes in the game:

- generation at every size from 2 to 50, through the settings: perfect and
  solvable;
- adjacency against the geometry: neighbours share two corners, and
  triangles that share only a corner are never neighbours;
- that walls are drawn once each, that shared corners are identical, and
  that the outer edge is closed;
- every key in every cell of a maze, which moves through whole sides only;
- forced turns and junction stops;
- solving with keys alone, and Search;
- the pad's three buttons as they flip, and on a phone screen;
- the animated step, the viewport fit and resizing.

## Checks for a person

- [ ] Play a triangle maze on a phone with the pad. Check that the buttons
      match the sides on screen as they flip.
- [ ] Play a triangle maze with the arrow keys.
