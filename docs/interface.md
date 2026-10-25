# Interface (CAL-1243 / MM-V1-14)

The page is the maze, the direction pad and one row of icons. There are no
titles, instructions or labels in play. Settings are behind one icon.

## Toolbar

`#toolbar` is a `<nav>` across the top (7.5 vh, at least 44 px; see
`docs/rendering.md`, Resizing). Every action is a `.tool`
button with an inline 24 × 24 SVG line icon drawn in `currentColor`, an
`aria-label` for screen readers and a matching `title` as a hover hint. Left to
right, in three groups:

| Button | Icon | Does |
|---|---|---|
| `ResetButton` "Restart maze" | arrow turning back | Restarts the current layout. |
| `NewMazeButton` "New maze" | crossing arrows | A new layout with the shape, mode and size in play. |
| `SearchButton` "Show route" | path between two dots | Shows the route to the exit, or hides it. `aria-pressed`. |
| `ControllerButton` "Movement controls" | cross | Shows or hides the direction pad. `aria-pressed`. |
| `ResetViewButton` "Fit maze to screen" | four corners | Fits and centres the maze (`docs/rendering.md`). |
| `OptionsButton` "Settings" | sliders | Opens or closes the settings. `aria-expanded`. |

States are the same for every button:

- hover: light grey background;
- keyboard focus (`:focus-visible`): a dark 2 px ring, 2 px out from the
  button behind a white gap, so it also shows around a filled button;
- pressed toggle or open panel: dark background, white icon, a lighter dark
  grey on hover.

Focus outlines are made transparent, never removed, so forced-colours (high
contrast) mode, which drops the ring, still draws an outline.

Only colours change, over 150 ms (none with `prefers-reduced-motion`). There
are no shadows, gradients, scaling or animations. The toolbar is never shorter
than 44 px, so its buttons stay 40 px squares. With `prefers-reduced-motion`
the player's moves are not animated either (`docs/model.md`).

The route is hidden again by Restart and by every new maze, as before; the
button's pressed state follows it.

## Settings

`#settingsMenu` is a small panel under the toolbar, closed on load. The maze
stays visible around it. It holds short labels and native controls:

| Label | Control | Values |
|---|---|---|
| Shape | `#mazeShape` | Square, Hexagon, Triangle, Circle |
| Mode | `#mazeMode` | Mixed (default), Winding (`newest`), Fanning (`oldest`), Branching (`random`): the growing-tree strategies of `docs/model.md` |
| Size | `#display001` | 2 to 50 |
| Auto-new | `#autonew` | on |
| Auto-increment | `#autoincrement` | on |

**Generate** applies shape, mode and size. New maze, Restart, Auto-new and
Auto-increment keep the mode, as they keep the shape. Escape closes the panel
without applying it and puts focus back on the settings button. Movement keys
still do nothing while it is open.

## Completion

With Auto-new off, a win shows `#completeBanner`: a check mark and icon
buttons to restart or start a new maze. "Maze complete" is read out
(`role="status"`) but not shown.

## Colours

White page, near-black walls (`rgba(23, 23, 23)`), a blue player
(`rgba(37, 99, 235)`), an orange goal (`rgba(249, 115, 22)`) and a pale blue
route. Blue and orange differ in hue and lightness, so the markers stay
distinct for common colour-vision deficiencies. The pad uses the same greys
as the toolbar. All shapes use the same colours, markers and toolbar.

## Tests

`test/interface.test.js` checks that the default view shows no text, that
every toolbar action is a named SVG icon button, the toggle states, the
settings controls and Escape, the generator mode, the colours, that every
shape gets the same toolbar and colours, and that the markup and stylesheet
have no shadows, gradients or animations. Nothing was checked in a real
browser: the run had none, so how it looks still needs a person to confirm.
