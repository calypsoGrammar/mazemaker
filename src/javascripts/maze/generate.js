// Maze generation over any topology. Uses only cell IDs and neighbour lists.

import { Maze } from './maze.js';

// The largest topology generate() accepts by default. Generation takes
// 2 * cells - 1 steps; this keeps a single maze well under a second in a
// browser, so a large size typed into the UI cannot lock the page up.
export const MAX_CELLS = 250000;

// Selection strategies for the growing-tree generator. Each step works on one
// cell of the active list (cells that may still have unvisited neighbours);
// the strategy says which. `create(random)` is called once per maze and returns
// `select(length)`, which gives an index in [0, length) into the active list,
// ordered oldest first. Both may draw from `random`; nothing else does, apart
// from the start cell and the neighbour choice, so a seed fixes the maze.
export const STRATEGIES = Object.freeze({
  // Depth-first: long winding corridors with few branches (recursive backtracker).
  newest: Object.freeze({
    name: 'newest',
    create: () => (length) => length - 1,
  }),
  // Breadth-first: short straight passages fanning out from the start cell.
  oldest: Object.freeze({
    name: 'oldest',
    create: () => () => 0,
  }),
  // Any active cell: many short dead ends, like Prim's algorithm.
  random: Object.freeze({
    name: 'random',
    create: (random) => (length) => Math.floor(random() * length),
  }),
  // The game's original mode. Two random thresholds per maze set how often
  // the newest, the oldest or a random cell is taken, so mazes vary between
  // long corridors and short branches.
  mixed: Object.freeze({
    name: 'mixed',
    create(random)
    {
      const t1 = random();
      const t3 = random();
      return (length) =>
      {
        const type = random();
        if(type >= t1) return length - 1;
        if(type >= t3) return 0;
        return Math.floor(random() * length);
      };
    },
  }),
});

export const STRATEGY_NAMES = Object.freeze(Object.keys(STRATEGIES));

export const DEFAULT_STRATEGY = 'mixed';

// The strategy called `name`, or `name` itself when it is already a strategy
// object ({ name, create }). Throws a RangeError for an unknown name.
export function resolveStrategy(name = DEFAULT_STRATEGY)
{
  if(typeof name === 'object' && name !== null && typeof name.create === 'function') return name;
  if(Object.hasOwn(STRATEGIES, name)) return STRATEGIES[name];
  throw new RangeError(`unknown generation strategy ${String(name)}; expected one of ${STRATEGY_NAMES.join(', ')}`);
}

// Deterministic random numbers in [0, 1) from a 32-bit seed (mulberry32).
export function seededRandom(seed)
{
  if(!Number.isInteger(seed)) throw new RangeError(`seed must be an integer, got ${seed}`);
  let a = seed >>> 0;
  return () =>
  {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Growing-tree generation. Starting from a random cell, each step takes the
// cell the strategy selects from the active list and opens a passage to a
// random unvisited neighbour, or retires the cell when it has none. The result
// is a perfect maze: every cell is reachable by exactly one route.
//
// Options:
// - `strategy`: a name from STRATEGY_NAMES (default 'mixed') or a strategy object.
// - `seed`: an integer; the same seed, strategy and topology give the same maze.
// - `random`: numbers in [0, 1), like Math.random; used when there is no seed.
// - `maxCells`: the largest topology accepted (default MAX_CELLS).
//
// Throws a RangeError, before doing any work, for a topology over `maxCells`
// or an unknown strategy. Returns the maze, the number of steps taken
// (always 2 * cells - 1) and the strategy name.
export function growingTree(topology, { strategy = DEFAULT_STRATEGY, seed, random, maxCells = MAX_CELLS } = {})
{
  const chosen = resolveStrategy(strategy);
  if(topology.size > maxCells) throw new RangeError(`maze has ${topology.size} cells; the limit is ${maxCells}`);
  if(seed !== undefined) random = seededRandom(seed);
  else if(random === undefined) random = Math.random;

  const maze = new Maze(topology);
  const select = chosen.create(random);
  const visited = new Uint8Array(topology.size);
  const active = [Math.floor(random() * topology.size)];
  visited[active[0]] = 1;
  // Each cell is added once and removed once, so this is never reached by the
  // built-in strategies; it stops a faulty one from looping forever.
  const maxSteps = 2 * topology.size - 1;
  let position = 0;
  let steps = 0;

  while(active.length > 0)
  {
    if(++steps > maxSteps) throw new Error(`generation exceeded ${maxSteps} steps`);
    const cell = active[position];
    const choose = topology.neighbours(cell).filter((n) => !visited[n]);
    if(choose.length > 0)
    {
      const next = choose[Math.floor(random() * choose.length)];
      maze.link(cell, next);
      visited[next] = 1;
      active.push(next);
    }
    else if(position === active.length - 1)
    {
      active.pop();
    }
    else
    {
      active.splice(position, 1);
    }
    if(active.length === 0) break;

    position = select(active.length);
    if(!Number.isInteger(position) || position < 0 || position >= active.length)
    {
      throw new RangeError(`strategy ${chosen.name} selected ${position} from ${active.length} active cells`);
    }
  }
  return { maze, steps, strategy: chosen.name };
}
