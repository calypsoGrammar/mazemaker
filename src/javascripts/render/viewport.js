// Viewport: maps world units (a geometry's coordinates) to CSS pixels on the
// canvas and back. The world bounds are fitted inside the canvas with a margin,
// centred, then zoomed about the canvas centre and panned by CSS pixels.
// Viewports are immutable; with() returns a changed copy.
//
// zoomAt() and panBy() are for pan and zoom input. They keep the zoom between
// 1 (the whole maze fits) and maxZoom, and the pan within panLimits, so the
// maze always fills the canvas once it is larger than it.

// Zooming in stops when this many world units (cells) span the canvas.
const MIN_UNITS_ACROSS = 3;
// The furthest zoom allowed for any maze, however small.
const MIN_MAX_ZOOM = 2;

export class Viewport
{
  constructor({ bounds, width, height, dpr = 1, padding = 0, zoom = 1, panX = 0, panY = 0 })
  {
    if(!(width > 0) || !(height > 0)) throw new RangeError(`viewport size must be positive, got ${width}x${height}`);
    if(!(dpr > 0)) throw new RangeError(`device pixel ratio must be positive, got ${dpr}`);
    if(!(zoom > 0)) throw new RangeError(`zoom must be positive, got ${zoom}`);
    Object.assign(this, { bounds, width, height, dpr, padding, zoom, panX, panY });
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    const fit = Math.min(
      Math.max(0, width - 2 * padding) / worldWidth,
      Math.max(0, height - 2 * padding) / worldHeight,
    );
    // CSS pixels per world unit.
    this.scale = fit * zoom;
    this.offsetX = width / 2 + panX - ((bounds.minX + bounds.maxX) / 2) * this.scale;
    this.offsetY = height / 2 + panY - ((bounds.minY + bounds.maxY) / 2) * this.scale;
    Object.freeze(this);
  }

  with(changes)
  {
    return new Viewport({ ...this, ...changes });
  }

  // The largest zoom: MIN_UNITS_ACROSS world units across the longer side of
  // the bounds, and never less than MIN_MAX_ZOOM.
  get maxZoom()
  {
    const longest = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxY - this.bounds.minY);
    return Math.max(MIN_MAX_ZOOM, longest / MIN_UNITS_ACROSS);
  }

  // The largest pan, in CSS pixels, either way along each axis: how far the
  // drawn bounds (with their padding) overhang the canvas on each side.
  get panLimits()
  {
    const overhang = (worldSize, size) => Math.max(0, (worldSize * this.scale + 2 * this.padding - size) / 2);
    return {
      x: overhang(this.bounds.maxX - this.bounds.minX, this.width),
      y: overhang(this.bounds.maxY - this.bounds.minY, this.height),
    };
  }

  // This viewport with its zoom and pan brought within their limits.
  clamped()
  {
    const zoom = Math.min(Math.max(this.zoom, 1), this.maxZoom);
    const zoomed = zoom === this.zoom ? this : this.with({ zoom });
    const { x, y } = zoomed.panLimits;
    const panX = Math.min(Math.max(zoomed.panX, -x), x);
    const panY = Math.min(Math.max(zoomed.panY, -y), y);
    return panX === zoomed.panX && panY === zoomed.panY ? zoomed : zoomed.with({ panX, panY });
  }

  // Zooms by `factor` about `focus` (CSS pixels): the world point under it
  // stays put unless a limit is reached.
  zoomAt(factor, focus)
  {
    if(!(factor > 0)) return this.clamped();
    const anchor = this.toWorld(focus);
    const zoom = Math.min(Math.max(this.zoom * factor, 1), this.maxZoom);
    const zoomed = this.with({ zoom });
    const moved = zoomed.toScreen(anchor);
    return zoomed.with({ panX: zoomed.panX + focus.x - moved.x, panY: zoomed.panY + focus.y - moved.y }).clamped();
  }

  // Pans by (dx, dy) CSS pixels, within the limits.
  panBy(dx, dy)
  {
    return this.with({ panX: this.panX + dx, panY: this.panY + dy }).clamped();
  }

  // World point -> CSS pixels from the canvas's top-left corner.
  toScreen({ x, y })
  {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  // CSS pixels -> world point; for pointer input.
  toWorld({ x, y })
  {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  // The world -> backing-store transform, as arguments for ctx.setTransform().
  matrix()
  {
    const s = this.scale * this.dpr;
    return [s, 0, 0, s, this.offsetX * this.dpr, this.offsetY * this.dpr];
  }
}
