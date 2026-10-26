# Release review (CAL-1244 / MM-V1-15)

A review of every shape, generator mode and input before release: mobile
usability, accessibility and regressions. The automated part is in two
files, both run by `npm test`:

- `test/release.test.js` runs in jsdom, always. It plays every shape × mode
  and checks the layout arithmetic, but it has no CSS layout and simulates
  touch and media queries.
- `test/browser.test.js` runs in headless Chromium through Playwright, with
  touch emulation, mobile viewports, rotation, the keyboard and emulated
  reduced motion. It measures the laid-out page. Playwright is found as
  `test/playwright.js` describes: `PLAYWRIGHT_MODULE`, a global install
  (`/usr/local/lib/node_modules/playwright`) or the `playwright` dev
  dependency, with `PLAYWRIGHT_BROWSERS_PATH` (default
  `/usr/local/share/ms-playwright`) or `CHROMIUM_PATH` for the browser.
  Without a browser it is skipped. Since CAL-1245, CI and the Pages deploy
  install Chromium and set `REQUIRE_BROWSER=1`, so there it must run
  (`docs/deploy.md`).

For CAL-1244 the browser tests were run in headless Chromium (the
`@sparticuz/chromium` build, through `playwright-core`), and all passed. Run
against the code before this ticket, they failed on the toolbar size, reduced
motion and pad focus. No WebKit (Safari), Firefox or real device was
available, so a person still has to do the manual pass below.

## Fixed

| Defect | Fix |
|---|---|
| A phone on its side stacked the pad under a tiny maze. At 844 × 390 the toolbar was 29 px, pad buttons about 40 px and the maze 219 px. | Short landscape screens put the pad beside the maze (`pageLayout`, `docs/rendering.md`). At 844 × 390 the maze is 308 px and pad buttons about 100 px. |
| The toolbar shrank below a touch target on short screens. | It is never shorter than 44 px; its buttons stay 40 px. |
| `prefers-reduced-motion` only stopped colour transitions; every move still slid along its corridor. | With reduced motion a move goes straight to the end of its run (`docs/model.md`). |
| On triangles and circles the pad's buttons are rebuilt as the player moves, so a keyboard user playing the pad lost focus to the page after each move. | Focus goes to the new button for the same direction, or the first open one (`docs/controls.md`). |
| A resize to a window with no room (size 0) made the view clamp throw. | Nothing is drawn until there is room. |
| `main.js` had a dead `FlipPad` that used an undeclared variable, and lookups of icon elements that no longer exist. | Removed. |

## Checked in headless Chromium

At 320 × 568, 390 × 844, 768 × 1024 and those on their side, and at
1280 × 800 and 1920 × 1080 desktops, with touch on phones and tablets:

- for every shape, the laid-out toolbar is at least 44 px with 40 px buttons,
  every pad button is at least 44 px, and the maze, toolbar and pad buttons
  are in view and never overlap, also after rotating;
- the page never scrolls;
- every shape is finished with `page.tap` on the pad, upright and on its side;
- touch taps, a one-finger drag and a two-finger pinch on the maze (real
  touch events through the DevTools protocol), and a mouse drag, wheel and
  click, never move the player; the pad still works afterwards;
- Tab reaches the settings, Enter opens them and Escape returns focus; every
  shape is finished with the keys; a circle maze is finished with Tab and
  Enter on the pad, and focus stays on the pad after every move;
- with `prefers-reduced-motion: reduce` emulated, a pad tap has moved the
  player before any animation frame; without it, the move animates;
- no page errors or console errors.

## Checked in jsdom

Phone (320 × 568 to 414 × 896), tablet (768 × 1024, 820 × 1180) and desktop
(800 × 600 to 1920 × 1080) windows, phones and tablets in both orientations:

- the toolbar, maze and pad stay in the window and never overlap, with the
  pad shown or hidden, so the pad never covers the maze;
- the toolbar is at least 44 px, and every pad button of every shape is at
  least 44 px across (no cell of any shape has more than six directions);
- rotating switches layout and keeps the maze, the player and the zoom;
- every shape × mode (4 × 4) is played to the exit by tapping the pad,
  upright and on its side, ending in the completion banner;
- with Auto-new, finishing goes on to a larger maze of the same shape and mode;
- every shape × mode is played to the exit with keys alone, with the route
  shown and following the player;
- every shape is played to the exit from focused pad buttons with Enter, and
  focus stays on the pad;
- the toolbar buttons are in the tab order, settings are labelled, and
  Escape closes them and returns focus;
- taps, drags, pinches, cancelled touches and the wheel on the canvas of every
  shape never move the player, and the pad still works once zoomed;
- reduced motion on every shape, and switching it while playing;
- no uncaught errors from the page in any of the above.

## Manual pass still to do

On iOS Safari, Android Chrome, and desktop Chrome, Firefox and Safari:

1. Load the production URL. The maze, toolbar and pad show with no page
   scroll.
2. Phone upright, then on its side, then upright again. On its side the pad
   is to the right of the maze, and nothing overlaps. Repeat with the pad
   hidden.
3. Finish one maze of each shape with the pad. Pinch and drag the maze
   between moves. The player only moves on pad taps, and the page itself
   never zooms or scrolls.
4. Double-tap a pad button quickly: two moves, no page zoom.
5. Desktop: finish one maze of each shape with the keyboard only, including
   Tab to the pad and Enter. Open the settings with the keyboard, change shape
   and mode, Generate.
6. Turn on the system's reduce-motion setting: moves jump without sliding.
7. Turn on a screen reader (VoiceOver, TalkBack, NVDA): toolbar buttons, pad
   buttons and settings are announced by name, and completion is announced.
8. Check the browser console shows no errors.
