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
| `deploy.yml` | every push to main, or by hand | publishes the pushed commit through `pages.yml` |
| `rollback.yml` | by hand only | publishes the tag or commit you give it through `pages.yml` |
| `pages.yml` | called by the two above | checks out the commit, runs the same checks as CI, uploads `dist/` and deploys it with `actions/deploy-pages` |

`pages.yml` publishes nothing unless every step before the upload passes:
install, tests (including the headless Chromium tests), build and the
`/mazemaker/` check. A failed run leaves the site as it was. Runs share the
`pages` concurrency group, so two publishes never overlap; a queued one waits.
Each run's summary names the ref and commit it published.

`scripts/check-dist.mjs` (`npm run check:dist`) checks every `src` and `href`
in `index.html`, every `url()` in the stylesheets and every asset path in the
scripts. Each one must be under `/mazemaker/`, must not be a source path, and
must be a file in the build. `pages.yml` runs the copy from the workflow's own
commit, so an older release is checked the same way as a new one.

### One-time repository setup

These settings live in GitHub, not in the repository:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**. If it
   is still "Deploy from a branch", the workflows build but GitHub keeps
   serving the branch, and `actions/configure-pages` fails the run.
2. Settings → Environments → `github-pages`: the deployment branch rule must
   allow `main`. GitHub creates this rule when Actions is chosen as the source.
   Both workflows run from main, so rollbacks pass it too.

## Releasing

1. Merge to main. `deploy.yml` tests, builds and publishes it.
2. When the run is green, do the production check below.
3. Tag the published commit, so it can be restored later:
   `git tag v1.0.0 <commit> && git push origin v1.0.0`. The run summary gives
   the commit.

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

1. Actions → **Rollback** → Run workflow, on branch `main`.
2. Enter the tag (for example `v1.0.0`) or the full commit SHA to restore.
3. The run checks out that commit, installs its locked dependencies, runs its
   tests, builds it, checks it with main's `check-dist.mjs`, and publishes it.
   The summary names the commit that is now live.
4. Do the production check above.

A rollback rebuilds from source with the same lockfile and Node version, so
the result is the same as the original deploy. It does not change main. The
next push to main publishes main again, so fix or revert main before merging
anything else.

Only commits that build with this setup can be restored: v1.0.0 or later.
Earlier commits have no `check:dist` and no browser tests in CI. They still
build with `/mazemaker/`, but they are not the v1 application.

If Actions itself is unavailable, build the tag locally (`npm ci && npm test &&
npm run build && npm run check:dist`). Then switch Pages to "Deploy from a
branch" and push `dist/` to a `gh-pages` branch. Switch the source back to
GitHub Actions afterwards.
