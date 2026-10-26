// Checks a built site before it is published to GitHub Pages: every file the
// page, its stylesheets and its scripts refer to is in the build, under the
// /mazemaker/ base the site is served from. GitHub Pages serves the project at
// https://calypsogrammar.github.io/mazemaker/, so a reference to /assets/...
// or to a file missing from the build would 404 in production.
//
//   node scripts/check-dist.mjs [dist]
//
// Exits 1 and lists the problems if there are any. Uses only Node, so a
// checkout of main can check a build of any other commit (see the rollback
// workflow).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/mazemaker/';

const external = (ref) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// The problems with the build in `dir`, as strings; empty when it is fine.
export function checkDist(dir, base = BASE) {
  const problems = [];
  const index = join(dir, 'index.html');
  if (!existsSync(index)) return [`${index} is missing`];

  // `ref` is the URL path a file in the build refers to; `from` is the URL
  // path of the referring file, for relative references.
  const check = (ref, from, where) => {
    const path = ref.split(/[?#]/)[0];
    if (path === '' || external(path)) return;
    const url = path.startsWith('/') ? path : posix.join(posix.dirname(from), path);
    if (url.startsWith('/src/') || url.includes('/src/')) problems.push(`${where}: ${ref} is a source path, not a built file`);
    else if (!url.startsWith(base)) problems.push(`${where}: ${ref} is outside the ${base} base`);
    else if (!existsSync(join(dir, decodeURIComponent(url.slice(base.length))))) problems.push(`${where}: ${ref} is not in the build`);
  };

  const html = readFileSync(index, 'utf8');
  if (!/<script[^>]*type=["']?module/.test(html)) problems.push('index.html has no module script');
  for (const [, ref] of html.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) check(ref, base, 'index.html');

  for (const file of files(dir)) {
    const name = relative(dir, file).split('\\').join('/');
    const url = base + name;
    if (file.endsWith('.css')) {
      for (const [, , ref] of readFileSync(file, 'utf8').matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) check(ref, url, name);
    } else if (file.endsWith('.js')) {
      const code = readFileSync(file, 'utf8');
      // Built files Vite refers to from scripts: chunks and assets.
      for (const [, ref] of code.matchAll(/["'`]((?:\.{1,2}\/|\/)[^"'`\s]*?\/?assets\/[^"'`\s]+\.[a-z0-9]+)["'`]/gi)) check(ref, url, name);
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'dist');
  const problems = checkDist(dir);
  if (problems.length > 0) {
    console.error(`The build in ${dir} would not load on GitHub Pages:`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(`${dir}: every referenced file is in the build, under ${BASE}`);
}
