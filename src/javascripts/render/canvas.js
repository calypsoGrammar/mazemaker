// Canvas 2D renderer. It draws a scene from any geometry and only reads it:
// the maze, the player and the route are never changed by drawing.
//
// A scene is { maze, geometry, player, goal, path }: the maze to draw, the
// geometry of its topology, the player's and the goal's cells, and an optional
// list of cells to highlight. While the player moves, `player` can instead be
// { from, to, progress }: the marker is drawn `progress` (0 to 1) of the way
// from cell `from` to cell `to`.

import { Viewport } from './viewport.js';

export const DEFAULT_COLOURS = Object.freeze({
  wall: 'rgba(50, 50, 60, 1)',
  player: 'rgba(150, 250, 150, 1)',
  goal: 'rgba(250, 150, 150, 1)',
  path: 'rgba(46, 97, 113, 0.35)',
});

// Markers are the cell's outline shrunk towards its centre by this factor.
const MARKER_SCALE = 0.5;

export class CanvasRenderer
{
  #canvas;
  #ctx;
  #width = 0;
  #height = 0;
  #dpr = 1;
  #view = { zoom: 1, panX: 0, panY: 0 };
  #viewport = null;

  // `lineWidth` is the wall thickness in CSS pixels.
  constructor(canvas, { colours = DEFAULT_COLOURS, lineWidth = 1 } = {})
  {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.colours = { ...DEFAULT_COLOURS, ...colours };
    this.lineWidth = lineWidth;
  }

  // Sets the displayed size in CSS pixels and the device pixel ratio; the
  // backing store gets width * dpr x height * dpr pixels. Clears the canvas.
  resize(width, height, dpr = 1)
  {
    this.#width = width;
    this.#height = height;
    this.#dpr = dpr;
    this.#canvas.width = Math.floor(width * dpr);
    this.#canvas.height = Math.floor(height * dpr);
    this.#canvas.style.width = `${width}px`;
    this.#canvas.style.height = `${height}px`;
    this.#viewport = null;
  }

  // Zoom (1 = fit) and pan (CSS pixels) applied on the next render.
  setView({ zoom = this.#view.zoom, panX = this.#view.panX, panY = this.#view.panY } = {})
  {
    this.#view = { zoom, panX, panY };
    this.#viewport = null;
  }

  // The viewport of the last render, or null before the first; maps between
  // world units and CSS pixels.
  get viewport()
  {
    return this.#viewport;
  }

  viewportFor(geometry)
  {
    return new Viewport({
      bounds: geometry.bounds,
      width: this.#width,
      height: this.#height,
      dpr: this.#dpr,
      // Keeps the outer walls inside the canvas.
      padding: this.lineWidth,
      ...this.#view,
    });
  }

  render({ maze, geometry, player = null, goal = null, path = [] })
  {
    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    if(this.#width <= 0 || this.#height <= 0) return;

    const viewport = this.#viewport = this.viewportFor(geometry);
    ctx.setTransform(...viewport.matrix());

    if(path.length > 0)
    {
      ctx.fillStyle = this.colours.path;
      ctx.beginPath();
      for(const cell of path) tracePolygon(ctx, geometry.outline(cell));
      ctx.fill();
    }

    ctx.strokeStyle = this.colours.wall;
    ctx.lineWidth = this.lineWidth / viewport.scale;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    for(const cell of maze.topology.cells())
    {
      for(const { neighbour, points } of geometry.walls(cell))
      {
        // A shared side is drawn once, from the lower-numbered cell.
        if(neighbour !== null && (neighbour < cell || maze.isLinked(cell, neighbour))) continue;
        tracePolyline(ctx, points);
      }
    }
    ctx.stroke();

    if(goal !== null) this.#marker(geometry, goal, this.colours.goal);
    if(player === null) return;
    if(typeof player === 'object') this.#movingMarker(geometry, player, this.colours.player);
    else this.#marker(geometry, player, this.colours.player);
  }

  #marker(geometry, cell, colour)
  {
    this.#fill(markerPoints(geometry, cell), colour);
  }

  // Between two cells: when their markers have the same number of corners each
  // corner moves in a straight line, so the shape changes smoothly between the
  // cells' shapes; otherwise the `from` marker slides between the centres.
  #movingMarker(geometry, { from, to, progress }, colour)
  {
    const t = Math.min(Math.max(progress, 0), 1);
    const a = markerPoints(geometry, from);
    const b = markerPoints(geometry, to);
    let points;
    if(a.length === b.length) points = a.map((p, k) => lerp(p, b[k], t));
    else
    {
      const ca = geometry.centre(from);
      const cb = geometry.centre(to);
      const dx = (cb.x - ca.x) * t;
      const dy = (cb.y - ca.y) * t;
      points = a.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    this.#fill(points, colour);
  }

  #fill(points, colour)
  {
    const ctx = this.#ctx;
    ctx.fillStyle = colour;
    ctx.beginPath();
    tracePolygon(ctx, points);
    ctx.fill();
  }
}

// The cell's outline shrunk around its centre by MARKER_SCALE.
function markerPoints(geometry, cell)
{
  const c = geometry.centre(cell);
  return geometry.outline(cell).map((p) => ({
    x: c.x + (p.x - c.x) * MARKER_SCALE,
    y: c.y + (p.y - c.y) * MARKER_SCALE,
  }));
}

function lerp(a, b, t)
{
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function tracePolyline(ctx, points)
{
  ctx.moveTo(points[0].x, points[0].y);
  for(let k = 1; k < points.length; k++) ctx.lineTo(points[k].x, points[k].y);
}

function tracePolygon(ctx, points)
{
  tracePolyline(ctx, points);
  ctx.closePath();
}
