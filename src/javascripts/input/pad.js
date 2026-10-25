// On-screen direction pad, drawn in SVG. It shows one round button per
// direction of the player's cell, placed the way that direction faces, so it
// fits four (square), six (hex) or any other set of directions, including sets
// that change from cell to cell (triangles, polar rings). Buttons for walled
// directions stay visible but are disabled; only open passages can be chosen.
//
// The pad only reports the label chosen; the game decides what a move does.

const SVG = 'http://www.w3.org/2000/svg';
const TAU = 2 * Math.PI;

// The pad's coordinates: a 200 x 200 square centred on the origin.
const VIEW = 100;
// Distance of a button's centre from the pad's centre, and the largest button.
const RING = 62;
const MAX_RADIUS = 34;

// Words for the labels the topologies use, for screen readers.
const NAMES = {
  UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
  N: 'north', S: 'south', NE: 'north-east', NW: 'north-west', SE: 'south-east', SW: 'south-west',
  CW: 'clockwise', CCW: 'anticlockwise', IN: 'inward',
};

export function directionName(label)
{
  if(Object.hasOwn(NAMES, label)) return NAMES[label];
  const out = /^OUT(\d+)$/.exec(label);
  if(out) return `outward ${Number(out[1]) + 1}`;
  return String(label).toLowerCase();
}

const wrap = (a) => ((a % TAU) + TAU) % TAU;

// Where to draw buttons for directions facing `angles`. Directions closer
// than `minGap` (60°, or less when there are more than six) are pushed apart
// evenly, so buttons never overlap; otherwise each keeps its own angle.
// Returns the angles in the same order, and the smallest gap between them.
export function layoutAngles(angles)
{
  const n = angles.length;
  if(n < 2) return { angles: [...angles], gap: TAU };
  const minGap = Math.min(TAU / n, Math.PI / 3);
  const order = angles.map((a, i) => ({ a: wrap(a), i })).sort((p, q) => p.a - q.a || p.i - q.i);
  for(let pass = 0; pass < 200; pass++)
  {
    let moved = false;
    for(let k = 0; k < n; k++)
    {
      const p = order[k];
      const q = order[(k + 1) % n];
      const gap = k === n - 1 ? q.a + TAU - p.a : q.a - p.a;
      if(gap < minGap - 1e-9)
      {
        const push = (minGap - gap) / 2;
        p.a -= push;
        q.a += push;
        moved = true;
      }
    }
    if(!moved) break;
  }
  const out = new Array(n);
  let gap = TAU;
  for(let k = 0; k < n; k++)
  {
    out[order[k].i] = order[k].a;
    const next = k === n - 1 ? order[0].a + TAU : order[k + 1].a;
    gap = Math.min(gap, next - order[k].a);
  }
  return { angles: out, gap };
}

// A chevron pointing right, centred on the origin, `size` across.
function chevron(size)
{
  const h = size / 2;
  return `M ${-h / 2} ${-h} L ${h / 2} 0 L ${-h / 2} ${h}`;
}

// A coordinate for an attribute, without "-0.00" for rounding noise.
const fixed = (value) => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);

function element(document, name, attributes)
{
  const node = document.createElementNS(SVG, name);
  for(const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

export class DirectionPad
{
  #svg;
  #onSelect;
  #layout = null;

  // `svg` is an empty <svg> element; `onSelect(label)` is called when an open
  // direction is chosen by pointer, touch or Enter/Space on a focused button.
  constructor(svg, { onSelect })
  {
    this.#svg = svg;
    this.#onSelect = onSelect;
    svg.setAttribute('viewBox', `${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`);
    svg.setAttribute('role', 'group');
    if(!svg.hasAttribute('aria-label')) svg.setAttribute('aria-label', 'Movement controls');
    svg.addEventListener('click', (event) => this.#choose(event));
    svg.addEventListener('keydown', (event) =>
    {
      if(event.key !== 'Enter' && event.key !== ' ') return;
      if(this.#choose(event)) event.preventDefault();
    });
    // Gestures on the pad are the pad's own; they never reach the maze.
    for(const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel'])
    {
      svg.addEventListener(type, (event) => event.stopPropagation());
    }
  }

  // The buttons drawn, in the order of the directions last given.
  get buttons()
  {
    return [...this.#svg.querySelectorAll('[data-label]')];
  }

  // Shows `directions`, a list of { label, angle, open } (see directionsAt).
  // The buttons are rebuilt only when the labels or their angles change, so a
  // focused button keeps focus while the player moves on a square grid.
  update(directions)
  {
    const layout = directions.map((d) => `${d.label}@${d.angle.toFixed(6)}`).join(' ');
    if(layout !== this.#layout)
    {
      this.#layout = layout;
      this.#build(directions);
    }
    const buttons = this.buttons;
    directions.forEach((d, k) =>
    {
      const button = buttons[k];
      button.setAttribute('aria-disabled', String(!d.open));
      button.setAttribute('tabindex', d.open ? '0' : '-1');
    });
  }

  #build(directions)
  {
    const document = this.#svg.ownerDocument;
    this.#svg.replaceChildren();
    const { angles, gap } = layoutAngles(directions.map((d) => d.angle));
    const radius = directions.length < 2 ? MAX_RADIUS : Math.min(MAX_RADIUS, RING * Math.sin(gap / 2) * 0.95);
    directions.forEach((d, k) =>
    {
      const x = RING * Math.cos(angles[k]);
      const y = RING * Math.sin(angles[k]);
      const button = element(document, 'g', {
        id: `${String(d.label).toLowerCase()}Button`,
        class: 'pad-button',
        role: 'button',
        'data-label': d.label,
        'aria-label': `Move ${directionName(d.label)}`,
      });
      button.appendChild(element(document, 'circle', { cx: fixed(x), cy: fixed(y), r: fixed(radius) }));
      // The arrow shows the direction's own angle, even when the button had
      // to move aside to make room.
      const degrees = (d.angle * 180) / Math.PI;
      button.appendChild(element(document, 'path', {
        d: chevron(radius),
        transform: `translate(${fixed(x)} ${fixed(y)}) rotate(${fixed(degrees)})`,
      }));
      this.#svg.appendChild(button);
    });
  }

  // Selects the button an event happened on, if it is enabled.
  #choose(event)
  {
    const button = event.target.closest?.('[data-label]');
    if(!button || !this.#svg.contains(button)) return false;
    if(button.getAttribute('aria-disabled') === 'true') return false;
    this.#onSelect(button.getAttribute('data-label'));
    return true;
  }
}
