# Circular (polar) mazes (CAL-1242 / MM-V1-13)

The settings panel's **Shape** list has a fourth entry, Circle (value
`polar`). It works like Hexagon and Triangle (`docs/hex.md`): Generate applies
it with the size, and New maze, Restart and Auto-increment keep it.

## The grid

A size *n* circle has *n* rings (`polarTopology(n)`). Ring 0 is a single
centre cell. Each further ring has as many cells as the ring inside it,
multiplied by `round(2π · ring / inner count)`, so cells stay about as wide as
a ring is deep. For example, 5 rings give 1, 6, 12, 24 and 24 cells. The
number of neighbours changes from cell to cell:

- the centre has one outward neighbour per cell of ring 1 (six);
- other cells have `CW` (clockwise), `CCW` (anticlockwise), `IN`, and one or
  more outward neighbours `OUT0`, `OUT1`, …, numbered clockwise. Where the
  next ring has twice as many cells, a cell has two;
- cells on the outer ring have no outward neighbour.

The start is the centre. The exit is the last cell of the outer ring, just
anticlockwise of the rightmost spoke. In `main.js`, `SHAPES.polar.cells` counts
the cells with `polarRingSizes` before the maze is built, so the `MAX_CELLS`
check works for circles too (size 50 has 7387 cells).

Generation (`growingTree`, `'mixed'`), the BFS solver (`shortestPath`) and
corridor runs (`corridor`) are the same as for the other shapes
(`docs/model.md`). Runs go on through cells with one way on, across rings
and round them, and stop at junctions, dead ends and the exit.

## Drawing

`polarGeometry` puts ring *k* between radius *k* and *k* + 1 around the
origin. Inner and outer sides are arcs drawn as polylines with enough points
to look round at any zoom. Sides between cells of a ring are radial
segments. A cell's outer side is split into one arc per outward neighbour,
and each piece is the same arc as that neighbour's inner side.

Corners are computed from the fraction of a turn `i / n`, wrapped to [0, 1).
Dividing whole numbers rounds the same way for `i / n` and `(i·m) / (n·m)`,
so a corner where a ring splits, or where the last cell of a ring meets the
first, is the same point from both cells. Walls meet without gaps, and each
is drawn once. The outer edge is one arc per outer-ring cell, all the way
round.

The markers are the player's and exit cells shrunk to half size. A step
between cells of a ring changes the marker's shape smoothly; a step between
rings slides it between the cells' centres. The viewport fits the whole
circle, centred; zoom, pan and Fit work as on the other shapes.

## Controls

- **Pad:** one button per direction of the player's cell, at the way its side
  faces, so the set changes as the player moves. Each outward passage has its
  own button ("Move outward 1", "Move outward 2", …), with its own ID
  (`out0Button`, `out1Button`, …). Buttons too close together are spread out,
  and the chevron still shows the true direction. A walled direction is faded
  and does nothing.
- **Keys:** ring-relative. Up/W outward, Down/S inward, Left/A anticlockwise,
  Right/D clockwise. Where several outward passages are open, Up does nothing
  and `1` to `9` choose one (numbered clockwise). See `docs/controls.md`.

## Tests

`test/polar.test.js` checks circles in the game:

- generation at every size from 2 to 50, through the settings: perfect and
  solvable, centre to outer ring;
- the topology against the rings: ring sizes, in, out, clockwise and
  anticlockwise, outward numbering;
- that cells stay in their rings, shared arcs and radial sides are exactly the
  same from both cells, walls are drawn once and passages not at all, and the
  outer edge is closed;
- every key in every cell, and that several open outward passages are never
  chosen between;
- crossing every passage between rings outward and back inward;
- solving with keys alone, and Search;
- the pad: one distinct, named button per direction, outward choices in
  clockwise order, each tapping to its own passage, and on a phone screen;
- the animated step, the viewport fit, playing to the exit while zoomed, and
  resizing.

## Checks for a person

- [ ] Play a circle on a phone with the pad. Check that the buttons match the
      sides on screen, including two outward buttons where a ring splits.
- [ ] Play a circle with the keys, and zoomed in.
