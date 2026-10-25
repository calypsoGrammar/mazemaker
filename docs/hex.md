# Hexagonal mazes (CAL-1240 / MM-V1-11)

The settings panel has a **Shape** list: Square (the default) or Hexagon.
Generate applies it with the size. New maze, Restart and Auto-increment keep
the shape in play. Reopening the settings shows it, and a shape picked without
pressing Generate is discarded, like the size.

## The grid

A size *n* hex maze has *n* columns and *n* rows of flat-topped hexagons
(`hexTopology(n, n)`), with odd columns half a cell lower. Each cell has up to
six neighbours: `N`, `NE`, `SE`, `S`, `SW`, `NW`. The start is cell 0, at the
top left. The exit is the last cell, at the bottom right.

Nothing in the maze code is specific to hexagons. Generation (`growingTree`,
in the same `'mixed'` mode), the BFS solver (`shortestPath`) and corridor
runs (`corridor`) are the ones the square game uses (`docs/model.md`).

## Drawing

`hexGeometry` gives every cell six unit sides. A side between two cells is the
same segment for both, and is drawn once, only when it is a wall. Every side
on the outer edge is a wall. The player and exit markers are hexagons half the
size of a cell. During a step the marker's corners move in straight lines from
one cell to the next. The viewport fits the maze, which is taller than wide,
into the square canvas, centred. Zoom and pan (`renderer.setView`) and
`toWorld` work the same as on the square grid (`docs/rendering.md`).

## Controls

- **Pad:** six buttons, one on each side of the hexagon, with chevrons
  pointing out through that side. The buttons stay in place as the player
  moves. A walled side is faded and does nothing.
- **Keys:** `Q W E` / `A S D`, the numeric keypad `7 8 9` / `1 2 3`, and Up and
  Down each take one side exactly. Left and Right take a diagonal only when
  the other one on that side is walled. See `docs/controls.md`.

## Tests

`test/hex.test.js` checks hex mazes in the game:

- generation at every size from 2 to 50, through the settings;
- adjacency, checked against the geometry (neighbouring centres are √3
  apart);
- that walls are drawn once each and open passages never are;
- every key in every cell of a maze;
- solving with keys alone;
- the pad on a phone screen;
- the animated step;
- viewport fit, zoom and pan;
- resizing.

## Checks for a person

- [ ] Play a hex maze on a phone with the pad. Check that the six buttons are
      easy to hit and match the passages on screen.
- [ ] Play a hex maze with `Q W E A S D` and with a numeric keypad.
