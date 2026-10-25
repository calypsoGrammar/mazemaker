# <a href='https://crhisgbibon.github.io/mazemaker/' target='_blank'>Maze Maker</a>

<p>Maze generating and pathfinding algorithm in javascript.</p>

## Development

```sh
npm ci          # install the locked dependencies
npm test        # run the tests (Node's built-in test runner with jsdom)
npm run build   # build the site into dist/
npm run dev     # serve locally
```

CI runs `npm ci`, `npm test` and `npm run build` on every pull request.
`docs/baseline.md` records the current behaviour and the known defects.
`docs/model.md` describes the topology-independent maze model in `src/javascripts/maze/`.
`docs/rendering.md` describes the geometry, viewport and Canvas 2D renderer in `src/javascripts/render/`.
`docs/controls.md` describes the input adapter and SVG direction pad in `src/javascripts/input/`.
`docs/hex.md` describes hexagonal mazes.
