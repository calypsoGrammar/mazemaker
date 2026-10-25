// Topology: which cells exist and which cells are next to each other. It knows
// nothing about walls, passages, pixels or the player.
//
// Cells are identified by integers 0..size-1. Each factory below documents how
// it numbers its cells; the numbering depends only on the factory's arguments,
// so the same arguments always give the same IDs. Every cell lists its
// neighbours as { label, cell } pairs. Labels name the direction of a
// neighbour (for input mapping and rendering) and are unique within a cell;
// a cell may have any number of neighbours.

export class Topology
{
  #adjacency;

  // `adjacency[id]` is the list of { label, cell } neighbours of cell `id`.
  // Adjacency must be symmetric: if b is a neighbour of a, a is a neighbour of b.
  constructor(kind, adjacency)
  {
    this.kind = kind;
    this.size = adjacency.length;
    this.#adjacency = adjacency.map((list, id) =>
    {
      const labels = new Set();
      const cells = new Set();
      for(const { label, cell } of list)
      {
        if(!Number.isInteger(cell) || cell < 0 || cell >= adjacency.length) throw new RangeError(`cell ${id}: neighbour ${cell} does not exist`);
        if(cell === id) throw new RangeError(`cell ${id} is its own neighbour`);
        if(labels.has(label)) throw new RangeError(`cell ${id}: duplicate label ${label}`);
        if(cells.has(cell)) throw new RangeError(`cell ${id}: duplicate neighbour ${cell}`);
        labels.add(label);
        cells.add(cell);
      }
      return Object.freeze(list.map(({ label, cell }) => Object.freeze({ label, cell })));
    });
    for(let a = 0; a < this.size; a++)
    {
      for(const { cell: b } of this.#adjacency[a])
      {
        if(!this.areNeighbours(b, a)) throw new RangeError(`cell ${a} lists ${b} as a neighbour, but not the reverse`);
      }
    }
  }

  has(id)
  {
    return Number.isInteger(id) && id >= 0 && id < this.size;
  }

  cells()
  {
    return Array.from({ length: this.size }, (_, id) => id);
  }

  // The { label, cell } neighbours of `id`, in a fixed order.
  links(id)
  {
    this.#check(id);
    return this.#adjacency[id];
  }

  neighbours(id)
  {
    return this.links(id).map((n) => n.cell);
  }

  // The neighbour of `id` in direction `label`, or null if there is none.
  neighbourByLabel(id, label)
  {
    const link = this.links(id).find((n) => n.label === label);
    return link ? link.cell : null;
  }

  areNeighbours(a, b)
  {
    return this.links(a).some((n) => n.cell === b);
  }

  #check(id)
  {
    if(!this.has(id)) throw new RangeError(`cell ${id} does not exist`);
  }
}

