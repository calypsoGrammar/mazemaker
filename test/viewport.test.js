// Viewport pan, zoom and reset (CAL-1239): the viewport's limits, then the
// game on desktop (mouse wheel, trackpad, mouse drag) and on mobile (touch
// drag, pinch, direction pad), checked separately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Viewport } from '../src/javascripts/render/index.js';
import { loadGame } from './harness.js';

const near = (p, q, eps = 1e-6) => Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps;

// jsdom has no PointerEvent; a MouseEvent of the same type carries the fields.
function pointer(g, type, { id = 1, kind = 'touch', x, y, button = 0 }) {
  const event = new g.window.MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  Object.defineProperty(event, 'pointerType', { value: kind });
  return event;
}

function dispatch(g, target, type, options) {
  const event = pointer(g, type, options);
  target.dispatchEvent(event);
  return event;
}

// Drags one pointer on `target` from `from` to `to` in `steps` moves.
function drag(g, target, from, to, { id = 1, kind = 'touch', steps = 4 } = {}) {
  dispatch(g, target, 'pointerdown', { id, kind, ...from });
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    dispatch(g, target, 'pointermove', { id, kind, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  dispatch(g, target, 'pointerup', { id, kind, ...to });
}

// Two fingers on the canvas, moved from `a0`/`b0` to `a1`/`b1`.
function pinch(g, [a0, b0], [a1, b1], steps = 5) {
  const canvas = g.state.canvas;
  dispatch(g, canvas, 'pointerdown', { id: 1, ...a0 });
  dispatch(g, canvas, 'pointerdown', { id: 2, ...b0 });
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    dispatch(g, canvas, 'pointermove', { id: 1, x: a0.x + (a1.x - a0.x) * t, y: a0.y + (a1.y - a0.y) * t });
    dispatch(g, canvas, 'pointermove', { id: 2, x: b0.x + (b1.x - b0.x) * t, y: b0.y + (b1.y - b0.y) * t });
  }
  dispatch(g, canvas, 'pointerup', { id: 1, ...a1 });
  dispatch(g, canvas, 'pointerup', { id: 2, ...b1 });
}

function wheel(g, { x, y, deltaY, deltaMode = 0, ctrlKey = false }) {
  const event = new g.window.WheelEvent('wheel', { clientX: x, clientY: y, deltaY, deltaMode, ctrlKey, bubbles: true, cancelable: true });
  g.state.canvas.dispatchEvent(event);
  return event;
}

// Everything a gesture must leave alone.
function snapshot(g) {
  const { maze, player, route, exitCell, completed } = g.state;
  return { maze, passages: JSON.stringify(maze.passages()), cell: player.cell, moving: player.moving, route: [...route], exitCell, completed };
}

function assertStateKept(g, before, message) {
  const after = snapshot(g);
  assert.equal(after.maze, before.maze, message);
  assert.deepEqual({ ...after, maze: null }, { ...before, maze: null }, message);
  assert.equal(g.pendingFrames, 0, `${message}: no move started`);
}

async function bigGame(options) {
  const g = await loadGame({ seed: 3, ...options });
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(40);
  g.click('SearchButton');
  return g;
}

// VIEWPORT

const bounds = { minX: 0, minY: 0, maxX: 30, maxY: 30 };

test('viewport: zoomAt keeps the world point under the focus where it was', () => {
  const v = new Viewport({ bounds, width: 300, height: 300 });
  const focus = { x: 70, y: 210 };
  const world = v.toWorld(focus);
  const zoomed = v.zoomAt(3, focus);
  assert.equal(zoomed.zoom, 3);
  assert.ok(near(zoomed.toScreen(world), focus));
  const back = zoomed.zoomAt(1 / 1.5, { x: 150, y: 40 });
  assert.equal(back.zoom, 2);
  assert.ok(near(back.toScreen(zoomed.toWorld({ x: 150, y: 40 })), { x: 150, y: 40 }));
});

test('viewport: zoom stays between fit and a few cells across', () => {
  const v = new Viewport({ bounds, width: 300, height: 300 });
  assert.equal(v.maxZoom, 10);
  assert.equal(v.zoomAt(0.1, { x: 10, y: 10 }).zoom, 1);
  assert.equal(v.zoomAt(1e6, { x: 10, y: 10 }).zoom, 10);
  // Tiny mazes can still be zoomed a little.
  assert.equal(new Viewport({ bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 }, width: 300, height: 300 }).maxZoom, 2);
  assert.equal(v.zoomAt(NaN, { x: 10, y: 10 }).zoom, 1);
});

