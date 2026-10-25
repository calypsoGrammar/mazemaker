// Geometry: where the cells of a topology are, in world units. It knows nothing
// about passages, the canvas or the player; renderers read it to draw any grid.
//
// A geometry provides:
//   kind              the topology kind it lays out
//   bounds            { minX, minY, maxX, maxY } enclosing every cell
//   centre(cell)      { x, y } inside the cell, where markers are drawn
//   outline(cell)     the cell's boundary as a closed list of { x, y } points
//   walls(cell)       one { neighbour, points } per side of the cell: the
//                     neighbour on the other side (null on the outer edge) and
//                     the side as a polyline of { x, y } points. Every
//                     neighbour in the topology has exactly one side, and two
//                     neighbours share the same side.
// The y axis points down, as on a canvas.

const SQRT3 = Math.sqrt(3);

const point = (x, y) => ({ x, y });

// Shared sides are listed once per cell, so build each list once.
function cached(topology, build)
{
  const store = new Array(topology.size);
  return (cell) =>
  {
    if(!topology.has(cell)) throw new RangeError(`cell ${cell} does not exist`);
    return store[cell] ??= Object.freeze(build(cell));
  };
}

// Sides of a polygon: corner k to corner k + 1, each labelled with the
// direction in `labels[k]`.
function polygonWalls(topology, cell, corners, labels)
{
  return labels.map((label, k) => Object.freeze({
    neighbour: label === null ? null : topology.neighbourByLabel(cell, label),
    points: Object.freeze([corners[k], corners[(k + 1) % corners.length]]),
  }));
}

function polygonGeometry(topology, bounds, cornersOf, labelsOf)
{
  const outline = cached(topology, cornersOf);
  return {
    kind: topology.kind,
    bounds: Object.freeze(bounds),
    outline,
    centre: (cell) =>
    {
      const corners = outline(cell);
      const sum = corners.reduce((s, p) => point(s.x + p.x, s.y + p.y), point(0, 0));
      return point(sum.x / corners.length, sum.y / corners.length);
    },
    walls: cached(topology, (cell) => polygonWalls(topology, cell, outline(cell), labelsOf(cell))),
  };
}

// Unit squares; column c, row r covers [c, c + 1] x [r, r + 1].
export function squareGeometry(topology)
{
  const bounds = { minX: 0, minY: 0, maxX: topology.cols, maxY: topology.rows };
  return polygonGeometry(topology, bounds, (cell) =>
  {
    const { column: c, row: r } = topology.coordsOf(cell);
    return [point(c, r), point(c + 1, r), point(c + 1, r + 1), point(c, r + 1)];
  }, () => ['UP', 'RIGHT', 'DOWN', 'LEFT']);
}

// Flat-topped hexagons with unit sides; odd columns sit half a cell lower.
export function hexGeometry(topology)
{
  const centreOf = (cell) =>
  {
    const { column: c, row: r } = topology.coordsOf(cell);
    return point(1 + 1.5 * c, (SQRT3 / 2) * (1 + 2 * r + (c % 2)));
  };
  const bounds = {
    minX: 0,
    minY: 0,
    maxX: 1.5 * topology.cols + 0.5,
    maxY: SQRT3 * topology.rows + (topology.cols > 1 ? SQRT3 / 2 : 0),
  };
  const geometry = polygonGeometry(topology, bounds, (cell) =>
  {
    const { x, y } = centreOf(cell);
    // Corners clockwise from the right-hand one.
    return [0, 1, 2, 3, 4, 5].map((k) => point(x + Math.cos(k * Math.PI / 3), y + Math.sin(k * Math.PI / 3)));
  }, () => ['SE', 'S', 'SW', 'NW', 'N', 'NE']);
  return { ...geometry, centre: centreOf };
}

