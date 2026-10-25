// Desktop pan and zoom (CAL-1239 / MM-V1-10): wheel and trackpad zoom about
// the pointer, mouse drag pans, and the fit-to-screen button. None of it
// changes the maze, the player or the route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.js';
import { MAX_ZOOM } from '../src/javascripts/render/index.js';

const EPS = 1e-6;
const near = (p, q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;

async function largeGame() {
  const g = await loadGame({ seed: 3 });
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(40);
  g.click('SearchButton');
  return g;
}

const snapshot = (g) => ({
  maze: g.state.maze,
  passages: JSON.stringify(g.state.maze.passages()),
  player: g.state.player.cell,
  route: [...g.state.route],
  completed: g.state.completed,
});

function assertStateKept(g, before) {
  const now = snapshot(g);
  assert.equal(now.maze, before.maze);
  assert.equal(now.passages, before.passages);
  assert.equal(now.player, before.player);
  assert.deepEqual(now.route, before.route);
  assert.equal(now.completed, before.completed);
}

test('desktop: the wheel zooms in about the pointer and keeps the game state', async () => {
  const g = await largeGame();
  const before = snapshot(g);
  const focus = { x: 100, y: 300 };
  const world = g.view.toWorld(focus);
  g.drawCalls.length = 0;
  const event = g.wheel({ ...focus, deltaY: -300 });
  assert.equal(event.defaultPrevented, true, 'the page does not scroll');
  assert.ok(g.view.zoom > 1.5);
  assert.ok(near(g.view.toScreen(world), focus), 'the point under the pointer stays put');
  assert.ok(g.drawCalls.some(([n]) => n === 'stroke'), 'redrawn');
  assertStateKept(g, before);
});

test('desktop: trackpad pinch (ctrl + wheel) and line-mode wheels zoom too, within the limits', async () => {
  const g = await largeGame();
  g.wheel({ x: 200, y: 200, deltaY: -50, ctrlKey: true });
  assert.ok(g.view.zoom > 1);
  const z = g.view.zoom;
  g.wheel({ x: 200, y: 200, deltaY: -3, deltaMode: 1 });
  assert.ok(g.view.zoom > z);
  for (let k = 0; k < 50; k++) g.wheel({ x: 10, y: 10, deltaY: -500 });
  assert.equal(g.view.zoom, MAX_ZOOM);
  for (let k = 0; k < 50; k++) g.wheel({ x: 10, y: 10, deltaY: 500 });
  assert.equal(g.view.zoom, 1);
  assert.equal(g.view.panX, 0);
  assert.equal(g.view.panY, 0);
});

test('desktop: dragging with the main mouse button pans; other buttons do not', async () => {
  const g = await largeGame();
  const before = snapshot(g);
  g.wheel({ x: 216, y: 216, deltaY: -500 });
  const start = g.view;
  g.pointer('pointerdown', { pointerType: 'mouse', button: 2, x: 200, y: 200 });
  g.pointer('pointermove', { pointerType: 'mouse', x: 150, y: 150 });
  g.pointer('pointerup', { pointerType: 'mouse', x: 150, y: 150 });
  assert.equal(g.view.panX, start.panX);

  g.pointer('pointerdown', { pointerType: 'mouse', x: 200, y: 200 });
  g.pointer('pointermove', { pointerType: 'mouse', x: 170, y: 220 });
  g.pointer('pointerup', { pointerType: 'mouse', x: 170, y: 220 });
  assert.equal(g.view.panX, start.panX - 30);
  assert.equal(g.view.panY, start.panY + 20);
  // Moving the mouse without a button held does nothing.
  g.pointer('pointermove', { pointerType: 'mouse', x: 0, y: 0 });
  assert.equal(g.view.panX, start.panX - 30);
  assertStateKept(g, before);
});

test('desktop: keys still move the player while zoomed, and moving keeps the view', async () => {
  const g = await largeGame();
  g.wheel({ x: 50, y: 50, deltaY: -400 });
  const view = g.view;
  const [first] = g.state.maze.traversableLinks(0);
  g.key({ UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' }[first.label]);
  assert.equal(g.state.player.cell, first.cell);
  assert.equal(g.view.zoom, view.zoom);
  assert.equal(g.view.panX, view.panX);
  assert.equal(g.view.panY, view.panY);
});

test('desktop: fit to screen centres and fits the maze and keeps the game state', async () => {
  const g = await largeGame();
  g.wheel({ x: 20, y: 400, deltaY: -600 });
  g.pointer('pointerdown', { pointerType: 'mouse', x: 100, y: 100 });
  g.pointer('pointermove', { pointerType: 'mouse', x: 300, y: 50 });
  g.pointer('pointerup', { pointerType: 'mouse', x: 300, y: 50 });
  const before = snapshot(g);
  const button = g.document.getElementById('FitViewButton');
  assert.equal(button.getAttribute('aria-label'), 'Fit maze to screen');
  assert.match(button.querySelector('img').getAttribute('src'), /\.svg$/);
  g.drawCalls.length = 0;
  g.click('FitViewButton');
  const v = g.state.renderer.viewport;
  assert.equal(v.zoom, 1);
  assert.equal(v.panX, 0);
  assert.equal(v.panY, 0);
  // The 40 x 40 grid fills the canvas, less one pixel either side, centred.
  const side = 768 * 0.625 * 0.9;
  assert.ok(near(v.toScreen({ x: 0, y: 0 }), { x: 1, y: 1 }));
  assert.ok(near(v.toScreen({ x: 40, y: 40 }), { x: side - 1, y: side - 1 }));
  assert.ok(g.drawCalls.some(([n]) => n === 'stroke'));
  assertStateKept(g, before);
});

test('desktop: a resize keeps the zoom and limits the pan to the new size', async () => {
  const g = await largeGame();
  g.wheel({ x: 0, y: 0, deltaY: -400 });
  const zoom = g.view.zoom;
  g.resize(400, 300);
  assert.equal(g.view.zoom, zoom);
  assert.deepEqual(g.view.clamped(), g.view);
});

test('desktop: a new maze starts fitted to the screen', async () => {
  const g = await largeGame();
  g.wheel({ x: 0, y: 0, deltaY: -400 });
  g.click('NewMazeButton');
  assert.equal(g.view.zoom, 1);
  assert.equal(g.view.panX, 0);
  assert.equal(g.view.panY, 0);
});
