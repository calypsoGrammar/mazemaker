// Page layout: where the toolbar, the maze and the direction pad go in a
// window of `width` x `height` CSS pixels. Regions are { left, top, width,
// height } in CSS pixels and never overlap.
//
// Portrait and roomy screens stack them: the toolbar across the top, the maze
// under it in 62.5% of the height, and the pad in the rest (30% of the height
// under a toolbar of 7.5%). A short landscape screen (a phone on its side) has
// too little height for that: the pad's buttons would be smaller than a
// fingertip. There the pad goes beside the maze instead, on the right, as a
// square as tall as the space under the toolbar (at most 40% of the width).
// Hiding the pad gives its space to the maze in both layouts.

// The toolbar is 7.5% of the height, and never shorter than a touch target.
const TOOLBAR_SHARE = 0.075;
export const MIN_TOOLBAR = 44;
// The stacked maze area's height, as a share of the window's.
const GAME_SHARE = 0.625;
// Landscape screens shorter than this put the pad beside the maze. The
// stacked pad is under 30% of the height, and a button of a six-way (hex) pad
// is under 30% of the pad across, so below this it would be under 44 px.
export const SIDE_LAYOUT_MAX_HEIGHT = 540;
// The most of the width the pad takes beside the maze.
const SIDE_PAD_SHARE = 0.4;
// The canvas is a square of this share of the maze region's shorter side.
const CANVAS_SHARE = 0.9;

export function pageLayout({ width, height, padShown = true })
{
  const toolbar = { left: 0, top: 0, width, height: Math.max(height * TOOLBAR_SHARE, MIN_TOOLBAR) };
  const below = Math.max(0, height - toolbar.height);
  const side = width > height && height < SIDE_LAYOUT_MAX_HEIGHT;
  let game, pad = null;
  if(side)
  {
    const padWidth = padShown ? Math.min(below, width * SIDE_PAD_SHARE) : 0;
    game = { left: 0, top: toolbar.height, width: width - padWidth, height: below };
    if(padShown) pad = { left: width - padWidth, top: toolbar.height, width: padWidth, height: below };
  }
  else if(padShown)
  {
    game = { left: 0, top: toolbar.height, width, height: Math.min(height * GAME_SHARE, below) };
    pad = { left: 0, top: toolbar.height + game.height, width, height: below - game.height };
  }
  else game = { left: 0, top: toolbar.height, width, height: below };
  const canvas = Math.max(0, Math.min(game.width, game.height) * CANVAS_SHARE);
  return { side, toolbar, game, pad, canvas };
}
