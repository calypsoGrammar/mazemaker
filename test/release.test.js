// Release review (CAL-1244 / MM-V1-15): every shape and generator mode played
// to the end with touch and with keys only, on phone, tablet and desktop
// windows in both orientations; layouts where the pad and toolbar stay
// touch-sized and never cover the maze; canvas gestures that never move the
// player; reduced motion; and no uncaught errors. jsdom stands in for the
// browsers: real iOS, Android, Safari and Firefox still need a person.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { shortestPath, corridor, STRATEGIES, squareTopology, hexTopology, triangleTopology, polarTopology, growingTree, seededRandom } from '../src/javascripts/maze/index.js';
import { pageLayout, SIDE_LAYOUT_MAX_HEIGHT, MIN_TOOLBAR, geometryFor } from '../src/javascripts/render/index.js';
import { DirectionPad, directionsAt } from '../src/javascripts/input/index.js';
import { loadGame } from './harness.js';

const SHAPES = ['square', 'hex', 'triangle', 'polar'];
const MODES = Object.keys(STRATEGIES);

// Representative windows, in CSS pixels, upright and on their side.
const PHONES = [[320, 568], [360, 740], [375, 667], [390, 844], [412, 915], [414, 896]];
const TABLETS = [[768, 1024], [820, 1180]];
const DESKTOPS = [[800, 600], [1024, 768], [1280, 800], [1920, 1080]];
const WINDOWS = [
  ...[...PHONES, ...TABLETS].flatMap(([w, h]) => [[w, h], [h, w]]),
  ...DESKTOPS,
];

// Apple and Google ask for touch targets of at least 44 (pt) and 48 (dp); 44
// CSS pixels is the smaller.
const TOUCH = 44;
// The pad's SVG is a 200-unit square drawn into its box, up to 300 px.
const PAD_VIEW = 200;
const PAD_MAX = 300;

// The polar pad's six directions are the most any cell has (see below), and
// make the smallest buttons.
const MOST_DIRECTIONS = 6;

const inside = (r, w, h) => r.left >= 0 && r.top >= 0 && r.left + r.width <= w + 1e-9 && r.top + r.height <= h + 1e-9;
const apart = (a, b) =>
  a.left + a.width <= b.left + 1e-9 || b.left + b.width <= a.left + 1e-9 ||
  a.top + a.height <= b.top + 1e-9 || b.top + b.height <= a.top + 1e-9;

// The smallest button radius, in pad units, a DirectionPad draws for any
// cell of `topology`.
function smallestButton(topology) {
  const { window } = new JSDOM('<svg id="pad"></svg>');
  const pad = new DirectionPad(window.document.getElementById('pad'), { onSelect() {} });
  const maze = growingTree(topology, { random: seededRandom(1) }).maze;
  const geometry = geometryFor(topology);
  let smallest = Infinity;
  for (const cell of topology.cells()) {
    pad.update(directionsAt(maze, geometry, cell));
    for (const b of pad.buttons) smallest = Math.min(smallest, Number(b.querySelector('circle').getAttribute('r')));
  }
  return smallest;
}

// LAYOUT

test('layout: toolbar, maze and pad never overlap and stay in the window, in every orientation', () => {
  for (const [width, height] of WINDOWS) {
    for (const padShown of [true, false]) {
      const at = `${width}x${height}${padShown ? '' : ' (pad hidden)'}`;
      const l = pageLayout({ width, height, padShown });
      const regions = [l.toolbar, l.game, ...(l.pad ? [l.pad] : [])];
      assert.equal(l.pad === null, !padShown, at);
      for (const r of regions) assert.ok(inside(r, width, height), `${at}: ${JSON.stringify(r)} is in the window`);
      for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) assert.ok(apart(regions[i], regions[j]), `${at}: regions ${i} and ${j} overlap`);
      }
      assert.ok(l.canvas > 0 && l.canvas <= Math.min(l.game.width, l.game.height), `${at}: the canvas fits the maze area`);
      assert.ok(l.toolbar.height >= MIN_TOOLBAR, `${at}: toolbar is touch-sized`);
    }
  }
});

test('layout: the pad goes beside the maze on short landscape screens only', () => {
  for (const [width, height] of WINDOWS) {
    const l = pageLayout({ width, height });
    assert.equal(l.side, width > height && height < SIDE_LAYOUT_MAX_HEIGHT, `${width}x${height}`);
    if (l.side) assert.ok(l.pad.left >= l.game.left + l.game.width, `${width}x${height}: pad right of the maze`);
    else assert.ok(l.pad.top >= l.game.top + l.game.height, `${width}x${height}: pad under the maze`);
  }
  // A phone on its side gets a much larger maze than when stacked.
  const side = pageLayout({ width: 844, height: 390 });
  assert.ok(side.canvas > 300, `844x390 canvas ${side.canvas}`);
});

