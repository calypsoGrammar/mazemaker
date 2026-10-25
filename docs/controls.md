# Controls (CAL-1238 / MM-V1-09)

Input lives in `src/javascripts/input/`. It turns a directional command into a
topology label. The move itself is `player.Move(label)` in `main.js`, which
runs the corridor engine (`docs/model.md`, `corridor`). Keys and the on-screen
pad both go through it.

| Part | Where | Does |
|---|---|---|
| Adapter | `input/adapter.js` | Works out a cell's directions from its geometry, and maps a visual angle to an open passage. |
| Pad | `input/pad.js` (`DirectionPad`) | Draws an SVG button for each direction and reports the label chosen. |

## Directions of a cell

`directionsAt(maze, geometry, cell)` lists `{ label, cell, angle, open }` for
each direction. `angle` is the way the shared side faces from the cell's
centre. It is in radians, like `Math.atan2`, with y pointing down, so up is
−π/2. `open` is true when a passage leads that way.

Square and hex cells always have the same set of directions
(`DIRECTION_FRAMES`). For these tilings the list always holds the full set, in
a fixed order, so the pad buttons stay in place. A direction off the edge has
`cell: null` and is closed. Triangles (CAL-1241) have one set for each
orientation (`TRIANGLE_FRAMES`): `LEFT`, `RIGHT` and `DOWN` for a cell
pointing up, `LEFT`, `RIGHT` and `UP` for a cell pointing down, always all
three. Polar cells (CAL-1242) list only their own neighbours, so their set
changes from cell to cell. A polar cell can have several outward passages.

## Keyboard

`keyCommand(key, kind)` turns a key into a command for the grid in play, and
`chooseDirection(directions, command)` applies it. Most commands are
`{ angle, tolerance }`: `pickDirection` picks the open direction nearest that
angle, within the tolerance. If two open directions are equally near, it
picks nothing. Polar commands are `{ match }` instead (see below).

On square grids, the arrow keys and WASD, in either
case, name an angle (`keyAngle`) with `DEFAULT_TOLERANCE` (60°). On a square
grid every other direction is 90° away, so each key only moves its own way,
as before.

On triangle grids (CAL-1241) the same keys use `EXACT_TOLERANCE` (30°). Left
and Right take the cell's left or right side, which faces 30° above or below
level. Up takes the level side of a cell pointing down, and Down the level
side of a cell pointing up. Up on a cell pointing up (or Down on one pointing
down) does nothing: it never moves through a slanted side.

On hex grids (CAL-1240), six-way keys (`HEX_KEYS`) each name one side of the
hexagon, with `EXACT_TOLERANCE` (30°, half the angle between sides). A key
moves through its own side only, never through the side next to it:

| Side | Keys |
|---|---|
| N | `W`, Up, `8` |
| NE | `E`, `9`, PageUp |
| SE | `D`, `3`, PageDown |
| S | `S`, Down, `2` |
| SW | `A`, `1`, End |
| NW | `Q`, `7`, Home |

`Q W E` over `A S D` are laid out like the hexagon's sides, as are `7 8 9`
over `1 2 3` on the numeric keypad (Home, PageUp, End, PageDown with Num Lock
off). Left and Right fall between two diagonals, at 60° tolerance. They move
only when exactly one of the two is open.

On polar grids (CAL-1242) the keys name a way along the rings, not a screen
angle (`POLAR_KEYS`). A cell's directions turn as the player goes round, and
at 45° around the circle a screen-angle key would fall exactly between two
directions. A `{ match }` command takes the one open direction whose label it
matches, and nothing when none or several match:

| Direction | Keys |
|---|---|
| `OUT…` (outward) | `W`, Up: only when exactly one outward passage is open |
| `OUT0` … `OUT8` | `1` … `9`: outward passage 1 to 9, numbered clockwise |
| `IN` (inward) | `S`, Down |
| `CCW` (anticlockwise) | `A`, Left |
| `CW` (clockwise) | `D`, Right |

So where a cell opens onto two outward cells, Up does nothing and `1` and `2`
take one each; the game never picks between them.

## Pad

`#directionPad` is an `<svg>` in `#footerControls`. It has a 200 × 200
`viewBox` and scales to fit the footer, up to 300 px. Each direction gets a
round button at its angle, with a chevron pointing that way. Directions closer
than 60° apart (or an equal share of the circle, with more than six) are
spread out (`layoutAngles`), so buttons never overlap. The chevron still shows
the true direction. Buttons shrink as the set grows, so they always fit
inside the pad.

- Buttons have `role="button"` and `aria-label` (for example "Move
  north-west"). The ID is the label in lower case plus `Button`, so square
  grids keep `upButton`, `downButton`, `leftButton` and `rightButton`.
- A closed direction is shown faded, with `aria-disabled="true"`, and is not in
  the tab order. Tapping it does nothing.
- An open button moves on a tap/click, or on Enter or Space when focused.
- When the buttons are rebuilt while one has focus (triangles and circles,
  whose sets change as the player moves), focus moves to the new button for
  the same direction if it is open, or else to the first open one. So
  keyboard play on the pad never drops focus to the page (CAL-1244).
- The pad shows the cell last reached. It is updated when the cell or the maze
  changes, not on every animation frame. When only `open` changes, the buttons
  are kept, so focus is too.
- The pad has `touch-action: manipulation`, so quick taps do not zoom the
  page. Its pointer, touch and wheel events stop at the pad.

## Canvas

The canvas only pans and zooms (`docs/rendering.md`). Tapping, dragging,
pinching or scrolling the maze never moves the player, on any shape
(`test/controller.test.js`, `test/viewport.test.js`, `test/release.test.js`),
and pad events never reach the canvas.