function checkDimension(name, value)
{
  if(!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer, got ${value}`);
}

// Square grid of `cols` x `rows` cells, numbered column by column:
// id = column * rows + row, with row 0 at the top. Labels: UP, DOWN, LEFT, RIGHT.
export function squareTopology(cols, rows = cols)
{
  checkDimension('cols', cols);
  checkDimension('rows', rows);
  const id = (c, r) => c * rows + r;
  const adjacency = [];
  for(let c = 0; c < cols; c++)
  {
    for(let r = 0; r < rows; r++)
    {
      const list = [];
      if(r > 0) list.push({ label: 'UP', cell: id(c, r - 1) });
      if(r < rows - 1) list.push({ label: 'DOWN', cell: id(c, r + 1) });
      if(c > 0) list.push({ label: 'LEFT', cell: id(c - 1, r) });
      if(c < cols - 1) list.push({ label: 'RIGHT', cell: id(c + 1, r) });
      adjacency.push(list);
    }
  }
  const t = new Topology('square', adjacency);
  t.cols = cols;
  t.rows = rows;
  t.cellAt = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? id(c, r) : null);
  t.coordsOf = (cell) => ({ column: Math.floor(cell / rows), row: cell % rows });
  return t;
}

// Hexagonal grid of flat-topped hexagons in `cols` x `rows` offset layout, odd
// columns shifted half a cell down. Numbered row by row: id = row * cols + column.
// Labels: N, S, NE, NW, SE, SW.
export function hexTopology(cols, rows = cols)
{
  checkDimension('cols', cols);
  checkDimension('rows', rows);
  const id = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? r * cols + c : null);
  const adjacency = [];
  for(let r = 0; r < rows; r++)
  {
    for(let c = 0; c < cols; c++)
    {
      // Diagonal neighbours sit on the row above or level, depending on column parity.
      const up = c % 2 === 0 ? r - 1 : r;
      const candidates = [
        ['N', c, r - 1], ['S', c, r + 1],
        ['NE', c + 1, up], ['NW', c - 1, up],
        ['SE', c + 1, up + 1], ['SW', c - 1, up + 1],
      ];
      adjacency.push(candidates
        .map(([label, nc, nr]) => ({ label, cell: id(nc, nr) }))
        .filter((n) => n.cell !== null));
    }
  }
  const t = new Topology('hex', adjacency);
  t.cols = cols;
  t.rows = rows;
  t.cellAt = id;
  t.coordsOf = (cell) => ({ column: cell % cols, row: Math.floor(cell / cols) });
  return t;
}

// Triangular grid with `rows` rows of `cols` triangles. A triangle points up
// when (column + row) is even. Numbered row by row: id = row * cols + column.
// Labels: LEFT, RIGHT, and DOWN (for up-pointing) or UP (for down-pointing).
export function triangleTopology(cols, rows = cols)
{
  checkDimension('cols', cols);
  checkDimension('rows', rows);
  const id = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? r * cols + c : null);
  const adjacency = [];
  for(let r = 0; r < rows; r++)
  {
    for(let c = 0; c < cols; c++)
    {
      const pointsUp = (c + r) % 2 === 0;
      const candidates = [
        ['LEFT', c - 1, r], ['RIGHT', c + 1, r],
        pointsUp ? ['DOWN', c, r + 1] : ['UP', c, r - 1],
      ];
      adjacency.push(candidates
        .map(([label, nc, nr]) => ({ label, cell: id(nc, nr) }))
        .filter((n) => n.cell !== null));
    }
  }
  const t = new Topology('triangle', adjacency);
  t.cols = cols;
  t.rows = rows;
  t.cellAt = id;
  t.coordsOf = (cell) => ({ column: cell % cols, row: Math.floor(cell / cols) });
  t.pointsUp = (cell) => { const { column, row } = t.coordsOf(cell); return (column + row) % 2 === 0; };
  return t;
}

// Polar (circular) grid with `rings` rings. Ring 0 is a single centre cell.
// Each further ring has as many cells as the ring inside it, multiplied by a
// whole number chosen so cells stay roughly as wide as a ring is deep; so a cell
// can have several outward neighbours. Numbered from the centre outwards, then
// clockwise from the same spoke in every ring. Labels: CW, CCW, IN, OUT0, OUT1, ...
export function polarTopology(rings)
{
  checkDimension('rings', rings);
  const counts = [1];
  for(let ring = 1; ring < rings; ring++)
  {
    const previous = counts[ring - 1];
    const ratio = Math.max(1, Math.round((2 * Math.PI * ring) / previous));
    counts.push(previous * ratio);
  }
  const firsts = [];
  counts.reduce((first, count) => { firsts.push(first); return first + count; }, 0);
  const id = (ring, i) => firsts[ring] + i;

  const adjacency = [];
  for(let ring = 0; ring < rings; ring++)
  {
    const count = counts[ring];
    for(let i = 0; i < count; i++)
    {
      const list = [];
      // Every ring after the centre has at least six cells.
      if(ring > 0)
      {
        list.push({ label: 'CW', cell: id(ring, (i + 1) % count) });
        list.push({ label: 'CCW', cell: id(ring, (i - 1 + count) % count) });
      }
      if(ring > 0) list.push({ label: 'IN', cell: id(ring - 1, Math.floor(i / (count / counts[ring - 1]))) });
      if(ring < rings - 1)
      {
        const ratio = counts[ring + 1] / count;
        for(let k = 0; k < ratio; k++) list.push({ label: `OUT${k}`, cell: id(ring + 1, i * ratio + k) });
      }
      adjacency.push(list);
    }
  }
  const t = new Topology('polar', adjacency);
  t.rings = rings;
  t.ringSizes = Object.freeze([...counts]);
  t.cellAt = (ring, i) => (ring >= 0 && ring < rings && i >= 0 && i < counts[ring] ? id(ring, i) : null);
  t.coordsOf = (cell) =>
  {
    let ring = rings - 1;
    while(firsts[ring] > cell) ring--;
    return { ring, index: cell - firsts[ring] };
  };
  return t;
}
