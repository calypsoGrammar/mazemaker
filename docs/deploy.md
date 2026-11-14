# Deployment and rollback (CAL-1245 / MM-V1-16)

The site is published to GitHub Pages at
<https://calypsogrammar.github.io/mazemaker/>. It is a project site, so every
file is served under `/mazemaker/`. `vite.config.js` sets `base: '/mazemaker/'`,
and the built `index.html` refers to `/mazemaker/assets/…`. Keep both: a
different base, or a file left out of the build, is a 404 in production.

## Workflows

| Workflow | Runs on | Does |
|---|---|---|
| `ci.yml` | every pull request and push to main | `npm ci`, Chromium for the browser tests, `npm test` with `REQUIRE_BROWSER=1`, `npm run build`, `npm run check:dist` |
| `deploy.yml` | by hand only | calls the shared `github-pages.yml` in `calypsoGrammar/deploy-workflows` (`@v1`): builds a commit of main whose `build` check passed and publishes `dist/` |
| `stable.yml` | daily, or by hand | moves the `stable` tag to a release that has been live for 48 hours; pins a commit or clears the production hold by hand |

Merging to main does not publish. The deploy refuses a commit that is not on
main or whose CI `build` job (tests, build and the `/mazemaker/` check) did not
pass. A dry run (the default) builds and checks without publishing. Every real
run records a GitHub deployment with task `release`.

`scripts/check-dist.mjs` (`npm run check:dist`) checks every `src` and `href`
in `index.html`, every `url()` in the stylesheets and every asset path in the
scripts. Each one must be under `/mazemaker/`, must not be a source path, and
must be a file in the build. It runs in CI, so a commit is only publishable if
it passed.

### One-time repository setup

These settings live in GitHub, not in the repository:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**. If it
   is still "Deploy from a branch", GitHub keeps serving the branch.
2. Settings → Environments → `github-pages`: the deployment branch rule must
   allow `main`. GitHub creates this rule when Actions is chosen as the source.

## Releasing

1. Merge to main and wait for CI to pass.
2. Actions → **deploy** → Run workflow, on branch `main`, with **Dry run**
   unticked and `ref` empty (main) or the commit to publish.
3. When the run is green, do the production check below.

A release is not complete until the production check passes. The tests run
the built site from a local server (`test/pages.test.js`), not the live URL.

### Production check

At <https://calypsogrammar.github.io/mazemaker/>, in a desktop browser and on
a phone:

1. The page loads with the maze, toolbar and pad, and the console and the
   network panel show no errors or 404s.
2. In Settings, for each shape (Square, Hexagon, Triangle, Circle), generate a
   maze and finish it with the pad or the keys. One move runs along a
   corridor to its next junction.
3. Change the mode (Mixed, Winding, Fanning, Branching) and generate again
   each time.
4. Show route draws the way to the exit and follows the player. Press it
   again to hide the route.
5. Zoom (wheel, or pinch on a phone) and pan (drag), then Fit maze to screen.
   The player does not move.
6. Reload `https://calypsogrammar.github.io/mazemaker` (no trailing slash).
   Pages redirects it to the canonical URL.

`docs/release.md` lists the longer manual pass across browsers and assistive
technology.

## Rolling back

To put an earlier release back:

1. Actions → **deploy** → Run workflow, on branch `main`, with **Dry run**
   unticked.
2. Either enter the tag or commit to restore in `ref`, or tick **rollback**
   with `ref` empty to publish the `stable` tag.
3. Do the production check above.

A rollback rebuilds the commit from source with its own lockfile. A run with
**rollback** ticked also sets the `deploy-hold` tag, so later deploys refuse
until main is fixed and the hold is cleared (Actions → **stable** → Run
workflow → `clear-hold`).

If Actions itself is unavailable, build the tag locally (`npm ci && npm test &&
npm run build && npm run check:dist`). Then switch Pages to "Deploy from a
branch" and push `dist/` to a `gh-pages` branch. Switch the source back to
GitHub Actions afterwards.

## Decision record (CAL-1378 / CAL-1649)

The owner chose option A: a GitHub Actions workflow builds main and deploys
`dist/` with `actions/deploy-pages`, the Pages source is GitHub Actions, and a
rollback re-runs the deploy for a known-good commit. The workflows above
already do this, so CAL-1649 needed no code change. The Pages source is a
repository setting; a person confirms it is set to GitHub Actions.

## Decision record (CAL-1503)

CAL-1503 asked for the Pages source to be set to GitHub Actions, the first live
deploy to be checked, and `v1.0.0` to be tagged. The owner closed it as already
covered by "One-time repository setup", "Releasing" and "Production check"
above, so it needed no code change. The three steps are still done by a person
with repository access, not by CI.
