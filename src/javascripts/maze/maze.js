// Maze: the passages carved through a topology. A passage joins two neighbouring
// cells and is always open in both directions; any other pair of neighbours is
// separated by a wall.

export class Maze
{
  #open;

  constructor(topology)
  {
    this.topology = topology;
    this.#open = Array.from({ length: topology.size }, () => new Set());
  }

  // Builds a maze from a list of [a, b] passages.
  static fromPassages(topology, passages)
  {
    const maze = new Maze(topology);
    for(const [a, b] of passages) maze.link(a, b);
    return maze;
  }

  // Opens the passage between neighbours `a` and `b`, in both directions.
  link(a, b)
  {
    if(!this.topology.areNeighbours(a, b)) throw new RangeError(`cells ${a} and ${b} are not neighbours`);
    this.#open[a].add(b);
    this.#open[b].add(a);
  }

  // Closes the passage between `a` and `b`, in both directions.
  unlink(a, b)
  {
    if(!this.topology.areNeighbours(a, b)) throw new RangeError(`cells ${a} and ${b} are not neighbours`);
    this.#open[a].delete(b);
    this.#open[b].delete(a);
  }

  isLinked(a, b)
  {
    return this.topology.has(a) && this.#open[a].has(b);
  }

  // The neighbours reachable from `id` in one step, in topology order.
  traversableNeighbours(id)
  {
    return this.topology.neighbours(id).filter((n) => this.#open[id].has(n));
  }

  // The traversable { label, cell } links of `id`, in topology order.
  traversableLinks(id)
  {
    return this.topology.links(id).filter((n) => this.#open[id].has(n.cell));
  }

  // The neighbour of `id` in direction `label` if a passage leads there, else null.
  move(id, label)
  {
    const next = this.topology.neighbourByLabel(id, label);
    return next !== null && this.isLinked(id, next) ? next : null;
  }

  // Every passage once, as [a, b] with a < b, sorted.
  passages()
  {
    const out = [];
    for(let a = 0; a < this.topology.size; a++)
    {
      for(const b of this.traversableNeighbours(a)) if(a < b) out.push([a, b]);
    }
    return out;
  }

  // Problems with the passage data, or an empty list. link() and unlink() keep
  // it consistent; this is a check for tests and for data built elsewhere.
  consistencyErrors()
  {
    const errors = [];
    for(let a = 0; a < this.topology.size; a++)
    {
      for(const b of this.#open[a])
      {
        if(!this.topology.areNeighbours(a, b)) errors.push(`passage ${a}-${b} joins cells that are not neighbours`);
        else if(!this.#open[b].has(a)) errors.push(`passage ${a}->${b} has no way back`);
      }
    }
    return errors;
  }
}
