// Inlines src/ into a single self-contained dist/index.html (CSS + JS, no bundler).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const read = p => readFileSync(join(src, p), 'utf8').trimEnd();

let html = read('index.html')
  .replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => `<style>\n${read(p)}\n</style>`)
  .replace(/(<script type="application\/octet-stream" id="\w+" data-src="([^"]+)">)(<\/script>)/g,
    (_, open, p, close) => `${open}${readFileSync(join(src, p)).toString('base64')}${close}`)
  .replace(/<script src="((?:js|vendor)\/[^"]+)"><\/script>/g, (_, p) => {
    const code = read(p);
    if (/<\/script/i.test(code)) throw new Error(`${p} contains a closing script tag`);
    return `<script>\n${code}\n</script>`;
  });

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html + '\n');
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
