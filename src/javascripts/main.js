"use strict";

import { squareTopology, growingTree, shortestPath } from './maze/index.js';

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
    ClearMaze();
    DrawMaze();
    DrawRoute();
    DrawPlayer();
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

let mazeColour = "rgba(50, 50, 60, 1)";
let playerColour = "rgba(150, 250, 150, 1)";
let exitColour = "rgba(250, 150, 150, 1)";
let routeColour = "rgba(46, 97, 113, 0.35)";

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
const ctx = document.getElementById("ctx").getContext("2d");

// GAME VARIABLES

let width, height, w, h, autoNew, increment, cWidth, cHeight, factor;
// topology: the cells and their neighbours. maze: the passages carved through it.
let topology = null;
let maze = null;
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

  if(hideT) factor = 0.925;
  else factor = 0.625;
  
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight * factor;

  let squareSize;
  
  if(screenWidth >= screenHeight) squareSize = screenHeight;
  else squareSize = screenWidth;
  
  squareSize = squareSize * 0.9;

  cWidth = squareSize;
  cHeight = squareSize;
  
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

  // Throws a RangeError for a size that is not a positive whole number, before
  // any state changes, so the previous maze stays in play.
  topology = squareTopology(cols, rows);
  width = cols;
  height = rows;
  maze = growingTree(topology, { random: () => Math.random() }).maze;
  exitCell = topology.size - 1;
  route = [];
  showRoute = false;
  player.cell = 0;

  canvas.width = cWidth;
  canvas.height = cHeight;

  w = canvas.width / width;
  h = canvas.height / height;

  ClearMaze();
  DrawMaze();
  DrawRoute();
  DrawPlayer();
}

// DRAW FUNCTIONS
// Square layout: the only place cells get screen coordinates.

function CellLeft(cell)
{
  return topology.coordsOf(cell).column * w;
}

function CellTop(cell)
{
  return topology.coordsOf(cell).row * h;
}

// True when there is no passage from `cell` in direction `label`, including
// the outer edge of the maze.
function IsWall(cell, label)
{
  return maze.move(cell, label) === null;
}

function ClearMaze()
{
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function DrawMaze()
{
  ctx.strokeStyle = mazeColour;
  ctx.lineWidth = 1;
  const half = ctx.lineWidth / 2;
  const extra = ctx.lineWidth;
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.stroke();
  
  for(const cell of topology.cells())
  {
    const left = CellLeft(cell);
    const bottom = CellTop(cell) + h;
    if(IsWall(cell, "UP"))
	  {
      ctx.beginPath();
      ctx.moveTo(left + half, bottom - h + half);
      ctx.lineTo(left + w + half, bottom - h + half);
      ctx.stroke();
    }
    if(IsWall(cell, "DOWN"))
	  {
      ctx.beginPath();
      ctx.moveTo(left + half, bottom + half);
      ctx.lineTo(left + w + half, bottom + half);
      ctx.stroke();
    }
    if(IsWall(cell, "LEFT"))
	  {
      ctx.beginPath();
      ctx.moveTo(left, bottom - extra);
      ctx.lineTo(left, bottom - h);
      ctx.stroke();
    }
    if(IsWall(cell, "RIGHT"))
	  {
      ctx.beginPath();
      ctx.moveTo(left + w, bottom + extra);
      ctx.lineTo(left + w, bottom - h);
      ctx.stroke();
    }
  }
  // fix borders so same width all around
  // left border
  ctx.beginPath();
  ctx.moveTo(0 + half, 0 + half);
  ctx.lineTo(0 + half, canvas.height + half);
  ctx.stroke();
  // bottom border
  ctx.beginPath();
  ctx.moveTo(0 - half, canvas.width - half);
  ctx.lineTo(canvas.height - half, canvas.width - half);
  ctx.stroke();
  // right border
  ctx.beginPath();
  ctx.moveTo(canvas.height - half, canvas.width - half);
  ctx.lineTo(canvas.height - half, 0 - half);
  ctx.stroke();
  // top border
  ctx.beginPath();
  ctx.moveTo(0 + half, 0 + half);
  ctx.lineTo(canvas.height + half, 0 + half);
  ctx.stroke();
}

function DrawRoute()
{
  if(route.length === 0) return;
  ctx.fillStyle = routeColour;
  for(const cell of route)
  {
    ctx.fillRect(CellLeft(cell), CellTop(cell), w + ctx.lineWidth / 16, h + ctx.lineWidth / 16);
  }
}

function DrawPlayer()
{
  const quarter = ctx.lineWidth / 4;
  ctx.fillStyle = exitColour;
  ctx.fillRect(CellLeft(exitCell) + w/4 + quarter, CellTop(exitCell) + h/4 + quarter, w/2, h/2);
  ctx.fillStyle = playerColour;
  ctx.fillRect(CellLeft(player.cell) + w/4 + quarter, CellTop(player.cell) + h/4 + quarter, w/2, h/2);
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
  if(hideT) factor = 0.925;
  else factor = 0.625;

  let vhFactor;
  if(hideT) vhFactor = 92.5;
  else vhFactor = 62.5;
  
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight * factor;
  let squareSize;
  
  if(screenWidth >= screenHeight) squareSize = screenHeight;
  else squareSize = screenWidth;

  gameDiv.style.height = 'calc(var(--vh) * ' + vhFactor + ')';
  gameDiv.style.top = 'calc(var(--vh) * 7.5)';
  gameDiv.style.display = 'flex';
  gameDiv.style.justifyContent = 'center';
  gameDiv.style.alignItems = 'center';
  
  squareSize = squareSize * 0.9;

  cWidth = squareSize;
  cHeight = squareSize;

  canvas.width = cWidth;
  canvas.height = cHeight;

  w = canvas.width / width;
  h = canvas.height / height;

  if(maze !== null)
  {
    ClearMaze();
    DrawMaze();
    DrawRoute();
    DrawPlayer();
  }
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
  ClearMaze();
  DrawMaze();
  DrawRoute();
  DrawPlayer();
}

// Recomputes the shown route from the player's current cell. An unreachable
// exit gives an empty route.
function UpdateRoute()
{
  if(!showRoute) return;
  route = shortestPath(maze, player.cell, exitCell) ?? [];
}

window.addEventListener('resize', ReSizeMaze);

// Intialisation
document.addEventListener('DOMContentLoaded', DefaultSettings);