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
