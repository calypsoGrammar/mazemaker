// Viewport pan and zoom limits (CAL-1239 / MM-V1-10): the view arithmetic
// behind drag, pinch, wheel and fit-to-screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Viewport, MIN_ZOOM, MAX_ZOOM } from '../src/javascripts/render/index.js';

const EPS = 1e-9;
const near = (p, q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
const fitted = () => new Viewport({ bounds, width: 200, height: 200, padding: 0 });

test('zooming keeps the world point under the focus in place', () => {
  const v = fitted();
  for (const focus of [{ x: 100, y: 100 }, { x: 30, y: 170 }, { x: 0, y: 0 }]) {
    const world = v.toWorld(focus);
    const zoomed = v.zoomedAt(2.5, focus);
    assert.equal(zoomed.zoom, 2.5);
    assert.ok(near(zoomed.toScreen(world), focus), `focus ${focus.x},${focus.y}`);
    // And again from a zoomed, panned view.
    const p = zoomed.pannedBy(-20, 15);
    const w2 = p.toWorld({ x: 120, y: 60 });
    assert.ok(near(p.zoomedAt(1.5, { x: 120, y: 60 }).toScreen(w2), { x: 120, y: 60 }));
  }
});

test('zoom stays between fit and the maximum', () => {
  const v = fitted();
  assert.equal(v.zoomedAt(0.25, { x: 50, y: 50 }).zoom, MIN_ZOOM);
  assert.equal(v.zoomedAt(1000, { x: 50, y: 50 }).zoom, MAX_ZOOM);
  assert.equal(v.with({ zoom: 0.1 }).clamped().zoom, MIN_ZOOM);
  assert.equal(v.with({ zoom: 99 }).clamped().zoom, MAX_ZOOM);
});

test('at fit the maze cannot be panned away; zoomed, it pans only to its edges', () => {
  const v = fitted();
  const still = v.pannedBy(80, -40);
  assert.equal(still.panX, 0);
  assert.equal(still.panY, 0);

  const zoomed = v.with({ zoom: 4 });
  // 800 px of maze in a 200 px canvas: 300 px either way.
  const far = zoomed.pannedBy(10000, -10000);
  assert.equal(far.panX, 300);
  assert.equal(far.panY, -300);
  assert.equal(far.toScreen({ x: 0, y: 0 }).x, 0, 'left edge of the maze at the left of the canvas');
  assert.equal(far.toScreen({ x: 10, y: 10 }).y, 200, 'bottom edge at the bottom of the canvas');

  // Zooming out pulls a far pan back within the limits.
  const out = far.zoomedAt(0.5, { x: 0, y: 0 });
  assert.equal(out.zoom, 2);
  assert.ok(Math.abs(out.panX) <= 100 && Math.abs(out.panY) <= 100);
});

test('the padding is the margin for panning, and a narrow maze stays centred across', () => {
  const v = new Viewport({ bounds: { minX: 0, minY: 0, maxX: 2, maxY: 10 }, width: 200, height: 200, padding: 5, zoom: 2 });
  const far = v.pannedBy(-1000, -1000);
  assert.equal(far.toScreen({ x: 0, y: 10 }).y, 195);
  // 2 x 10 at 19 px per unit, doubled: 76 px wide, narrower than the canvas.
  assert.equal(far.panX, 0);
});

test('reset returns to the fitted, centred view', () => {
  const v = fitted().zoomedAt(3, { x: 10, y: 10 }).pannedBy(40, 40).reset();
  assert.equal(v.zoom, 1);
  assert.equal(v.panX, 0);
  assert.equal(v.panY, 0);
  assert.ok(near(v.toScreen({ x: 5, y: 5 }), { x: 100, y: 100 }));
});
