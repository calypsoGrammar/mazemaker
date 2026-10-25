// Pan and zoom input on the canvas. Dragging one pointer (a finger or the
// mouse) pans; pinching two fingers zooms about their midpoint and pans with
// it; the wheel or a trackpad zooms about the pointer. Gestures only change
// the view: they never move the player, and only events on `element` count,
// so touches on the direction pad never pan.
//
// `viewport()` returns the current Viewport (or null when there is nothing to
// show) and `change(viewport)` is called with the new one after each step of a
// gesture. Returns a function that removes the listeners.

// Wheel delta, in pixels, that zooms by a factor of e.
const WHEEL_PIXELS_PER_E = 500;
// Trackpad pinches arrive as wheel events with ctrlKey and small deltas.
const PINCH_PIXELS_PER_E = 100;
// Lines and pages of wheel delta (deltaMode 1 and 2), in pixels.
const LINE_PIXELS = 16;
const PAGE_PIXELS = 800;
// The most one wheel event zooms in or out by.
const MAX_WHEEL_FACTOR = 2;

export function attachViewGestures(element, { viewport, change })
{
  // Pointers down on the element: pointerId -> last position in CSS pixels.
  const pointers = new Map();

  const at = (event) =>
  {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function down(event)
  {
    if(event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    pointers.set(event.pointerId, at(event));
    element.setPointerCapture?.(event.pointerId);
  }

  function move(event)
  {
    const previous = pointers.get(event.pointerId);
    if(previous === undefined) return;
    event.preventDefault();
    const [first, second] = pointers.keys();
    // A third finger or more is ignored.
    if(event.pointerId !== first && event.pointerId !== second) return;
    const before = second === undefined ? null : [pointers.get(first), pointers.get(second)];
    const point = at(event);
    pointers.set(event.pointerId, point);
    const view = viewport();
    if(view === null) return;
    if(before === null)
    {
      change(view.panBy(point.x - previous.x, point.y - previous.y));
      return;
    }
    const after = [pointers.get(first), pointers.get(second)];
    const [midBefore, midAfter] = [midpoint(before), midpoint(after)];
    const spanBefore = distance(before);
    const factor = spanBefore > 0 ? distance(after) / spanBefore : 1;
    // Zooming first, about where the fingers were, keeps the pan from being
    // clamped while the maze is still fitted.
    change(view.zoomAt(factor, midBefore).panBy(midAfter.x - midBefore.x, midAfter.y - midBefore.y));
  }

  function up(event)
  {
    if(!pointers.delete(event.pointerId)) return;
    element.releasePointerCapture?.(event.pointerId);
  }

  function wheel(event)
  {
    event.preventDefault();
    const view = viewport();
    if(view === null) return;
    const unit = event.deltaMode === 1 ? LINE_PIXELS : event.deltaMode === 2 ? PAGE_PIXELS : 1;
    const perE = event.ctrlKey ? PINCH_PIXELS_PER_E : WHEEL_PIXELS_PER_E;
    const factor = Math.exp(-(event.deltaY * unit) / perE);
    change(view.zoomAt(Math.min(Math.max(factor, 1 / MAX_WHEEL_FACTOR), MAX_WHEEL_FACTOR), at(event)));
  }

  const listeners = [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', up],
    ['pointercancel', up],
    ['wheel', wheel],
  ];
  for(const [type, listener] of listeners) element.addEventListener(type, listener, { passive: false });
  return () =>
  {
    for(const [type, listener] of listeners) element.removeEventListener(type, listener);
    pointers.clear();
  };
}

function midpoint([a, b])
{
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance([a, b])
{
  return Math.hypot(b.x - a.x, b.y - a.y);
}
