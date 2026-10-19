// Builds the static site into dist/: the game itself (public/) plus the few
// library files it loads. GitHub Pages serves dist/ as-is; there is no game
// server, the hosting player's browser runs each match.
// Usage: npm run build

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const NM = path.join(ROOT, 'node_modules');

const copy = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};

fs.rmSync(OUT, { recursive: true, force: true });
copy(path.join(ROOT, 'public'), OUT);

copy(path.join(NM, 'three', 'build', 'three.module.min.js'), path.join(OUT, 'vendor', 'three.module.min.js'));
copy(path.join(NM, 'peerjs', 'dist', 'peerjs.min.js'), path.join(OUT, 'vendor', 'peerjs.min.js'));

// VT323 (the camcorder font): only the latin subset
const fontDir = path.join(NM, '@fontsource', 'vt323');
copy(path.join(fontDir, 'latin-400.css'), path.join(OUT, 'vendor', 'vt323', 'latin-400.css'));
for (const f of ['vt323-latin-400-normal.woff2', 'vt323-latin-400-normal.woff']) {
  copy(path.join(fontDir, 'files', f), path.join(OUT, 'vendor', 'vt323', 'files', f));
}

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let files = 0, bytes = 0;
const count = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count(p);
    else { files++; bytes += fs.statSync(p).size; }
  }
};
count(OUT);
console.log(`Static build written to dist/ (${files} files, ${(bytes / 1e6).toFixed(1)} MB)`);
