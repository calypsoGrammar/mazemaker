"use strict";

import { squareTopology, growingTree, shortestPath, MAX_CELLS } from './maze/index.js';
import { geometryFor, CanvasRenderer } from './render/index.js';

function CalculateVh()
{
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', vh + 'px');
}

window.addEventListener('DOMContentLoaded', CalculateVh);
window.addEventListener('resize', CalculateVh);
window.addEventListener('orientationchange', CalculateVh);

// GAME classes

// The player's position is a cell ID; where it is drawn comes from the layout.
class Player
{
  constructor()
  {
    this.cell = 0;
  }

  Move(DIRECTION)
  {
    if(maze === null) return;
    const next = maze.move(this.cell, DIRECTION);
    if(next === null) return;
    this.cell = next;
    UpdateRoute();
    Draw();
    this.CheckWin();
  }

  CheckWin()
  {
    if(this.cell === exitCell)
    {
      if(autoNew)
      {
        if(increment && width < 50)
        {
          width++;
          height++;
          display001.value = width;
        }
        NewMaze();
      }
    }
  }
}

// GENERATE CUSTOM MAZE

const generateMaze = document.getElementById("generateMaze");
generateMaze.onclick = function () { GenerateCustomMaze(); };

// RESET TO DEFAULT

const ResetButton = document.getElementById("ResetButton");
ResetButton.onclick = function () { NewMaze(); };

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

const aNew = document.getElementById("autonew");
aNew.onclick = function () { AutoNew(); };

const aIncrement = document.getElementById("autoincrement");
aIncrement.onclick = function () { AutoIncrement(); };

// TOUCHPAD CONTROLS

const upButton = document.getElementById("upButton");
upButton.onclick = function () { TouchPad('UP'); };
const downButton = document.getElementById("downButton");
downButton.onclick = function () { TouchPad('DOWN'); };
const leftButton = document.getElementById("leftButton");
leftButton.onclick = function () { TouchPad('LEFT'); };
const rightButton = document.getElementById("rightButton");
rightButton.onclick = function () { TouchPad('RIGHT'); };

// GENERAL CANVAS VARIABLES

const gameDiv = document.getElementById("gameDiv");
const canvas = document.getElementById("ctx");
const renderer = new CanvasRenderer(canvas);

// GAME VARIABLES

let width, height, autoNew, increment, factor;
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
let player = new Player();

function ToggleSettings()
{
  toggleS = !toggleS;
  if(toggleS) settingsMenu.style.display = '';
  else settingsMenu.style.display = 'none';
}

// MAZE CODE

function DefaultSettings()
{
	display001.value = 5;

  width = 5;
  height = 5;

  FitCanvas();
  
  autoNew = true;
  increment = true;
  aNew.checked = true;
  aIncrement.checked = true;
  
  NewMaze();
}

function AutoNew()
{
  autoNew = !autoNew;
}

function AutoIncrement()
{
  increment = !increment;
}

function GenerateCustomMaze()
{
  autoNew = aNew.checked;
  increment = aIncrement.checked;

  ToggleSettings();

  NewMaze();
}

function NewMaze()
{
  const cols = Number(display001.value);
	const rows = Number(display001.value);

	autoNew = aNew.checked;
	increment = aIncrement.checked;

  // Throws a RangeError for a size that is not a positive whole number or has
  // more than MAX_CELLS cells, before any state changes, so the previous maze
  // stays in play.
  if(cols * rows > MAX_CELLS) throw new RangeError(`maze size ${cols}x${rows} is over the limit of ${MAX_CELLS} cells`);
  const nextTopology = squareTopology(cols, rows);
  const nextMaze = growingTree(nextTopology, { strategy: 'mixed', random: () => Math.random() }).maze;
  topology = nextTopology;
  width = cols;
  height = rows;
  maze = nextMaze;
  geometry = geometryFor(topology);
  exitCell = topology.size - 1;
  route = [];
  showRoute = false;
  player.cell = 0;

  Draw();
}

// DRAW
// The renderer only reads the game state; every change of state redraws.

function Draw()
{
  if(maze === null) return;
  renderer.render({ maze, geometry, player: player.cell, goal: exitCell, path: route });
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

document.onkeydown = function(event)
{
  if(event.key === "d" || event.key === "ArrowRight") player.Move("RIGHT");
  if(event.key === "s"  || event.key === "ArrowDown") player.Move("DOWN");
  if(event.key === "a"  || event.key === "ArrowLeft") player.Move("LEFT");
  if(event.key === "w"  || event.key === "ArrowUp") player.Move("UP");
}

// TOUCHPAD

function TouchPad(DIRECTION)
{
  if(DIRECTION === "UP") player.Move("UP")
  else if(DIRECTION === "DOWN") player.Move("DOWN");
  else if(DIRECTION === "LEFT") player.Move("LEFT");
  else if(DIRECTION === "RIGHT") player.Move("RIGHT");
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

  // Only the drawing changes; the maze, player and route are kept.
  FitCanvas();
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