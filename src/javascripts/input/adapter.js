// Input adapter: turns directional commands into topology labels. A cell's
// directions come from its geometry, so the same code serves any tiling: each
// neighbour lies the way its shared side faces from the cell's centre. A key
// or an on-screen control names a visual direction (an angle); the adapter
// picks the open passage that way, or none.
//
// Angles are in radians, measured like Math.atan2 with the y axis pointing
// down (as in geometry.js): 0 is right, -π/2 is up, π/2 is down, π is left.

const TAU = 2 * Math.PI;

// The smallest difference between two angles, from 0 to π.
export function angleBetween(a, b)
{
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

// The middle of a side's polyline. Sides are straight segments or symmetric
// arcs, so the mean of their points lies on the line from the centre that
// splits them in two.
function midpoint(points)
{
  const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// Tilings where every cell has the same directions. Their controls always
// show the whole set, in this order, so buttons stay put as the player moves;
// a direction off the edge of the maze is shown closed. Other tilings
// (triangles, polar rings) show only the directions of the cell itself.
export const DIRECTION_FRAMES = Object.freeze({
  square: Object.freeze([['UP', -Math.PI / 2], ['RIGHT', 0], ['DOWN', Math.PI / 2], ['LEFT', Math.PI]]),
  hex: Object.freeze([
    ['N', -Math.PI / 2], ['NE', -Math.PI / 6], ['SE', Math.PI / 6],
    ['S', Math.PI / 2], ['SW', (5 * Math.PI) / 6], ['NW', (-5 * Math.PI) / 6],
  ]),
});

// Every direction out of `cell` as { label, cell, angle, open }: the
// neighbour's label and ID (null off the edge), the way its side faces from
// the cell's centre, and whether a passage leads there. In frame order for
// the tilings above, otherwise in topology order.
export function directionsAt(maze, geometry, cell)
{
  const { topology } = maze;
  const centre = geometry.centre(cell);
  const sides = geometry.walls(cell);
  const directions = topology.links(cell).map(({ label, cell: neighbour }) =>
  {
    const side = sides.find((w) => w.neighbour === neighbour);
    const towards = side ? midpoint(side.points) : geometry.centre(neighbour);
    return Object.freeze({
      label,
      cell: neighbour,
      angle: Math.atan2(towards.y - centre.y, towards.x - centre.x),
      open: maze.isLinked(cell, neighbour),
    });
  });
  const frame = Object.hasOwn(DIRECTION_FRAMES, topology.kind) ? DIRECTION_FRAMES[topology.kind] : null;
  if(frame === null) return directions;
  return frame.map(([label, angle]) =>
    directions.find((d) => d.label === label) ?? Object.freeze({ label, cell: null, angle, open: false }));
}

// How far from the asked-for angle an open passage may be and still be taken.
// Under 90°, so on a square grid a key only ever takes its own direction.
export const DEFAULT_TOLERANCE = Math.PI / 3;

// The label of the open direction nearest `angle`, or null when none is
// within `tolerance` or two are equally near (an ambiguous command, such as
// Left between a hexagon's NW and SW passages).
export function pickDirection(directions, angle, { tolerance = DEFAULT_TOLERANCE } = {})
{
  let best = null;
  let bestDistance = Infinity;
  let tied = false;
  for(const direction of directions)
  {
    if(!direction.open) continue;
    const distance = angleBetween(direction.angle, angle);
    if(distance > tolerance + 1e-9) continue;
    if(Math.abs(distance - bestDistance) < 1e-9) tied = true;
    else if(distance < bestDistance)
    {
      best = direction;
      bestDistance = distance;
      tied = false;
    }
  }
  return best === null || tied ? null : best.label;
}

// Arrow keys and WASD in either case (Shift or Caps Lock), as visual angles.
export const KEY_ANGLES = Object.freeze({
  arrowup: -Math.PI / 2, w: -Math.PI / 2,
  arrowdown: Math.PI / 2, s: Math.PI / 2,
  arrowleft: Math.PI, a: Math.PI,
  arrowright: 0, d: 0,
});

// The angle a key asks for, or undefined for a key that is not a direction.
export function keyAngle(key)
{
  const name = String(key).toLowerCase();
  return Object.hasOwn(KEY_ANGLES, name) ? KEY_ANGLES[name] : undefined;
}