// Equilateral triangles with unit sides, each half a side to the right of the
// one before. A cell points up when column + row is even. A row's bottom is
// computed the same way as the next row's top, so cells on either side of a
// horizontal side give exactly the same corners and walls meet without gaps.
export function triangleGeometry(topology)
{
  const height = SQRT3 / 2;
  const bounds = { minX: 0, minY: 0, maxX: (topology.cols + 1) / 2, maxY: topology.rows * height };
  return polygonGeometry(topology, bounds, (cell) =>
  {
    const { column: c, row: r } = topology.coordsOf(cell);
    const left = c / 2;
    const top = r * height;
    const bottom = (r + 1) * height;
    return topology.pointsUp(cell)
      ? [point(left + 0.5, top), point(left + 1, bottom), point(left, bottom)]
      : [point(left, top), point(left + 1, top), point(left + 0.5, bottom)];
  }, (cell) => (topology.pointsUp(cell) ? ['RIGHT', 'DOWN', 'LEFT'] : ['UP', 'RIGHT', 'LEFT']));
}

// Polar grid centred on the origin. Ring k lies between radius k and k + 1, so
// the centre cell is a unit disc. Cell i of a ring with n cells spans the angles
// [i, i + 1] * 2π / n, clockwise from the positive x axis.
export function polarGeometry(topology)
{
  const sizes = topology.ringSizes;
  const span = (cell) =>
  {
    const { ring, index } = topology.coordsOf(cell);
    const step = (2 * Math.PI) / sizes[ring];
    return { ring, from: index * step, to: (index + 1) * step };
  };
  // An arc as a polyline, with enough points to look round at any radius.
  const arc = (radius, from, to) =>
  {
    const segments = Math.max(2, Math.ceil((to - from) * radius * 4));
    return Array.from({ length: segments + 1 }, (_, k) =>
    {
      const a = from + ((to - from) * k) / segments;
      return point(radius * Math.cos(a), radius * Math.sin(a));
    });
  };
  const ray = (angle, inner, outer) => [
    point(inner * Math.cos(angle), inner * Math.sin(angle)),
    point(outer * Math.cos(angle), outer * Math.sin(angle)),
  ];
  const side = (neighbour, points) => Object.freeze({ neighbour, points: Object.freeze(points) });

  const walls = cached(topology, (cell) =>
  {
    const { ring, from, to } = span(cell);
    const list = [];
    if(ring > 0)
    {
      list.push(side(topology.neighbourByLabel(cell, 'CCW'), ray(from, ring, ring + 1)));
      list.push(side(topology.neighbourByLabel(cell, 'IN'), arc(ring, from, to)));
      list.push(side(topology.neighbourByLabel(cell, 'CW'), ray(to, ring, ring + 1)));
    }
    // The outer side: one piece per outward neighbour, or the outer edge.
    const outward = topology.links(cell).filter((n) => n.label.startsWith('OUT'));
    if(outward.length === 0) list.push(side(null, arc(ring + 1, from, to)));
    const part = (to - from) / outward.length;
    outward.forEach(({ cell: n }, k) => list.push(side(n, arc(ring + 1, from + k * part, from + (k + 1) * part))));
    return list;
  });

  const R = topology.rings;
  return {
    kind: topology.kind,
    bounds: Object.freeze({ minX: -R, minY: -R, maxX: R, maxY: R }),
    centre: (cell) =>
    {
      const { ring, from, to } = span(cell);
      if(ring === 0) return point(0, 0);
      const a = (from + to) / 2;
      return point((ring + 0.5) * Math.cos(a), (ring + 0.5) * Math.sin(a));
    },
    outline: cached(topology, (cell) =>
    {
      const { ring, from, to } = span(cell);
      const outer = arc(ring + 1, from, to);
      if(ring === 0) return outer.slice(0, -1);
      return [...outer, ...arc(ring, from, to).reverse()];
    }),
    walls,
  };
}

// Topology kind -> geometry factory. A new topology adds its layout here.
export const geometries = Object.freeze({
  square: squareGeometry,
  hex: hexGeometry,
  triangle: triangleGeometry,
  polar: polarGeometry,
});

export function geometryFor(topology)
{
  const factory = geometries[topology.kind];
  if(!factory) throw new RangeError(`no geometry for topology kind ${topology.kind}`);
  return factory(topology);
}
