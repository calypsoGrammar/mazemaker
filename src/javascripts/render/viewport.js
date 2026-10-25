// Viewport: maps world units (a geometry's coordinates) to CSS pixels on the
// canvas and back. The world bounds are fitted inside the canvas with a margin,
// centred, then zoomed about the canvas centre and panned by CSS pixels.
// Viewports are immutable; with() returns a changed copy.

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
