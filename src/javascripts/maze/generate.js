// Maze generation over any topology. Uses only cell IDs and neighbour lists.

import { Maze } from './maze.js';

// Growing-tree generation, as the game has always used. Starting from a random
// cell, each step takes a cell from the work list and opens a passage to a
// random unvisited neighbour, or retires the cell when it has none. The next
// cell is the newest, the oldest or a random entry of the list; two random
// thresholds per maze set the mix, so mazes vary between long corridors and
// short branches. The result is a perfect maze: every cell is reachable by
// exactly one route.
//
// `random` returns numbers in [0, 1), like Math.random. The function returns the
// maze and the number of steps taken (2 * cells - 1).
export function growingTree(topology, { random = Math.random } = {})
{
  const maze = new Maze(topology);
  const t1 = random();
  const t3 = random();
  const visited = new Array(topology.size).fill(false);
  const active = [Math.floor(random() * topology.size)];
  visited[active[0]] = true;
  let position = 0;
  let steps = 0;

  while(active.length > 0)
  {
    steps++;
    const cell = active[position];
    const choose = topology.neighbours(cell).filter((n) => !visited[n]);
    if(choose.length > 0)
    {
      const next = choose[Math.floor(random() * choose.length)];
      maze.link(cell, next);
      visited[next] = true;
      active.push(next);
    }
    else
    {
      active.splice(position, 1);
    }
    if(active.length === 0) break;

    const type = random();
    if(type >= t1) position = active.length - 1;
    else if(type >= t3) position = 0;
    else position = Math.floor(random() * active.length);
  }
  return { maze, steps };
}