test('layout: every pad button is at least a fingertip across, for every shape and window', () => {
  const smallest = Math.min(...[squareTopology(4, 4), hexTopology(4, 4), triangleTopology(8, 4), polarTopology(6)].map(smallestButton));
  // At most six directions on any cell of any shape and size in play.
  for (const t of [hexTopology(9, 9), polarTopology(50)]) {
    for (const c of t.cells()) assert.ok(t.links(c).length <= MOST_DIRECTIONS);
  }
  for (const [width, height] of WINDOWS) {
    const { pad } = pageLayout({ width, height });
    const drawn = Math.min(pad.width, pad.height, PAD_MAX);
    const diameter = (2 * smallest * drawn) / PAD_VIEW;
    assert.ok(diameter >= TOUCH, `${width}x${height}: smallest pad button ${diameter.toFixed(1)} px`);
  }
});

test('layout: the page places the regions, and rotating switches layout without losing the game', async () => {
  const g = await loadGame({ seed: 4, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 });
  const { document } = g;
  const rect = (id) => {
    const s = document.getElementById(id).style;
    return { left: parseFloat(s.left), top: parseFloat(s.top), width: parseFloat(s.width), height: parseFloat(s.height) };
  };
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(8, 'hex');
  const [first] = g.state.maze.traversableLinks(0);
  g.click(`${first.label.toLowerCase()}Button`);
  g.settle();
  const before = { maze: g.state.maze, cell: g.state.player.cell };
  assert.notEqual(before.cell, 0);

  for (const [w, h] of [[390, 844], [844, 390], [390, 844]]) {
    g.resize(w, h);
    const expected = pageLayout({ width: w, height: h });
    assert.equal(document.body.classList.contains('side-layout'), expected.side, `${w}x${h}`);
    assert.deepEqual(rect('gameDiv'), expected.game, `${w}x${h} maze area`);
    assert.deepEqual(rect('footerControls'), expected.pad, `${w}x${h} pad area`);
    assert.equal(parseFloat(document.getElementById('toolbar').style.height), expected.toolbar.height);
    assert.equal(parseFloat(g.state.canvas.style.width), expected.canvas);
    assert.equal(g.state.maze, before.maze);
    assert.equal(g.state.player.cell, before.cell);
  }
  // Hiding the pad on its side gives the maze the whole width.
  g.resize(844, 390);
  g.click('ControllerButton');
  assert.deepEqual(rect('gameDiv'), pageLayout({ width: 844, height: 390, padShown: false }).game);
  assert.deepEqual(g.errors, []);
});

test('layout: a window with no room draws nothing and throws nothing', async () => {
  const g = await loadGame();
  g.resize(0, 0);
  g.resize(300, 30);
  g.press('ArrowRight');
  g.press('ArrowDown');
  g.settle();
  g.resize(1024, 768);
  assert.ok(g.state.renderer.viewport.scale > 0);
  assert.deepEqual(g.errors, []);
});

// PLAYING TO THE END

// The way from the player's cell towards the exit along the shortest route.
function nextLabel(state) {
  const { maze, player, exitCell } = state;
  const [, next] = shortestPath(maze, player.cell, exitCell);
  return maze.topology.links(player.cell).find((l) => l.cell === next).label;
}

// Plays the maze in play to the exit, sending each move with `send(label)`.
// Returns the number of moves; stops when the maze is complete or replaced.
function playToExit(g, send) {
  const maze = g.state.maze;
  let moves = 0;
  while (g.state.maze === maze && !g.state.completed) {
    if (moves++ > maze.topology.size) throw new Error('the exit is never reached');
    const from = g.state.player.cell;
    send(nextLabel(g.state));
    g.settle();
    if (g.state.maze === maze) assert.notEqual(g.state.player.cell, from, 'every move goes somewhere');
  }
  return moves;
}

// A finger tap on a pad button: pointer down and up, then the click a tap
// sends. jsdom has no PointerEvent; a MouseEvent carries the fields.
function tap(g, label) {
  const button = g.document.getElementById(`${label.toLowerCase()}Button`);
  assert.ok(button, `pad button for ${label}`);
  assert.equal(button.getAttribute('aria-disabled'), 'false', `${label} is open`);
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    const event = new g.window.MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    button.dispatchEvent(event);
  }
}

