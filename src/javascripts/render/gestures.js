// Pan and zoom input on the canvas. One pointer (a finger, or a mouse with
// the main button) drags the view; two fingers pinch to zoom about their
// midpoint and pan as it moves; the mouse wheel or a trackpad zooms about the
// pointer. Gestures only change the view: they never move the player, and only
// pointers that start on the canvas count, so the direction pad never pans.
//
// `getViewport()` returns the current Viewport; `setView(viewport)` applies a
// new one (its zoom and pan) and redraws. Returns a function that detaches the
// listeners.

// Zoom factor per pixel of wheel movement.
const WHEEL_ZOOM_RATE = 0.002;
// Pixels per wheel "line" and "page" (WheelEvent.deltaMode 1 and 2).
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 800;

export function attachViewGestures(canvas, { getViewport, setView })
{
  // Pointer ID -> last position in CSS pixels from the canvas's top-left.
  const pointers = new Map();

  function local(event)
  {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function update(next)
  {
    const viewport = getViewport();
    if(viewport === null) return;
    setView(next(viewport));
  }

  function onPointerDown(event)
  {
    if(event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, local(event));
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event)
  {
    const before = pointers.get(event.pointerId);
    if(before === undefined) return;
    event.preventDefault();
    const [a, b] = [...pointers.keys()];
    const oldA = pointers.get(a), oldB = b === undefined ? null : pointers.get(b);
    const now = local(event);
    pointers.set(event.pointerId, now);

    if(oldB === null)
    {
      update((v) => v.pannedBy(now.x - before.x, now.y - before.y));
      return;
    }
    // Pinch: only the first two pointers count.
    if(event.pointerId !== a && event.pointerId !== b) return;
    const newA = pointers.get(a), newB = pointers.get(b);
    const oldMid = midpoint(oldA, oldB), newMid = midpoint(newA, newB);
    const oldDistance = distance(oldA, oldB), newDistance = distance(newA, newB);
    const factor = oldDistance > 0 && newDistance > 0 ? newDistance / oldDistance : 1;
    // Zoom first, so that a pinch out from the fitted view has room to pan.
    update((v) => v.zoomedAt(factor, oldMid).pannedBy(newMid.x - oldMid.x, newMid.y - oldMid.y));
  }

  function onPointerEnd(event)
  {
    pointers.delete(event.pointerId);
  }

  function onWheel(event)
  {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? PAGE_HEIGHT : 1;
    const factor = Math.exp(-event.deltaY * unit * WHEEL_ZOOM_RATE);
    if(factor === 1 || !Number.isFinite(factor)) return;
    const focus = local(event);
    update((v) => v.zoomedAt(factor, focus));
  }

  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerEnd],
    ['pointercancel', onPointerEnd],
    ['lostpointercapture', onPointerEnd],
    ['wheel', onWheel],
  ];
  for(const [type, listener] of listeners) canvas.addEventListener(type, listener, { passive: false });
  return function detach()
  {
    for(const [type, listener] of listeners) canvas.removeEventListener(type, listener);
    pointers.clear();
  };
}

function midpoint(p, q)
{
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

function distance(p, q)
{
  return Math.hypot(p.x - q.x, p.y - q.y);
}
