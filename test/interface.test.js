// The minimalist interface (CAL-1243, docs/interface.md): an SVG icon toolbar
// over the maze, compact secondary settings, and the same look on every shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGame } from './harness.js';
import { DEFAULT_COLOURS } from '../src/javascripts/render/index.js';

const TOOLBAR = ['ResetButton', 'NewMazeButton', 'SearchButton', 'ControllerButton', 'ResetViewButton', 'OptionsButton'];
const SHAPES = ['square', 'hex', 'triangle', 'polar'];

// Text a player would see: text nodes outside hidden elements and outside
// screen-reader-only text. jsdom loads no stylesheet, so hidden means an
// inline display of none, which is how main.js hides things.
function visibleText(document) {
  const out = [];
  const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    let hidden = false;
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (el.style?.display === 'none' || el.classList.contains('sr-only') || el.tagName === 'SCRIPT') { hidden = true; break; }
    }
    if (!hidden) out.push(node.textContent.trim());
  }
  return out;
}

function rgb(colour) {
  return colour.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
}

// Relative luminance (WCAG), 0 for black to 1 for white.
function luminance(colour) {
  const [r, g, b] = rgb(colour).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

test('the default view is the maze, the pad and a toolbar of icons, with no visible text', async () => {
  const { document } = await loadGame();
  assert.deepEqual(visibleText(document), []);
  assert.equal(document.querySelectorAll('h1, h2, h3, h4, h5, h6, p:not(#sizeError)').length, 0);
  assert.equal(document.getElementById('settingsMenu').style.display, 'none');
  assert.equal(document.getElementById('completeBanner').style.display, 'none');
  assert.ok(document.body.classList.contains('bg-white'));
});

test('the toolbar holds every action as an inline SVG icon with an accessible name', async () => {
  const { document } = await loadGame();
  const toolbar = document.getElementById('toolbar');
  assert.equal(toolbar.tagName, 'NAV');
  assert.ok(toolbar.getAttribute('aria-label'));
  const buttons = [...toolbar.querySelectorAll('button')];
  assert.deepEqual(buttons.map((b) => b.id), TOOLBAR);
  const names = new Set();
  for (const b of buttons) {
    assert.equal(b.getAttribute('type'), 'button', b.id);
    assert.ok(b.classList.contains('tool'), `${b.id} uses the shared button style`);
    const name = b.getAttribute('aria-label');
    assert.ok(name && name.trim(), `${b.id} has an accessible name`);
    assert.equal(b.getAttribute('title'), name, `${b.id} has a hover hint`);
    names.add(name);
    assert.equal(b.textContent.trim(), '', `${b.id} shows no text`);
    assert.equal(b.querySelectorAll('img').length, 0, `${b.id} has no raster or <img> icon`);
    const icons = b.querySelectorAll('svg');
    assert.equal(icons.length, 1, `${b.id} has one SVG icon`);
    assert.equal(icons[0].getAttribute('aria-hidden'), 'true', `${b.id} icon is decorative`);
    assert.equal(icons[0].getAttribute('viewBox'), '0 0 24 24', `${b.id} icon is on the shared grid`);
  }
  assert.equal(names.size, buttons.length, 'names are distinct');
});

test('toggle buttons report their state: route, controls and settings', async () => {
  const g = await loadGame();
  const { document, state } = g;
  const search = document.getElementById('SearchButton');
  const controller = document.getElementById('ControllerButton');
  const options = document.getElementById('OptionsButton');

  assert.equal(search.getAttribute('aria-pressed'), 'false');
  g.click('SearchButton');
  assert.equal(search.getAttribute('aria-pressed'), 'true');
  assert.ok(state.route.length > 0);
  g.click('SearchButton');
  assert.equal(search.getAttribute('aria-pressed'), 'false');
  assert.deepEqual([...state.route], []);
  g.click('SearchButton');
  g.click('ResetButton');
  assert.equal(search.getAttribute('aria-pressed'), 'false', 'restart hides the route');
  g.click('SearchButton');
  g.click('NewMazeButton');
  assert.equal(search.getAttribute('aria-pressed'), 'false', 'a new maze hides the route');

  assert.equal(controller.getAttribute('aria-pressed'), 'true');
  assert.equal(controller.getAttribute('aria-controls'), 'footerControls');
  g.click('ControllerButton');
  assert.equal(controller.getAttribute('aria-pressed'), 'false');
  assert.equal(state.hideT, true);
  g.click('ControllerButton');
  assert.equal(controller.getAttribute('aria-pressed'), 'true');

  assert.equal(options.getAttribute('aria-expanded'), 'false');
  assert.equal(options.getAttribute('aria-controls'), 'settingsMenu');
  g.click('OptionsButton');
  assert.equal(options.getAttribute('aria-expanded'), 'true');
  g.click('generateMaze');
  assert.equal(options.getAttribute('aria-expanded'), 'false');
});

test('settings offer compact, labelled controls for shape, mode, size and progression', async () => {
  const g = await loadGame();
  const { document } = g;
  const menu = document.getElementById('settingsMenu');
  for (const id of ['mazeShape', 'mazeMode', 'display001', 'autonew', 'autoincrement']) {
    const control = document.getElementById(id);
    assert.ok(menu.contains(control), `${id} is in the settings`);
    assert.ok(menu.querySelector(`label[for="${id}"]`)?.textContent.trim(), `${id} has a label`);
  }
  assert.deepEqual([...document.getElementById('mazeMode').options].map((o) => o.value), ['mixed', 'newest', 'oldest', 'random']);
  assert.equal(document.getElementById('mazeMode').value, 'mixed');
  // Labels show only while the panel is open.
  g.click('OptionsButton');
  assert.ok(visibleText(document).includes('Mode'));
  g.click('OptionsButton');
  assert.deepEqual(visibleText(document), []);
});

test('Escape closes the settings without applying them and returns focus to the settings button', async () => {
  const g = await loadGame();
  const { document, state } = g;
  g.click('OptionsButton');
  document.getElementById('display001').value = 9;
  document.getElementById('mazeMode').value = 'newest';
  g.press('Escape');
  assert.equal(document.getElementById('settingsMenu').style.display, 'none');
  assert.equal(document.getElementById('OptionsButton').getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement.id, 'OptionsButton');
  assert.equal(state.width, 5);
  assert.equal(state.strategy, 'mixed');
  // Escape with the panel closed does nothing.
  g.press('Escape');
  assert.equal(document.getElementById('settingsMenu').style.display, 'none');
});

test('generator mode: Generate applies it; New maze, Auto-new and reopening the settings keep it', async () => {
  const g = await loadGame();
  const { document, state } = g;
  assert.equal(state.strategy, 'mixed');
  for (const mode of ['newest', 'oldest', 'random', 'mixed']) {
    g.click('OptionsButton');
    document.getElementById('mazeMode').value = mode;
    g.click('generateMaze');
    assert.equal(state.strategy, mode);
    assert.deepEqual(state.maze.consistencyErrors(), []);
  }
  g.click('OptionsButton');
  document.getElementById('mazeMode').value = 'newest';
  g.click('generateMaze');
  g.click('NewMazeButton');
  assert.equal(state.strategy, 'newest');
  g.click('OptionsButton');
  assert.equal(document.getElementById('mazeMode').value, 'newest');
  g.click('OptionsButton');
  // Auto-new: reaching the exit makes the next maze in the same mode.
  state.player.cell = state.exitCell;
  state.player.CheckWin();
  assert.equal(state.player.cell, 0);
  assert.equal(state.strategy, 'newest');
});

test('the newest (winding) mode makes mazes with fewer dead ends than random (branching)', async () => {
  const deadEnds = async (mode) => {
    const g = await loadGame({ seed: 3 });
    g.click('OptionsButton');
    g.document.getElementById('mazeMode').value = mode;
    g.generateFromSettings(30);
    const { maze, topology } = g.state;
    let n = 0;
    for (let c = 0; c < topology.size; c++) if (maze.traversableNeighbours(c).length === 1) n++;
    return n;
  };
  assert.ok(await deadEnds('newest') < await deadEnds('random'));
});

test('StartMaze refuses an unknown generator mode and keeps the maze in play', async () => {
  const g = await loadGame();
  const before = g.state.maze;
  assert.throws(() => g.state.StartMaze(5, 5, 'square', 'prim'), /unknown generator mode prim/);
  assert.equal(g.state.maze, before);
  assert.equal(g.state.strategy, 'mixed');
});

test('colours: dark walls on white, and player and goal markers that stand apart', () => {
  const white = luminance('rgb(255, 255, 255)');
  assert.ok(contrast(luminance(DEFAULT_COLOURS.wall), white) >= 12, 'walls are dark');
  assert.ok(contrast(luminance(DEFAULT_COLOURS.player), white) >= 3, 'player shows on white');
  assert.ok(contrast(luminance(DEFAULT_COLOURS.goal), white) >= 2.5, 'goal shows on white');
  const [p, q] = [rgb(DEFAULT_COLOURS.player), rgb(DEFAULT_COLOURS.goal)];
  // Blue against orange: apart in hue and in lightness.
  assert.ok(p[2] > p[0] && q[0] > q[2]);
  assert.ok(contrast(luminance(DEFAULT_COLOURS.player), luminance(DEFAULT_COLOURS.goal)) >= 1.5);
});

test('every shape gets the same toolbar, colours and markers', async () => {
  const g = await loadGame();
  const toolbar = g.document.getElementById('toolbar').outerHTML;
  for (const shape of SHAPES) {
    g.document.getElementById('autonew').checked = false;
    g.generateFromSettings(6, shape);
    assert.equal(g.state.shape, shape);
    // The player marker is the last thing drawn.
    const ctx = g.state.canvas.getContext('2d');
    assert.equal(ctx.strokeStyle, DEFAULT_COLOURS.wall, `${shape} walls`);
    assert.equal(ctx.fillStyle, DEFAULT_COLOURS.player, `${shape} player`);
    assert.equal(g.document.getElementById('toolbar').outerHTML, toolbar, `${shape} toolbar`);
    assert.deepEqual(visibleText(g.document), [], `${shape} shows no text`);
  }
});

test('the completion state is an icon and two labelled icon buttons, with its message for screen readers only', async () => {
  const g = await loadGame();
  const { document, state } = g;
  document.getElementById('autonew').checked = false;
  g.generateFromSettings(3);
  state.player.cell = state.exitCell;
  state.player.CheckWin();
  const banner = document.getElementById('completeBanner');
  assert.equal(banner.style.display, '');
  assert.equal(banner.getAttribute('role'), 'status');
  assert.deepEqual(visibleText(document), []);
  assert.ok(banner.querySelector('.sr-only').textContent.trim());
  for (const id of ['completeRestart', 'completeNew']) {
    const b = document.getElementById(id);
    assert.ok(b.getAttribute('aria-label'));
    assert.equal(b.textContent.trim(), '');
    assert.ok(b.classList.contains('tool'));
    assert.ok(b.querySelector('svg[aria-hidden="true"]'));
  }
});

test('no shadows, gradients or animations in the markup or the stylesheet', () => {
  const root = new URL('../', import.meta.url);
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const css = readFileSync(new URL('src/stylesheets/style.css', root), 'utf8');
  for (const [name, text] of [['index.html', html], ['style.css', css]]) {
    assert.doesNotMatch(text, /shadow|gradient|animate-|@keyframes|animation\s*:|scale-/, name);
  }
  // Transitions are short colour changes only.
  for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
    assert.match(m[1], /^(none|(fill|stroke) \d+ms(, (fill|stroke) \d+ms)*)$/, m[0]);
  }
});

// The CSS rule for `selector` exactly, or '' when there is none.
function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[},\\s])${escaped}\\s*[,{][^}]*}`, 'm').exec(css)?.[0] ?? '';
}

test('focus and hover stay visible on pressed buttons and in forced-colours mode', () => {
  const css = readFileSync(new URL('../src/stylesheets/style.css', import.meta.url), 'utf8');
  // Focus: a ring set off from the button, so it shows around a filled one.
  assert.match(rule(css, '.tool:focus-visible'), /ring-2\b.*ring-offset-2\b.*ring-offset-white/s);
  // Outlines are made transparent, never removed, so high contrast keeps them.
  assert.doesNotMatch(css, /outline:\s*none/);
  assert.match(rule(css, '.tool:focus'), /outline-none/);
  // A pressed or open button has its own hover, declared after its fill.
  const pressed = css.indexOf('.tool[aria-pressed="true"],');
  const hover = css.indexOf('.tool[aria-pressed="true"]:hover');
  assert.ok(pressed >= 0 && hover > pressed, 'pressed hover follows the pressed rule');
  assert.match(css.slice(hover, css.indexOf('}', hover)), /bg-neutral-700/);
  assert.ok(css.includes('.tool[aria-expanded="true"]:hover'));
});
