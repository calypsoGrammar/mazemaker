# Rendering (CAL-1235 / MM-V1-06)

Drawing lives in `src/javascripts/render/` and is separate from the game state
in `main.js`. It has three parts:

| Part | Where | Knows about |
|---|---|---|
| Geometry | `render/geometry.js` | Where a topology's cells are, in world units. |
| Viewport | `render/viewport.js` (`Viewport`) | World units ↔ CSS pixels, device pixel ratio, zoom and pan. |
| Renderer | `render/canvas.js` (`CanvasRenderer`) | The Canvas 2D context. It draws a scene and only reads it. |

`main.js` keeps the topology, maze, player, exit and route. Each change of
state calls `Draw()`, which passes them to the renderer as a scene.

## Geometry

`geometryFor(topology)` picks the layout for `topology.kind` from
`geometries`. There are layouts for all four topologies: `square`, `hex`,
`triangle` and `polar`. A geometry has:

- `bounds`: `{ minX, minY, maxX, maxY }` enclosing every cell;
- `centre(cell)`: a point inside the cell, where markers go;
- `outline(cell)`: the cell's boundary as a closed list of `{ x, y }` points;
- `walls(cell)`: one `{ neighbour, points }` per side. `neighbour` is the cell
  on the other side, or `null` on the outer edge. `points` is the side as a
  polyline, so polar arcs work as well as straight edges.

Every topology neighbour has exactly one side, and both cells give the same
points for it. The y axis points down. Square cells are unit squares at
(column, row). Hexagons and triangles have unit sides. Polar ring *k* lies
between radius *k* and *k* + 1 around the origin. A new topology adds a
factory to `geometries`.

## Renderer

```js
const renderer = new CanvasRenderer(canvas, { colours, lineWidth });
renderer.resize(cssWidth, cssHeight, devicePixelRatio);
renderer.render({ maze, geometry, player, goal, path });
renderer.setView({ zoom, panX, panY });  // used on the next render
renderer.viewport;                        // the Viewport of the last render
```

`resize` sets the canvas's CSS size and gives it a backing store of
`size × devicePixelRatio` pixels, so walls stay sharp on high-DPI screens.
`render` fits the geometry's bounds into the canvas with a margin of one wall
width and draws, in order:

1. the path cells, filled;
2. every closed wall, once, one CSS pixel wide at any scale;
3. the goal, then the player, as the cell's outline shrunk to half size
   around its centre. On the square grid these are the same half-cell
   squares as before.

The renderer never calls `link` or `unlink`, and it does not change the scene
it is given. The tests check this with a maze that throws on any change.

## Viewport

`new Viewport({ bounds, width, height, dpr, padding, zoom, panX, panY })`
fits `bounds` into `width × height` CSS pixels less `padding`, centres it,
then zooms about the canvas centre and pans by CSS pixels. `toScreen` and
`toWorld` convert points, and `matrix()` gives the world → backing-store
transform for `ctx.setTransform`. Viewports are immutable, and `with({...})`
returns a changed copy.

`clamped()` keeps a view within limits: zoom from `MIN_ZOOM` (1, the fitted
view) to `MAX_ZOOM` (8), and pan only until an edge of the bounds reaches the
matching padded edge of the canvas, so at zoom 1 the maze is always centred.
`pannedBy(dx, dy)` and `zoomedAt(factor, point)` return clamped copies;
`zoomedAt` keeps the world point under `point` in place. `reset()` is the
fitted, centred view.

## Pan and zoom (CAL-1239 / MM-V1-10)

`attachViewGestures(canvas, { getViewport, setView })` in
`render/gestures.js` listens for pointer and wheel events on the canvas only:

- one finger, or the main mouse button, drags the view;
- two fingers pinch to zoom about their midpoint and pan as it moves;
- the mouse wheel and trackpad gestures zoom about the pointer.

The canvas has `touch-action: none`, so the browser does not scroll or zoom
the page under these gestures. Gestures only call `renderer.setView` and
redraw; they never move the player. The direction pad is outside the canvas,
so touching it never pans. The *Fit maze to screen* button in the header
resets the view. A new maze starts fitted; restarting, moving and searching
keep the view. On a resize the zoom is kept and the pan is limited again.

## Resizing

On a window `resize`, on hiding or showing the pad, and when
`devicePixelRatio` changes (a `matchMedia` resolution query, for example after
moving to another screen), `main.js` resizes the canvas and redraws. The maze,
the player's cell and the route are kept. The canvas is still a square with a
side of 90% of the smaller of the window width and the game-area height.

## Changes in the game

The square game looks as before, with two exceptions. Walls are now sharp on
high-DPI screens (baseline defect 8). The outer border is drawn inside a
one-pixel margin, where before it was drawn twice along the canvas edge to
make it the same width as the other walls. The UI still only makes square
mazes.