// The key that takes `label` on `shape` (docs/controls.md).
const KEYS = {
  square: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' },
  hex: { N: 'w', S: 's', NE: 'e', NW: 'q', SE: 'd', SW: 'a' },
  triangle: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' },
  polar: { IN: 'ArrowDown', CW: 'ArrowRight', CCW: 'ArrowLeft' },
};
function keyFor(shape, label) {
  const out = /^OUT(\d)$/.exec(label);
  if (shape === 'polar' && out) return String(Number(out[1]) + 1);
  return KEYS[shape][label];
}

async function gameOf(shape, mode, size, { autoNew, ...window } = {}) {
  const g = await loadGame({ seed: 7, ...window });
  g.document.getElementById('autonew').checked = autoNew;
  g.document.getElementById('autoincrement').checked = true;
  g.click('OptionsButton');
  g.document.getElementById('mazeMode').value = mode;
  g.generateFromSettings(size, shape);
  assert.equal(g.state.shape, shape);
  assert.equal(g.state.strategy, mode);
  return g;
}

test('touch: every shape and mode can be finished with the pad, upright and on its side', async () => {
  for (const shape of SHAPES) {
    for (const mode of MODES) {
      for (const [innerWidth, innerHeight] of [[390, 844], [844, 390]]) {
        const at = `${shape}/${mode} ${innerWidth}x${innerHeight}`;
        const g = await gameOf(shape, mode, 6, { autoNew: false, innerWidth, innerHeight, devicePixelRatio: 3 });
        playToExit(g, (label) => tap(g, label));
        assert.equal(g.state.completed, true, at);
        assert.equal(g.state.player.cell, g.state.exitCell, at);
        assert.equal(g.document.getElementById('completeBanner').style.display, '', `${at}: completion shown`);
        assert.deepEqual(g.errors, [], at);
      }
    }
  }
});

test('touch: with Auto-new, finishing goes on to a larger maze of the same shape and mode', async () => {
  for (const shape of SHAPES) {
    for (const mode of MODES) {
      const g = await gameOf(shape, mode, 4, { autoNew: true, innerWidth: 360, innerHeight: 740 });
      for (let size = 4; size < 7; size++) {
        assert.equal(g.state.width, size, `${shape}/${mode}`);
        playToExit(g, (label) => tap(g, label));
        assert.equal(g.state.width, size + 1);
        assert.equal(g.state.shape, shape);
        assert.equal(g.state.strategy, mode);
        assert.equal(g.state.player.cell, 0);
        assert.equal(g.state.completed, false);
      }
      assert.deepEqual(g.errors, []);
    }
  }
});

test('keyboard: every shape and mode can be finished with keys alone, with the route shown', async () => {
  for (const shape of SHAPES) {
    for (const mode of MODES) {
      const g = await gameOf(shape, mode, 7, { autoNew: false });
      g.click('SearchButton');
      playToExit(g, (label) => {
        const key = keyFor(shape, label);
        assert.ok(key, `${shape}: a key for ${label}`);
        g.press(key);
        // The route follows the player.
        assert.equal(g.state.route[0], g.state.player.cell);
      });
      assert.equal(g.state.completed, true, `${shape}/${mode}`);
      assert.deepEqual(g.errors, []);
    }
  }
});

test('keyboard: the pad can be played from its focused buttons, and focus stays on it as buttons change', async () => {
  for (const shape of SHAPES) {
    const g = await gameOf(shape, 'mixed', 6, { autoNew: false });
    const svg = g.document.getElementById('directionPad');
    const focusables = [...g.document.querySelectorAll('button, [tabindex="0"]')];
    for (const id of ['ResetButton', 'NewMazeButton', 'SearchButton', 'ControllerButton', 'ResetViewButton', 'OptionsButton']) {
      assert.ok(focusables.includes(g.document.getElementById(id)), `${id} can be reached with Tab`);
    }
    let moves = 0;
    while (!g.state.completed) {
      if (moves++ > g.state.topology.size) throw new Error(`${shape}: exit never reached`);
      const label = nextLabel(g.state);
      const button = g.document.getElementById(`${label.toLowerCase()}Button`);
      assert.equal(button.getAttribute('tabindex'), '0', `${shape}: open ${label} is in the tab order`);
      button.focus();
      assert.equal(g.document.activeElement, button);
      button.dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      g.settle();
      if (!g.state.completed) assert.ok(svg.contains(g.document.activeElement), `${shape}: focus stays on the pad`);
    }
    assert.deepEqual(g.errors, []);
  }
});

