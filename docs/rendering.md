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

While the player moves (CAL-1237), `player` is `{ from, to, progress }`
instead of a cell. The marker is drawn `progress` (0 to 1) of the way from
`from` to `to`. When both cells' markers have the same number of corners,
each corner moves in a straight line. Otherwise, the `from` marker slides
between the two centres.

The renderer never calls `link` or `unlink`, and it does not change the scene
it is given. The tests check this with a maze that throws on any change.

## Viewport

`new Viewport({ bounds, width, height, dpr, padding, zoom, panX, panY })`
fits `bounds` into `width × height` CSS pixels less `padding`, centres it,
then zooms about the canvas centre and pans by CSS pixels. `toScreen` and
`toWorld` convert points, and `matrix()` gives the world → backing-store
transform for `ctx.setTransform`. Viewports are immutable, and `with({...})`
returns a changed copy.

For input, `zoomAt(factor, point)` zooms about a point in CSS pixels, keeping
the world point under it in place, and `panBy(dx, dy)` pans. Both return a
viewport that is `clamped()`:

- the zoom stays between 1 (the whole maze fits) and `maxZoom`, where three
  world units (cells) span the canvas, and at least 2;
- the pan stays within `panLimits`, so once the maze is larger than the
  canvas it keeps filling it, and at zoom 1 the maze stays centred.

## Pan, zoom and reset (CAL-1239 / MM-V1-10)

`attachViewGestures(canvas, { viewport, change })` in `render/gestures.js`
listens on the canvas only:

| Input | Effect |
|---|---|
| One finger or the left mouse button, dragged | Pans. |
| Two fingers | Pinch zooms about their midpoint; moving both pans. |
| Mouse wheel | Zooms about the pointer. |
| Trackpad pinch (a wheel event with `ctrlKey`) | Zooms about the pointer, more quickly per pixel. |

`main.js` passes the renderer's viewport for the current geometry and, on each
change, calls `renderer.setView` and redraws. Gestures never call
`player.Move`, and the direction pad has no gesture listeners, so it never
pans. The canvas has `touch-action: none` so the page does not scroll or zoom
under a gesture.

The **Fit maze to screen** button (`fitLight.svg`, at the end of the header)
sets zoom 1 and no pan: the maze is centred and fitted. A new maze also starts
fitted. Restart keeps the view. Resizing keeps the zoom and brings the pan
within the new limits. None of these change the maze, the player or the route.

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
