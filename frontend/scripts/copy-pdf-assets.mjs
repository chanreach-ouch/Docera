import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  const target = resolve(root, 'public/pdf-assets', name);
  mkdirSync(target, { recursive: true });
  cpSync(resolve(root, 'node_modules/pdfjs-dist', name), target, { recursive: true });
}
// Keep upstream notices with redistributed renderer assets.
cpSync(resolve(root, 'node_modules/pdfjs-dist/LICENSE'), resolve(root, 'public/pdf-assets/LICENSE'));
