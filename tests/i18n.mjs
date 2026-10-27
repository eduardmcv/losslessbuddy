// Translation coverage: every Spanish source string must have an entry in each dictionary.
// Collects keys from T('…') calls in the source, from data tables (help texts, presets,
// tag fields, test pack) and from the static markup, then checks src/js/i18n/*.js.
//   node tests/i18n.mjs [--json]      (--json prints the missing keys for editing)
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.js') ? [join(d, f)] : []);

// String literals inside the first argument of each T( … ) call.
const keys = new Set();
for (const f of files(join(root, 'js')).filter(f => !f.includes('/i18n/'))) {
  const s = readFileSync(f, 'utf8');
  for (let i = s.indexOf('T('); i >= 0; i = s.indexOf('T(', i + 2)) {
    if (/[\w$.]/.test(s[i - 1] || '')) continue;
    let j = i + 2, depth = 0;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === "'") { let k = j + 1, lit = ''; for (; s[k] !== "'"; k++) { if (s[k] === '\\') { lit += s[k] + s[k + 1]; k++ } else lit += s[k] } keys.add(eval(`'${lit}'`)); j = k; continue }
      if (c === '`') { j = s.indexOf('`', j + 1); continue }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth-- }
      else if (c === ',' && depth === 0) break;
    }
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => { try { localStorage.setItem('lb-lang', 'es') } catch {} });
await page.goto('file://' + join(root, 'index.html'));
await page.waitForFunction(() => typeof S !== 'undefined' && S.an, null, { timeout: 60000 });
const runtime = await page.evaluate(() => {
  const out = [];
  Object.values(INFO).forEach(a => out.push(...a));
  TAGF.forEach(([, l]) => out.push(l));
  NAVCATS.forEach(([, n]) => out.push(n));
  ENTRIES.forEach(e => out.push(e.brand, e.name, e.years, e.info));
  PACK.forEach(p => out.push(p.d));
  out.push('alta', 'media', 'baja');
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('script,style,svg,[data-dyn]') ? 2 : /\S/.test(n.nodeValue) ? 1 : 2 });
  for (let n; n = w.nextNode();) out.push(n.nodeValue.trim());
  document.querySelectorAll('[aria-label],[title],[placeholder]').forEach(el => { if (!el.closest('[data-dyn]')) ['aria-label', 'title', 'placeholder'].forEach(a => el.hasAttribute(a) && out.push(el.getAttribute(a))) });
  return out;
});
await browser.close();
runtime.forEach(k => keys.add(k));

// Anything with letters needs an entry: a translation, or a listing in the language's
// SAME set (brand and model names, codec names) when it reads the same in both languages.
const CODE = new Set(['declined', 'rate_limited', 'invalid_argument']); // error codes compared inside T(…) arguments
const needed = [...keys].filter(k => /\p{L}/u.test(k) && !CODE.has(k));

let failed = 0;
for (const f of readdirSync(join(root, 'js', 'i18n'))) {
  const src = readFileSync(join(root, 'js', 'i18n', f), 'utf8');
  const { dict, same } = new Function(src + `;return {dict:${src.match(/const (\w+)=\{/)[1]},same:typeof I18N_SAME!=='undefined'?I18N_SAME:[]}`)();
  const sameSet = new Set(same);
  const missing = needed.filter(k => !(k in dict) && !sameSet.has(k));
  const stale = [...Object.keys(dict), ...sameSet].filter(k => !keys.has(k));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(missing, null, 1)); continue }
  console.log(`${f}: ${needed.length} strings, ${missing.length} missing, ${stale.length} unused`);
  missing.forEach(k => console.log('  missing: ' + JSON.stringify(k)));
  stale.forEach(k => console.log('  unused:  ' + JSON.stringify(k)));
  if (missing.length) failed++;
}
process.exit(failed ? 1 : 0);

