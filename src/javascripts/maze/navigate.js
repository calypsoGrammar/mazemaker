// Navigation over any maze. Uses only cell IDs and traversable neighbours.

// The cells reachable from `from`, in breadth-first order.
export function reachable(maze, from)
{
  const seen = new Set([from]);
  const queue = [from];
  for(let i = 0; i < queue.length; i++)
  {
    for(const n of maze.traversableNeighbours(queue[i]))
    {
      if(!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return [...seen];
}

// The shortest route from `from` to `to` as a list of cells including both
// ends, or null if `to` cannot be reached. Breadth-first search over the
// unweighted passage graph: every cell is queued at most once, so it ends on
// any maze, including ones with loops or disconnected parts. Throws a
// RangeError when either cell is not in the maze.
export function shortestPath(maze, from, to)
{
  for(const id of [from, to])
  {
    if(!maze.topology.has(id)) throw new RangeError(`cell ${id} does not exist`);
  }
  const previous = new Map([[from, null]]);
  const queue = [from];
  for(let i = 0; i < queue.length && !previous.has(to); i++)
  {
    for(const n of maze.traversableNeighbours(queue[i]))
    {
      if(!previous.has(n)) { previous.set(n, queue[i]); queue.push(n); }
    }
  }
  if(!previous.has(to)) return null;
  const path = [];
  for(let cell = to; cell !== null; cell = previous.get(cell)) path.push(cell);
  return path.reverse();
}

// True when the maze is perfect: every cell is reachable from every other by
// exactly one route (the passages form a spanning tree).
export function isPerfect(maze)
{
  const size = maze.topology.size;
  return maze.passages().length === size - 1 && reachable(maze, 0).length === size;
}

// The cells a corridor run passes through after leaving `from` for its
// neighbour `next`, ending with the cell where it stops. The run keeps going
// while the cell it has reached has exactly one onward passage (any passage
// except the one it came in by), so it follows straight corridors and forced
// turns alike. It stops at a junction (two or more onward passages), a dead
// end, `stopAt` (the destination), or when it gets back to `from` round a loop
// with no junctions. Throws a RangeError when no passage joins `from` and `next`.
export function corridor(maze, from, next, { stopAt = null } = {})
{
  if(!maze.isLinked(from, next)) throw new RangeError(`no passage from cell ${from} to cell ${next}`);
  const cells = [next];
  let previous = from;
  let cell = next;
  while(cell !== stopAt && cell !== from)
  {
    const onward = maze.traversableNeighbours(cell).filter((n) => n !== previous);
    if(onward.length !== 1) break;
    previous = cell;
    cell = onward[0];
    cells.push(cell);
  }
  return cells;
}
