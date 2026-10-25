"use strict";

import { squareTopology, hexTopology, triangleTopology, polarTopology, polarRingSizes, growingTree, shortestPath, corridor, MAX_CELLS } from './maze/index.js';
import { geometryFor, CanvasRenderer, attachViewGestures } from './render/index.js';
import { directionsAt, chooseDirection, keyCommand, DirectionPad } from './input/index.js';

function CalculateVh()
{
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', vh + 'px');
}

window.addEventListener('DOMContentLoaded', CalculateVh);
window.addEventListener('resize', CalculateVh);
window.addEventListener('orientationchange', CalculateVh);

// GAME classes

// How long the player takes to cross one passage, in milliseconds. Every step
// of a run takes the same time.
const STEP_MS = 70;

// The player's position is a cell ID; where it is drawn comes from the layout.
// One move runs along a corridor: through the passage chosen, then on while
// there is a single way forward, one animated step per passage. `cell` is the
// cell last reached; while a run is under way `run` holds the cells still to
// come and the progress of the current step.
class Player
{
  constructor()
  {
    this.cell = 0;
    this.run = null;
    this.frame = null;
  }

  get moving()
  {
    return this.run !== null;
  }

  // DIRECTION is a topology label of the player's cell; keys and the pad reach
  // it through the input adapter. Moves are ignored while a run is under way.
  Move(DIRECTION)
  {
    if(maze === null || this.moving) return;
    const next = maze.move(this.cell, DIRECTION);
    if(next === null) return;
    this.run = { cells: corridor(maze, this.cell, next, { stopAt: exitCell }), start: null, progress: 0 };
    this.frame = requestAnimationFrame((time) => this.Animate(time));
    Draw();
  }

  // One animation frame. A step ends when STEP_MS have passed since it began,
  // and the next step begins when it should have, so a run keeps a steady
  // pace. After a long stall the next step begins now instead, so no step is
  // skipped without being drawn on its way.
  Animate(time)
  {
    this.frame = null;
    const run = this.run;
    if(run === null) return;
    if(run.start === null) run.start = time;
    run.progress = (time - run.start) / STEP_MS;
    if(run.progress >= 1)
    {
      this.cell = run.cells.shift();
      UpdateRoute();
      if(run.cells.length === 0)
      {
        this.run = null;
        Draw();
        this.CheckWin();
        return;
      }
      run.start += STEP_MS;
      if(time - run.start >= STEP_MS) run.start = time;
      run.progress = (time - run.start) / STEP_MS;
    }
    Draw();
    this.frame = requestAnimationFrame((t) => this.Animate(t));
  }