test('keyboard: settings open, change and close from the keyboard; movement keys wait while open', async () => {
  const g = await loadGame();
  const options = g.document.getElementById('OptionsButton');
  options.focus();
  g.click('OptionsButton');
  assert.equal(options.getAttribute('aria-expanded'), 'true');
  const cell = g.state.player.cell;
  g.press('ArrowRight');
  g.press('ArrowDown');
  g.settle();
  assert.equal(g.state.player.cell, cell);
  g.press('Escape');
  assert.equal(options.getAttribute('aria-expanded'), 'false');
  assert.equal(g.document.activeElement, options);
  // Every setting has a label.
  for (const id of ['mazeShape', 'mazeMode', 'display001', 'autonew', 'autoincrement']) {
    assert.ok(g.document.querySelector(`label[for="${id}"]`)?.textContent.trim(), `${id} is labelled`);
  }
});

// GESTURES

function pointer(g, type, { id = 1, x, y }) {
  const event = new g.window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  g.state.canvas.dispatchEvent(event);
}

test('gestures: taps, drags, pinches and the wheel on the canvas never move the player, on any shape', async () => {
  for (const shape of SHAPES) {
    const g = await gameOf(shape, 'mixed', 10, { autoNew: false, innerWidth: 390, innerHeight: 844 });
    const maze = g.state.maze;
    const passages = JSON.stringify(maze.passages());
    // A tap, a drag, a two-finger pinch, the wheel and a cancelled touch.
    pointer(g, 'pointerdown', { x: 100, y: 100 });
    pointer(g, 'pointerup', { x: 100, y: 100 });
    g.state.canvas.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true }));
    pointer(g, 'pointerdown', { x: 50, y: 50 });
    for (let k = 1; k <= 5; k++) pointer(g, 'pointermove', { x: 50 + 40 * k, y: 50 + 30 * k });
    pointer(g, 'pointerup', { x: 250, y: 200 });
    pointer(g, 'pointerdown', { id: 1, x: 140, y: 140 });
    pointer(g, 'pointerdown', { id: 2, x: 160, y: 140 });
    pointer(g, 'pointermove', { id: 1, x: 80, y: 140 });
    pointer(g, 'pointermove', { id: 2, x: 220, y: 140 });
    pointer(g, 'pointerup', { id: 1, x: 80, y: 140 });
    pointer(g, 'pointercancel', { id: 2, x: 220, y: 140 });
    g.state.canvas.dispatchEvent(new g.window.WheelEvent('wheel', { clientX: 100, clientY: 100, deltaY: -300, bubbles: true, cancelable: true }));
    assert.equal(g.pendingFrames, 0, `${shape}: no move started`);
    assert.equal(g.state.player.cell, 0, shape);
    assert.equal(g.state.maze, maze);
    assert.equal(JSON.stringify(maze.passages()), passages);
    assert.ok(g.state.renderer.viewport.zoom > 1, `${shape}: the gestures zoomed`);
    // The pad still moves the player once zoomed.
    const label = nextLabel(g.state);
    tap(g, label);
    g.settle();
    assert.notEqual(g.state.player.cell, 0, `${shape}: pad works after gestures`);
    assert.deepEqual(g.errors, []);
  }
});

// REDUCED MOTION

test('reduced motion: a move goes straight to the end of its corridor, without animation frames', async () => {
  for (const shape of SHAPES) {
    const g = await loadGame({ seed: 3, reducedMotion: true });
    g.document.getElementById('autonew').checked = false;
    g.generateFromSettings(8, shape);
    const { maze, exitCell } = g.state;
    const label = nextLabel(g.state);
    const run = corridor(maze, 0, maze.move(0, label), { stopAt: exitCell });
    g.press(keyFor(shape, label));
    assert.equal(g.pendingFrames, 0, `${shape}: nothing animated`);
    assert.equal(g.state.player.moving, false);
    assert.equal(g.state.player.cell, run.at(-1), `${shape}: at the end of the corridor`);
    // And on to the exit, with the win still noticed.
    playToExit(g, (l) => g.press(keyFor(shape, l)));
    assert.equal(g.state.completed, true, shape);
    assert.deepEqual(g.errors, []);
  }
});

test('reduced motion: switching the setting takes effect on the next move', async () => {
  const g = await loadGame({ seed: 3 });
  g.document.getElementById('autonew').checked = false;
  g.generateFromSettings(8);
  tap(g, nextLabel(g.state));
  assert.ok(g.pendingFrames > 0, 'animated by default');
  g.settle();
  g.setReducedMotion(true);
  tap(g, nextLabel(g.state));
  assert.equal(g.pendingFrames, 0, 'not animated once reduced motion is on');
  g.setReducedMotion(false);
  if (!g.state.completed) {
    tap(g, nextLabel(g.state));
    assert.ok(g.pendingFrames > 0, 'animated again once it is off');
  }
});