test('viewport: pan is limited so the maze keeps filling the canvas', () => {
  const v = new Viewport({ bounds, width: 300, height: 300, padding: 1 });
  // Fitted, there is nothing to pan.
  assert.deepEqual(v.panLimits, { x: 0, y: 0 });
  assert.equal(v.panBy(50, -50).panX, 0);
  const zoomed = v.with({ zoom: 4 });
  const { x, y } = zoomed.panLimits;
  // The fitted maze is 298 pixels wide inside the padding.
  assert.ok(Math.abs(x - (298 * 4 + 2 - 300) / 2) < 1e-9);
  assert.equal(x, y);
  const far = zoomed.panBy(1e6, -1e6);
  assert.equal(far.panX, x);
  assert.equal(far.panY, -y);
  // The maze's top-left corner (less padding) reaches the canvas's top-left corner, no further.
  assert.ok(near(far.toScreen({ x: 0, y: 30 }), { x: 1, y: 299 }));
  // Zooming out pulls the pan back in.
  assert.deepEqual(far.zoomAt(0.5, { x: 150, y: 150 }).panLimits.x, far.with({ zoom: 2 }).panLimits.x);
  assert.ok(Math.abs(far.zoomAt(0.5, { x: 150, y: 150 }).panX) <= far.with({ zoom: 2 }).panLimits.x);
  assert.equal(v.with({ zoom: 50, panX: 1e9 }).clamped().zoom, 10);
});

// DESKTOP

test('desktop: the wheel zooms about the pointer, without moving the player', async () => {
  const g = await bigGame();
  const before = snapshot(g);
  const focus = { x: 100, y: 250 };
  const world = g.state.renderer.viewport.toWorld(focus);
  const event = wheel(g, { ...focus, deltaY: -200 });
  assert.ok(event.defaultPrevented, 'the page does not scroll');
  const v = g.state.renderer.viewport;
  assert.ok(v.zoom > 1, 'zoomed in');
  assert.ok(near(v.toScreen(world), focus), 'the point under the pointer stays put');
  wheel(g, { ...focus, deltaY: 3, deltaMode: 1 });
  assert.ok(g.state.renderer.viewport.zoom < v.zoom, 'scrolling down zooms out');
  assertStateKept(g, before, 'wheel');
});

test('desktop: a trackpad pinch (ctrl + wheel) zooms, within the limits', async () => {
  const g = await bigGame();
  const before = snapshot(g);
  for (let k = 0; k < 200; k++) wheel(g, { x: 200, y: 200, deltaY: -30, ctrlKey: true });
  const v = g.state.renderer.viewport;
  assert.equal(v.zoom, v.maxZoom);
  for (let k = 0; k < 200; k++) wheel(g, { x: 10, y: 10, deltaY: 30, ctrlKey: true });
  assert.equal(g.state.renderer.viewport.zoom, 1);
  assert.equal(g.state.renderer.viewport.panX, 0);
  assert.equal(g.state.renderer.viewport.panY, 0);
  assertStateKept(g, before, 'trackpad');
});

test('desktop: a mouse drag pans the zoomed maze; other buttons do not', async () => {
  const g = await bigGame();
  wheel(g, { x: 200, y: 200, deltaY: -500 });
  const before = snapshot(g);
  const v = g.state.renderer.viewport;
  drag(g, g.state.canvas, { x: 200, y: 200 }, { x: 170, y: 220 }, { kind: 'mouse' });
  const panned = g.state.renderer.viewport;
  assert.ok(Math.abs(panned.panX - (v.panX - 30)) < 1e-9);
  assert.ok(Math.abs(panned.panY - (v.panY + 20)) < 1e-9);
  assert.equal(panned.zoom, v.zoom);
  dispatch(g, g.state.canvas, 'pointerdown', { kind: 'mouse', button: 2, x: 100, y: 100 });
  dispatch(g, g.state.canvas, 'pointermove', { kind: 'mouse', x: 0, y: 0 });
  assert.equal(g.state.renderer.viewport.panX, panned.panX);
  assertStateKept(g, before, 'mouse drag');
});

