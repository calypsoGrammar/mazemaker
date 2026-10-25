// Mobile pan and zoom (CAL-1239 / MM-V1-10): one finger drags the view, two
// fingers pinch, and neither moves the player; touching the direction pad
// moves the player and never pans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGame } from './harness.js';

const EPS = 1e-6;
const near = (p, q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
const PAD = { UP: 'upButton', DOWN: 'downButton', LEFT: 'leftButton', RIGHT: 'rightButton' };

// A phone-sized window: the canvas is 351 CSS pixels square.
async function phoneGame() {
  const g = await loadGame({ seed: 4, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 });
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(50);
  g.click('SearchButton');
  return g;
}

const snapshot = (g) => ({
  maze: g.state.maze,
  passages: JSON.stringify(g.state.maze.passages()),
  player: g.state.player.cell,
  route: [...g.state.route],
});

function assertStateKept(g, before) {
  const now = snapshot(g);
  assert.equal(now.maze, before.maze);
  assert.equal(now.passages, before.passages);
  assert.equal(now.player, before.player);
  assert.deepEqual(now.route, before.route);
}

function pinch(g, [a0, b0], [a1, b1]) {
  g.pointer('pointerdown', { pointerId: 1, ...a0 });
  g.pointer('pointerdown', { pointerId: 2, ...b0 });
  g.pointer('pointermove', { pointerId: 1, ...a1 });
  g.pointer('pointermove', { pointerId: 2, ...b1 });
  g.pointer('pointerup', { pointerId: 1, ...a1 });
  g.pointer('pointerup', { pointerId: 2, ...b1 });
}

test('mobile: pinching out zooms about the fingers and does not move the player', async () => {
  const g = await phoneGame();
  const before = snapshot(g);
  const mid = { x: 120, y: 200 };
  const world = g.view.toWorld(mid);
  // Fingers 40 px apart spread to 160 px apart, about the same midpoint.
  pinch(g, [{ x: 100, y: 200 }, { x: 140, y: 200 }], [{ x: 40, y: 200 }, { x: 200, y: 200 }]);
  assert.ok(Math.abs(g.view.zoom - 4) < EPS);
  assert.ok(near(g.view.toScreen(world), mid), 'the point between the fingers stays put');
  assertStateKept(g, before);
  // Pinching back in returns to fit.
  pinch(g, [{ x: 40, y: 200 }, { x: 200, y: 200 }], [{ x: 100, y: 200 }, { x: 140, y: 200 }]);
  assert.ok(Math.abs(g.view.zoom - 1) < EPS);
});

test('mobile: a one-finger drag pans the zoomed maze and does not move the player', async () => {
  const g = await phoneGame();
  pinch(g, [{ x: 150, y: 150 }, { x: 200, y: 200 }], [{ x: 100, y: 100 }, { x: 250, y: 250 }]);
  const before = snapshot(g);
  const start = g.view;
  const down = g.pointer('pointerdown', { x: 200, y: 200 });
  assert.equal(down.defaultPrevented, true);
  g.pointer('pointermove', { x: 180, y: 230 });
  g.pointer('pointermove', { x: 160, y: 240 });
  g.pointer('pointerup', { x: 160, y: 240 });
  assert.ok(Math.abs(g.view.panX - (start.panX - 40)) < EPS);
  assert.ok(Math.abs(g.view.panY - (start.panY + 40)) < EPS);
  assertStateKept(g, before);
  // Large mazes are inspectable: cells are bigger than at fit.
  assert.ok(g.view.scale > 2 * g.view.reset().scale);
});

test('mobile: a drag at fit leaves the maze centred, and a cancelled touch stops panning', async () => {
  const g = await phoneGame();
  g.pointer('pointerdown', { x: 100, y: 100 });
  g.pointer('pointermove', { x: 300, y: 10 });
  assert.equal(g.view.panX, 0);
  assert.equal(g.view.panY, 0);
  g.pointer('pointercancel', { x: 300, y: 10 });

  pinch(g, [{ x: 150, y: 150 }, { x: 200, y: 200 }], [{ x: 100, y: 100 }, { x: 250, y: 250 }]);
  const pan = g.view.panX;
  g.pointer('pointermove', { x: 0, y: 0 });
  assert.equal(g.view.panX, pan, 'lifted fingers do not pan');
});

test('mobile: the direction pad moves the player and never pans or zooms', async () => {
  const g = await phoneGame();
  pinch(g, [{ x: 150, y: 150 }, { x: 200, y: 200 }], [{ x: 100, y: 100 }, { x: 250, y: 250 }]);
  const view = g.view;
  const [first] = g.state.maze.traversableLinks(0);
  const id = PAD[first.label];
  // A finger on the pad: press, slide and release, then the click.
  g.pointer('pointerdown', { id, pointerId: 7, x: 10, y: 10 });
  g.pointer('pointermove', { id, pointerId: 7, x: 90, y: 60 });
  g.pointer('pointerup', { id, pointerId: 7, x: 90, y: 60 });
  g.click(id);
  assert.equal(g.state.player.cell, first.cell);
  assert.equal(g.view.zoom, view.zoom);
  assert.equal(g.view.panX, view.panX);
  assert.equal(g.view.panY, view.panY);
});

test('mobile: fit to screen after pinching and dragging centres and fits the maze', async () => {
  const g = await phoneGame();
  pinch(g, [{ x: 150, y: 150 }, { x: 200, y: 200 }], [{ x: 50, y: 50 }, { x: 300, y: 300 }]);
  g.pointer('pointerdown', { x: 100, y: 100 });
  g.pointer('pointermove', { x: 300, y: 300 });
  g.pointer('pointerup', { x: 300, y: 300 });
  const before = snapshot(g);
  g.click('FitViewButton');
  const v = g.state.renderer.viewport;
  const side = 390 * 0.9;
  assert.ok(near(v.toScreen({ x: 25, y: 25 }), { x: side / 2, y: side / 2 }));
  assert.ok(near(v.toScreen({ x: 0, y: 0 }), { x: 1, y: 1 }));
  assertStateKept(g, before);
});

test('mobile: the canvas takes its touches from the browser (touch-action: none)', () => {
  const css = readFileSync(new URL('../src/stylesheets/style.css', import.meta.url), 'utf8');
  assert.match(css, /#ctx\s*\{[^}]*touch-action:\s*none/);
});
