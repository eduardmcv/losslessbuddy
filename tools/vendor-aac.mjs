// Regenerates src/vendor/ffmpeg-aac.js from @mediabunny/aac-encoder's Emscripten build
// (FFmpeg's native AAC-LC encoder compiled to WebAssembly, MPL-2.0 / LGPL-2.1+).
//   npm pack @mediabunny/aac-encoder@1.61.4 && tar xzf mediabunny-aac-encoder-1.61.4.tgz
//   node tools/vendor-aac.mjs package/dist/modules/build/aac.js
// The module ships the WASM as a raw latin-1 string literal (NUL bytes included), which an
// inline <script> can't carry, so it is re-embedded as base64 and wrapped as a classic script.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
const head = 'function findWasmBinary() { return binaryDecode(\'';
const a = src.indexOf(head) + head.length, b = src.indexOf('\'); }', a);
if (a < head.length || b < 0) throw new Error('WASM literal not found');
const bytes = Uint8Array.from(eval(`'${src.slice(a, b)}'`), c => c.charCodeAt(0));
if (String.fromCharCode(...bytes.slice(1, 4)) !== 'asm') throw new Error('not a WASM binary');

let body = src.slice(0, a - head.length)
  + `function findWasmBinary() { return Uint8Array.from(atob('${Buffer.from(bytes).toString('base64')}'), c => c.charCodeAt(0)); }`
  + src.slice(b + "'); }".length);
body = body
  .replace('"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\n', '')
  .replace('import.meta.url', '""')
  .replace(/exports\.default = Module;\s*$/, '');

const out = `/*! FFmpeg AAC-LC encoder (WebAssembly), from @mediabunny/aac-encoder by Vanilagy and contributors.
 * Wrapper: MPL-2.0 (https://mozilla.org/MPL/2.0/). FFmpeg: LGPL-2.1-or-later. See src/vendor/NOTICE.md. */
const createAacModule = (() => {
"use strict";
${body.trim()}
return Module;
})();
`;
if (/<\/script/i.test(out) || out.includes('\0')) throw new Error('output not safe to inline');
writeFileSync(new URL('../src/vendor/ffmpeg-aac.js', import.meta.url), out);
console.log(`src/vendor/ffmpeg-aac.js  wasm ${(bytes.length / 1024).toFixed(0)} KB, js ${(out.length / 1024).toFixed(0)} KB`);
