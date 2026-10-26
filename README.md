# [Maze Maker](https://calypsogrammar.github.io/mazemaker/)

A maze generator and pathfinder that runs in the browser:
<https://calypsogrammar.github.io/mazemaker/>.

## Version 1

- Four shapes: square, hexagon, triangle and circle (polar).
- Four generator modes: Mixed, Winding, Fanning and Branching, from 2 to 50
  cells across.
- Moves run along a corridor to its next junction. Play with the on-screen
  direction pad, or with the arrow keys and WASD (QWE/ASD and the number keys
  on hexagons, 1–9 for outward passages on circles).
- Show route draws the shortest way to the exit and follows the player.
- Zoom and pan with the wheel, a drag or a pinch; Fit maze to screen resets
  the view.
- Settings cover shape, mode, size, Auto-new and Auto-increment.
- Works on phones, tablets and desktops, with keyboard access, screen reader
  labels and reduced motion.

It is a static site: plain JavaScript modules and a Canvas 2D renderer,
styled with Tailwind and built with Vite. There is no server, account or
stored data.

## Development

Use Node.js 22 or later.

```sh
npm ci             # install the locked dependencies
npm run dev        # serve locally at http://localhost:5173/mazemaker/
npm test           # run the tests (Node's built-in test runner)
npm run build      # build the site into dist/
npm run preview    # serve dist/ at http://localhost:4173/mazemaker/
npm run check:dist # check dist/ will load under /mazemaker/ on GitHub Pages
```

The site is always served under `/mazemaker/` (`base` in `vite.config.js`),
locally too, to match GitHub Pages.

## Architecture

| Part | Where | Described in |
|---|---|---|
| Page and game loop | `index.html`, `src/javascripts/main.js` | `docs/interface.md` |
| Maze model: topologies, generation, solving, corridors | `src/javascripts/maze/` | `docs/model.md` |
| Geometry, viewport, layout, gestures, Canvas renderer | `src/javascripts/render/` | `docs/rendering.md` |
| Keyboard and direction pad | `src/javascripts/input/` | `docs/controls.md` |
| Styles (Tailwind) | `src/stylesheets/style.css` | `docs/interface.md` |

Each shape has its own notes: `docs/hex.md`, `docs/triangle.md` and
`docs/polar.md`. `docs/baseline.md` records the behaviour before v1.

## Testing

`npm test` runs every `test/*.test.js`:

- jsdom tests load the page and drive the game. They cover the model, every
  shape × mode, controls, rendering, the viewport and the interface.
- `test/browser.test.js` plays the dev server in headless Chromium. It checks
  touch, mobile layouts, the keyboard and reduced motion.
- `test/pages.test.js` builds the production site and serves it from
  `/mazemaker/` as Pages does. It checks that every file loads, then plays
  every shape and mode in Chromium, with the route, zoom, pan and settings.

The Chromium tests use Playwright, which is a dev dependency. Run
`npx playwright install chromium` once to get the browser. Without it the
Chromium tests are skipped; with `REQUIRE_BROWSER=1`, as in CI, they fail
instead. `docs/release.md` has the release review and the manual pass.

## Deployment and rollback

GitHub Actions tests, builds and publishes main to GitHub Pages on every push
(`.github/workflows/deploy.yml`). Nothing is published unless the tests, the
build and the `/mazemaker/` check pass. To put an earlier release back, run
the **Rollback** workflow with its tag or commit. `docs/deploy.md` covers the
one-time Pages setup, releasing, the production check and rollback.
