// End-to-end check: loads the app in headless Chromium, runs the analyzer on the
// built-in demo and encodes it to every format the browser supports. If ffprobe
// is installed, each output is decoded and its codec, rate and channels verified.
//   node tests/e2e.mjs [src|dist]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const target = process.argv[2] || 'dist';
const page_url = 'file://' + join(dirname(fileURLToPath(import.meta.url)), '..', target, 'index.html');
const hasFfprobe = (() => { try { execFileSync('ffprobe', ['-version']); return true } catch { return false } })();
const out = mkdtempSync(join(tmpdir(), 'lb-'));

const CASES = [
  { o: { fmt: 'wav', bits: 16 }, codec: 'pcm_s16le' },
  { o: { fmt: 'wav', bits: 24 }, codec: 'pcm_s24le' },
  { o: { fmt: 'aiff', bits: 16 }, codec: 'pcm_s16be' },
  { o: { fmt: 'flac', bits: 16 }, codec: 'flac' },
  { o: { fmt: 'flac', bits: 24, rate: 48000 }, codec: 'flac', rate: 48000 },
  { o: { fmt: 'alac', bits: 16 }, codec: 'alac' },
  { o: { fmt: 'flac', bits: 16, mono: true }, codec: 'flac', channels: 1 },
  { o: { fmt: 'mp3', kbps: 320, rate: 44100 }, codec: 'mp3', needs: 'mp3' },
  { o: { fmt: 'aac', kbps: 256, rate: 44100 }, codec: 'aac', needs: 'aac' },
  { o: { fmt: 'opus', kbps: 128 }, codec: 'opus', rate: 48000, needs: 'opus' },
];

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failed++ };

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(page_url);
await page.waitForFunction(() => typeof S !== 'undefined' && S.an, null, { timeout: 60000 });

console.log(`Lossless Buddy · ${target}/index.html`);
const an = await page.evaluate(() => ({ verdict: S.an.v.s, cutoff: S.an.cut.hz, lufs: S.an.lufs }));
ok(an.verdict === 'bad', `demo flagged as fake lossless (cutoff ${(an.cutoff / 1000).toFixed(1)} kHz)`);
ok(Math.abs(an.lufs + 15) < 3, `integrated loudness in range (${an.lufs.toFixed(1)} LUFS)`);

for (const c of CASES) {
  const label = `${c.o.fmt.toUpperCase()} ${JSON.stringify(c.o).replace(/"/g, '')}`;
  const res = await page.evaluate(async c => {
    if (c.needs && !S.eng[c.needs]) return { skip: true };
    const o = { ...BASE, ...c.o }, rate = o.rate || S.src.rate;
    const { chans } = await processAudio(S.src.buffer, o, rate);
    const data = await encodeOne(o, chans, FMT[o.fmt].rates ? (FMT[o.fmt].rates.includes(rate) ? rate : FMT[o.fmt].rates[0]) : rate, () => {});
    return { ext: extOf(o), b64: btoa(Array.from(data, b => String.fromCharCode(b)).join('')) };
  }, c);
  if (res.skip) { console.log(`  – ${label}: encoder not available in this browser, skipped`); continue }
  const file = join(out, `out_${c.o.fmt}_${CASES.indexOf(c)}.${res.ext}`);
  writeFileSync(file, Buffer.from(res.b64, 'base64'));
  if (!hasFfprobe) { ok(true, `${label} encoded`); continue }
  try {
    const s = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file])).streams[0];
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-']);
    ok(s.codec_name === c.codec && +s.sample_rate === (c.rate || 44100) && s.channels === (c.channels || 2),
      `${label} → ${s.codec_name}, ${s.sample_rate} Hz, ${s.channels} ch, decodes cleanly`);
  } catch (e) { ok(false, `${label}: ${e.message.split('\n')[0]}`) }
}

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
