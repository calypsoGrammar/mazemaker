// Viewport: maps world units (a geometry's coordinates) to CSS pixels on the
// canvas and back. The world bounds are fitted inside the canvas with a margin,
// centred, then zoomed about the canvas centre and panned by CSS pixels.
// Viewports are immutable; with() returns a changed copy.

// Zoom limits, relative to the fitted view: never smaller than fit, and at
// most this many times larger.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

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

  // The view (zoom and pan) is kept within limits: zoom from MIN_ZOOM to
  // MAX_ZOOM, and pan only as far as brings an edge of the bounds to the
  // matching padded edge of the canvas. At zoom 1 the bounds fit, so the pan
  // is 0 and the bounds are centred.
  clamped()
  {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom));
    const view = zoom === this.zoom ? this : this.with({ zoom });
    const { bounds, width, height, padding, scale } = view;
    const maxPanX = Math.max(0, ((bounds.maxX - bounds.minX) * scale - Math.max(0, width - 2 * padding)) / 2);
    const maxPanY = Math.max(0, ((bounds.maxY - bounds.minY) * scale - Math.max(0, height - 2 * padding)) / 2);
    // + 0 turns -0 into 0.
    const panX = Math.min(maxPanX, Math.max(-maxPanX, view.panX)) + 0;
    const panY = Math.min(maxPanY, Math.max(-maxPanY, view.panY)) + 0;
    return Object.is(panX, view.panX) && Object.is(panY, view.panY) ? view : view.with({ panX, panY });
  }

  // Moved by (dx, dy) CSS pixels, within the limits.
  pannedBy(dx, dy)
  {
    return this.with({ panX: this.panX + dx, panY: this.panY + dy }).clamped();
  }

  // Zoomed by `factor` about a point in CSS pixels, which keeps the world
  // point under it in place unless a limit is reached.
  zoomedAt(factor, { x, y })
  {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const ratio = zoom / this.zoom;
    // Relative to the zoom centre: the canvas centre moved by the pan.
    const cx = this.width / 2 + this.panX;
    const cy = this.height / 2 + this.panY;
    return this.with({
      zoom,
      panX: this.panX + (x - cx) * (1 - ratio),
      panY: this.panY + (y - cy) * (1 - ratio),
    }).clamped();
  }

  // The fitted, centred view.
  reset()
  {
    return this.with({ zoom: 1, panX: 0, panY: 0 });
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