test('desktop: the keyboard still moves the player while zoomed, and the view stays', async () => {
  const g = await bigGame();
  wheel(g, { x: 50, y: 60, deltaY: -400 });
  const v = g.state.renderer.viewport;
  const [first] = g.state.maze.traversableLinks(0);
  const trail = g.key({ UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' }[first.label]);
  assert.equal(trail[1], first.cell);
  assert.equal(g.state.renderer.viewport.zoom, v.zoom);
  assert.equal(g.state.renderer.viewport.panX, v.panX);
});

test('desktop: Fit maze to screen centres and fits the maze; a new maze starts fitted', async () => {
  const g = await bigGame();
  const fitted = g.state.renderer.viewport;
  wheel(g, { x: 30, y: 30, deltaY: -600 });
  drag(g, g.state.canvas, { x: 100, y: 100 }, { x: 160, y: 140 }, { kind: 'mouse' });
  assert.notEqual(g.state.renderer.viewport.zoom, 1);
  const before = snapshot(g);
  const button = g.document.getElementById('ResetViewButton');
  assert.equal(button.getAttribute('aria-label'), 'Fit maze to screen');
  assert.match(button.querySelector('img').getAttribute('src'), /\.svg$/);
  g.click('ResetViewButton');
  const v = g.state.renderer.viewport;
  assert.deepEqual([v.zoom, v.panX, v.panY], [1, 0, 0]);
  assert.deepEqual(v.matrix(), fitted.matrix());
  const side = g.state.canvas.width;
  const { maxX, maxY } = g.state.geometry.bounds;
  const centre = v.toScreen({ x: maxX / 2, y: maxY / 2 });
  assert.ok(near(centre, { x: side / 2, y: side / 2 }), 'centred');
  assert.ok(near(v.toScreen({ x: 0, y: 0 }), { x: 1, y: 1 }), 'fitted, less the wall margin');
  assertStateKept(g, before, 'reset view');

  wheel(g, { x: 30, y: 30, deltaY: -600 });
  g.click('NewMazeButton');
  assert.equal(g.state.renderer.viewport.zoom, 1);
});

// MOBILE

const PHONE = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 };

test('mobile: a pinch zooms about the fingers, without moving the player', async () => {
  const g = await bigGame(PHONE);
  const before = snapshot(g);
  const mid = { x: 150, y: 120 };
  const world = g.state.renderer.viewport.toWorld(mid);
  pinch(g, [{ x: 140, y: 120 }, { x: 160, y: 120 }], [{ x: 110, y: 120 }, { x: 190, y: 120 }]);
  const v = g.state.renderer.viewport;
  assert.ok(Math.abs(v.zoom - 4) < 1e-9, `fingers four times as far apart: zoom ${v.zoom}`);
  assert.ok(near(v.toScreen(world), mid), 'the point between the fingers stays put');
  pinch(g, [{ x: 50, y: 50 }, { x: 250, y: 250 }], [{ x: 140, y: 140 }, { x: 160, y: 160 }]);
  assert.equal(g.state.renderer.viewport.zoom, 1, 'pinching in stops at fit');
  assertStateKept(g, before, 'pinch');
});

test('mobile: a one-finger drag pans, a pinch moving sideways pans too', async () => {
  const g = await bigGame(PHONE);
  pinch(g, [{ x: 140, y: 140 }, { x: 160, y: 140 }], [{ x: 120, y: 140 }, { x: 180, y: 140 }]);
  const before = snapshot(g);
  const v = g.state.renderer.viewport;
  drag(g, g.state.canvas, { x: 100, y: 100 }, { x: 60, y: 130 });
  const panned = g.state.renderer.viewport;
  assert.ok(Math.abs(panned.panX - (v.panX - 40)) < 1e-9);
  assert.ok(Math.abs(panned.panY - (v.panY + 30)) < 1e-9);
  // Both fingers moving together.
  pinch(g, [{ x: 100, y: 100 }, { x: 140, y: 100 }], [{ x: 120, y: 90 }, { x: 160, y: 90 }]);
  const slid = g.state.renderer.viewport;
  assert.ok(Math.abs(slid.zoom - panned.zoom) < 1e-9);
  assert.ok(Math.abs(slid.panX - (panned.panX + 20)) < 1e-9);
  assert.ok(Math.abs(slid.panY - (panned.panY - 10)) < 1e-9);
  assertStateKept(g, before, 'drag');
});

test('mobile: canvas touches are not passed on to the page', async () => {
  const g = await bigGame(PHONE);
  assert.ok(dispatch(g, g.state.canvas, 'pointerdown', { x: 10, y: 10 }).defaultPrevented);
  assert.ok(dispatch(g, g.state.canvas, 'pointermove', { x: 20, y: 10 }).defaultPrevented);
  dispatch(g, g.state.canvas, 'pointerup', { x: 20, y: 10 });
});

test('mobile: the direction pad moves the player and never pans', async () => {
  const g = await bigGame(PHONE);
  pinch(g, [{ x: 140, y: 140 }, { x: 160, y: 140 }], [{ x: 100, y: 140 }, { x: 200, y: 140 }]);
  const v = g.state.renderer.viewport;
  const [first] = g.state.maze.traversableLinks(0);
  const id = { UP: 'upButton', DOWN: 'downButton', LEFT: 'leftButton', RIGHT: 'rightButton' }[first.label];
  const button = g.document.getElementById(id);
  // A finger dragged across the pad, then a tap on it.
  drag(g, button, { x: 10, y: 10 }, { x: 200, y: 300 });
  g.click(id);
  const trail = g.settle();
  assert.equal(trail[1], first.cell, 'the tap moved the player');
  const after = g.state.renderer.viewport;
  assert.deepEqual([after.zoom, after.panX, after.panY], [v.zoom, v.panX, v.panY]);
});

test('mobile: rotating keeps the zoom, the maze and the player; the pan stays in bounds', async () => {
  const g = await bigGame(PHONE);
  pinch(g, [{ x: 140, y: 140 }, { x: 160, y: 140 }], [{ x: 60, y: 140 }, { x: 240, y: 140 }]);
  drag(g, g.state.canvas, { x: 100, y: 100 }, { x: 900, y: 900 });
  const before = snapshot(g);
  const zoom = g.state.renderer.viewport.zoom;
  g.resize(844, 390, 3);
  const v = g.state.renderer.viewport;
  assert.equal(v.zoom, zoom);
  assert.ok(Math.abs(v.panX) <= v.panLimits.x + 1e-9);
  assert.ok(Math.abs(v.panY) <= v.panLimits.y + 1e-9);
  assertStateKept(g, before, 'resize');
});