  // Ends a run where it is, leaving the player on the last cell reached.
  Stop()
  {
    if(this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.run = null;
  }

  // What the renderer draws: the cell, or the step under way.
  get marker()
  {
    if(this.run === null) return this.cell;
    return { from: this.cell, to: this.run.cells[0], progress: this.run.progress };
  }

  // Reaching the exit starts the next maze with Auto-new on, one size larger
  // with Auto-increment too (up to MAX_SIZE). With Auto-new off the maze is
  // marked complete and the player stays on the exit.
  CheckWin()
  {
    if(this.cell !== exitCell || completed) return;
    if(autoNew)
    {
      if(increment && Math.max(width, height) < MAX_SIZE)
      {
        width++;
        height++;
        display001.value = width;
      }
      NewMaze();
    }
    else
    {
      completed = true;
      ShowCompletion();
    }
  }
}

// GENERATE CUSTOM MAZE

const generateMaze = document.getElementById("generateMaze");
generateMaze.onclick = function () { GenerateCustomMaze(); };

// RESTART THE CURRENT MAZE

const ResetButton = document.getElementById("ResetButton");
ResetButton.onclick = function () { Restart(); };

// NEW LAYOUT AT THE CURRENT SIZE

const NewMazeButton = document.getElementById("NewMazeButton");
NewMazeButton.onclick = function () { NewMaze(); };

// FIT THE MAZE TO THE SCREEN AGAIN AFTER PANNING OR ZOOMING

const ResetViewButton = document.getElementById("ResetViewButton");
ResetViewButton.onclick = function () { ResetView(); };

// COMPLETION STATE (Auto-new off)

const completeBanner = document.getElementById("completeBanner");
completeBanner.style.display = 'none';
document.getElementById("completeRestart").onclick = function () { Restart(); };
document.getElementById("completeNew").onclick = function () { NewMaze(); };

// HIDE CONTROLS

const ControllerButton = document.getElementById("ControllerButton");
ControllerButton.onclick = function () { HidePad(); };
let hideT = false;
const footerControls = document.getElementById("footerControls");

// THEME related references

const iUp = document.getElementById("iUp");
const iLeft = document.getElementById("iLeft");
const iRight = document.getElementById("iRight");
const iDown = document.getElementById("iDown");

// TOGGLE CUSTOM MAZE MENU

let toggleS = false;
const settingsMenu = document.getElementById("settingsMenu");
settingsMenu.style.display = 'none';
const OptionsButton = document.getElementById("OptionsButton");
OptionsButton.onclick = function () { ToggleSettings(); };
const SearchButton = document.getElementById("SearchButton");
SearchButton.onclick = function () { Find(); };

// CUSTOM MENU INPUT

const display001 = document.getElementById("display001");
const mazeShape = document.getElementById("mazeShape");
const sizeError = document.getElementById("sizeError");
sizeError.style.display = 'none';

const aNew = document.getElementById("autonew");
aNew.onchange = function () { ReadToggles(); };

const aIncrement = document.getElementById("autoincrement");
aIncrement.onchange = function () { ReadToggles(); };

// TOUCHPAD CONTROLS
// One button per direction of the player's cell; only open passages can be
// chosen. The pad is redrawn with the maze (see UpdatePad).

const pad = new DirectionPad(document.getElementById("directionPad"), { onSelect: (label) => player.Move(label) });

// GENERAL CANVAS VARIABLES

const gameDiv = document.getElementById("gameDiv");
const canvas = document.getElementById("ctx");
const renderer = new CanvasRenderer(canvas);

// Dragging and pinching the canvas, and the wheel over it, pan and zoom the
// view. They only change the drawing, never the maze or the player.
attachViewGestures(canvas, {
  viewport: () => (geometry === null ? null : renderer.viewportFor(geometry)),
  change: (view) => { renderer.setView(view); Draw(); },
});

// GAME VARIABLES

// Sizes the settings accept, in cells per side.
const MIN_SIZE = 2;
const MAX_SIZE = 50;

// Shapes the settings offer. `topology(cols, rows)` builds the grid for a
// maze `cols` units wide and `rows` high; `cells(cols, rows)` is the number of
// cells it would have, worked out without building it. A size n square or hex
// maze has n columns and n rows of cells. A triangle maze has two triangles
// (one up, one down) per unit, so a size n maze is n rows of 2n triangles and
// about as wide as it is tall. A size n circle has n rings around its centre
// (`cols`; a circle has no separate height).
const SHAPES = Object.freeze({
  square: Object.freeze({ cells: (cols, rows) => cols * rows, topology: squareTopology }),
  hex: Object.freeze({ cells: (cols, rows) => cols * rows, topology: hexTopology }),
  triangle: Object.freeze({ cells: (cols, rows) => 2 * cols * rows, topology: (cols, rows) => triangleTopology(2 * cols, rows) }),
  // Every ring has at least one cell, so more rings than MAX_CELLS are over
  // the limit without adding them up.
  polar: Object.freeze({
    cells: (rings) => (rings > MAX_CELLS ? Infinity : polarRingSizes(rings).reduce((sum, n) => sum + n, 0)),
    topology: (rings) => polarTopology(rings),
  }),
});

let width, height, autoNew, increment, factor;
// The shape in play, a key of SHAPES. New maze and Auto-increment keep it.
let shape = 'square';
// topology: the cells and their neighbours. maze: the passages carved through it.
// geometry: where the topology's cells are drawn.
let topology = null;
let maze = null;
let geometry = null;
let exitCell = 0;
// Cells of the route shown by Search, from the player's cell to the exit.
// Once Search is pressed the route is recomputed after every move, until the
// next maze.
let route = [];
let showRoute = false;
// True once the player reaches the exit with Auto-new off. The player can
// still move; the maze stays complete until Restart or a new maze.
let completed = false;
let player = new Player();

function ToggleSettings()
{
  SetSettingsOpen(!toggleS);
}

// Opening the panel shows the size in play; a size typed but not generated
// is discarded when the panel closes.
function SetSettingsOpen(open)
{
  toggleS = open;
  if(toggleS)
  {
    display001.value = width;
    mazeShape.value = shape;
    sizeError.style.display = 'none';
    settingsMenu.style.display = '';
  }
  else settingsMenu.style.display = 'none';
}

// MAZE CODE

function DefaultSettings()
{
  display001.value = 5;
  display001.min = MIN_SIZE;
  display001.max = MAX_SIZE;
  display001.step = 1;
  mazeShape.value = 'square';

  FitCanvas();

  aNew.checked = true;
  aIncrement.checked = true;
  ReadToggles();

  StartMaze(5, 5);
}

// Auto-new and Auto-increment take effect as soon as they are changed.
function ReadToggles()
{
  autoNew = aNew.checked;
  increment = aIncrement.checked;
}

// The side typed in the size field as an integer from MIN_SIZE to MAX_SIZE,
// or null for anything else (empty, negative, decimal, exponent, out of range).
function ParseSize(text)
{
  const value = String(text).trim();
  if(!/^[0-9]+$/.test(value)) return null;
  const size = Number(value);
  return size >= MIN_SIZE && size <= MAX_SIZE ? size : null;
}

// Generate: applies the typed size, the shape and the toggles, closes the panel and makes
// a new maze. An invalid size changes nothing and leaves the panel open with
// a message.
function GenerateCustomMaze()
{
  const size = ParseSize(display001.value);
  if(size === null)
  {
    sizeError.style.display = '';
    return;
  }
  const nextShape = Object.hasOwn(SHAPES, mazeShape.value) ? mazeShape.value : shape;
  ReadToggles();
  SetSettingsOpen(false);
  StartMaze(size, size, nextShape);
}

// A new layout at the size in play.
function NewMaze()
{
  StartMaze(width, height);
}

// Back to the start of the current layout; the passages are kept.
function Restart()
{
  if(maze === null) return;
  player.Stop();
  player.cell = 0;
  route = [];
  showRoute = false;
  ClearCompletion();
  Draw();
}

function ShowCompletion()
{
  completeBanner.style.display = '';
}

function ClearCompletion()
{
  completed = false;
  completeBanner.style.display = 'none';
}

// Makes a new cols x rows maze of `nextShape` (a key of SHAPES). The UI only
// asks for MIN_SIZE to MAX_SIZE on a side; any other positive size works too.
function StartMaze(cols, rows, nextShape = shape)
{
  if(!Object.hasOwn(SHAPES, nextShape)) throw new RangeError(`unknown maze shape ${nextShape}`);
  // Throws a RangeError for a size that is not a positive whole number or has
  // more than MAX_CELLS cells, before any state changes, so the previous maze
  // stays in play.
  for(const side of [cols, rows])
  {
    if(!Number.isInteger(side) || side < 1) throw new RangeError(`maze size ${cols}x${rows} is not positive whole numbers`);
  }
  const { cells, topology: build } = SHAPES[nextShape];
  if(cells(cols, rows) > MAX_CELLS) throw new RangeError(`maze size ${cols}x${rows} is over the limit of ${MAX_CELLS} cells`);
  const nextTopology = build(cols, rows);
  const nextMaze = growingTree(nextTopology, { strategy: 'mixed', random: () => Math.random() }).maze;
  topology = nextTopology;
  shape = nextShape;
  width = cols;
  height = rows;
  maze = nextMaze;
  geometry = geometryFor(topology);
  exitCell = topology.size - 1;
  route = [];
  showRoute = false;
  player.Stop();
  player.cell = 0;
  ClearCompletion();
  renderer.setView({ zoom: 1, panX: 0, panY: 0 });

  Draw();
}

// Back to the whole maze, centred and fitted to the canvas.
function ResetView()
{
  renderer.setView({ zoom: 1, panX: 0, panY: 0 });
  Draw();
}

// DRAW
// The renderer only reads the game state; every change of state redraws.

function Draw()
{
  if(maze === null) return;
  renderer.render({ maze, geometry, player: player.marker, goal: exitCell, path: route });
  UpdatePad();
}

// The pad shows the directions of the cell last reached. It only changes when
// the cell or the maze does, not on every animation frame.
let padShows = null;
function UpdatePad()
{
  if(padShows !== null && padShows.maze === maze && padShows.cell === player.cell) return;
  padShows = { maze, cell: player.cell };
  pad.update(directionsAt(maze, geometry, player.cell));
}

// Sizes the canvas to 90% of the smaller of the window width and the game area
// height, at the screen's pixel density.
function FitCanvas()
{
  if(hideT) factor = 0.925;
  else factor = 0.625;

  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight * factor;
  let squareSize;

  if(screenWidth >= screenHeight) squareSize = screenHeight;
  else squareSize = screenWidth;

  squareSize = squareSize * 0.9;

  renderer.resize(squareSize, squareSize, window.devicePixelRatio || 1);
}

// PLAYER MOVEMENT

// KEYBOARD

// Arrow keys and WASD in either case (Shift or Caps Lock) name a visual
// direction; the adapter turns it into the open passage that way, if any. On a
// square grid each key takes exactly its own direction. Hex grids add Q and E
// and the numeric keypad for their six sides (see HEX_KEYS). On triangle grids
// each key takes only the side it names (see keyCommand). On circles the keys
// go in, out and round the ring instead, with 1-9 for one of several outward
// passages (see POLAR_KEYS).

document.onkeydown = function(event)
{
  // Leave shortcuts (Ctrl+W, Cmd+D, ...) to the browser, and keys to the
  // settings panel while it covers the maze.
  if(event.ctrlKey || event.metaKey || event.altKey) return;
  if(toggleS) return;
  const command = keyCommand(event.key, shape);
  if(command === undefined) return;
  event.preventDefault();
  if(maze === null || player.moving) return;
  const label = chooseDirection(directionsAt(maze, geometry, player.cell), command);
  if(label !== null) player.Move(label);
}

// HIDE TOUCHPAD

function HidePad()
{
  hideT = !hideT;
  if(hideT)
  {
    footerControls.style.display = "none";
  }
  else
  {
    footerControls.style.display = "";
  }
  if(maze !== null)
  {
    ReSizeMaze();
  }
}

function ReSizeMaze()
{
  let vhFactor;
  if(hideT) vhFactor = 92.5;
  else vhFactor = 62.5;

  gameDiv.style.height = 'calc(var(--vh) * ' + vhFactor + ')';
  gameDiv.style.top = 'calc(var(--vh) * 7.5)';
  gameDiv.style.display = 'flex';
  gameDiv.style.justifyContent = 'center';
  gameDiv.style.alignItems = 'center';

  // Only the drawing changes; the maze, player and route are kept. The zoom
  // is kept too, with the pan brought within the new canvas's limits.
  FitCanvas();
  if(geometry !== null) renderer.setView(renderer.viewportFor(geometry).clamped());
  Draw();
}

// FLIP PAD

function FlipPad()
{
  if(flipState === "center")
  {
    footerControls.style.justifyContent = "right";
    flipState = "right";
  }
  else if (flipState === "right")
  {
    footerControls.style.justifyContent = "left";
    flipState = "left";
  }
  else if (flipState === "left")
  {
    footerControls.style.justifyContent = "center";
    flipState = "center";
  }
}

// SEARCH

function Find()
{
  showRoute = true;
  UpdateRoute();
  Draw();
}

// Recomputes the shown route from the player's current cell. An unreachable
// exit gives an empty route.
function UpdateRoute()
{
  if(!showRoute) return;
  route = shortestPath(maze, player.cell, exitCell) ?? [];
}

window.addEventListener('resize', ReSizeMaze);

// Moving the window to a screen with another pixel density, or browser zoom,
// changes devicePixelRatio; redraw at the new density.
function WatchPixelRatio()
{
  if(typeof window.matchMedia !== 'function') return;
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  query.addEventListener('change', function () { ReSizeMaze(); WatchPixelRatio(); }, { once: true });
}
WatchPixelRatio();

// Intialisation
document.addEventListener('DOMContentLoaded', DefaultSettings);