import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Must match the window property set in src/app/testSeam.ts.
const SEAM = '__stickyNotes';
const DIST = 'dist';

function fail(message: string): never {
  console.error(`check-bundle: ${message}`);
  process.exit(1);
}

if (!existsSync(DIST)) fail(`${DIST}/ does not exist; run pnpm build first`);

const files = readdirSync(DIST, { recursive: true, encoding: 'utf8' })
  .map((entry) => join(DIST, entry))
  .filter((path) => statSync(path).isFile());

const jsFiles = files.filter((path) => path.endsWith('.js'));
if (jsFiles.length === 0) fail(`no .js file in ${DIST}/`);

const leaking = files.filter((path) => readFileSync(path, 'utf8').includes(SEAM));
if (leaking.length > 0) {
  fail(`${SEAM} found in the production build: ${leaking.join(', ')}`);
}

console.log(`check-bundle: ${String(jsFiles.length)} JS file(s) in dist, no ${SEAM}`);
