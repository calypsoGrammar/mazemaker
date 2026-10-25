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
`cell: null` and is closed. Triangle and polar cells list only their own
neighbours, so their set changes from cell to cell. A polar cell can have
several outward passages.

## Keyboard

The arrow keys and WASD, in either case, name an angle (`keyAngle`).
`pickDirection` picks the open direction nearest that angle, within
`DEFAULT_TOLERANCE` (60°). If two open directions are equally near, it picks
nothing. On a square grid every other direction is 90° away, so each key only
moves its own way, as before. On hex grids, Left and Right fall between two
diagonals. They move only when exactly one of the two is open.

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
- The pad shows the cell last reached. It is updated when the cell or the maze
  changes, not on every animation frame. When only `open` changes, the buttons
  are kept, so focus is too.
- The pad has `touch-action: manipulation`, so quick taps do not zoom the
  page. Its pointer, touch and wheel events stop at the pad.

## Canvas

The canvas has no input handlers. Tapping, dragging or scrolling the maze never
moves the player (`test/controller.test.js`). Canvas gestures added later,
such as pan or zoom, will not receive pad events.
