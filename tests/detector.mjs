// Fake-lossless detector calibration. Builds real and transcoded fixtures with FFmpeg
// (pink noise, so the whole band is populated), runs them through the analyzer in
// headless Chromium and checks verdict and estimated source bitrate.
//   node tests/detector.mjs [src|dist]      (needs ffmpeg with libmp3lame)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const target = process.argv[2] || 'dist';
const url = 'file://' + join(dirname(fileURLToPath(import.meta.url)), '..', target, 'index.html');
const dir = mkdtempSync(join(tmpdir(), 'lb-det-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const at = f => join(dir, f);
const tpdf = 'aresample=dither_method=triangular';

ff('-f', 'lavfi', '-i', 'anoisesrc=c=pink:r=44100:a=0.5:d=30', '-f', 'lavfi', '-i', 'anoisesrc=c=pink:r=44100:a=0.5:d=30:seed=7',
  '-filter_complex', "[0][1]amerge=inputs=2,volume='0.6+0.4*sin(2*PI*t*0.5)':eval=frame", '-c:a', 'pcm_f32le', at('src.wav'));
const lp = (f, n = 4) => Array(n).fill(`lowpass=f=${f}`).join(',');
const flac = (input, out, af = tpdf) => ff('-i', at(input), '-sample_fmt', 's16', '-af', af, at(out));
flac('src.wav', 'real_full.flac');
flac('src.wav', 'real_rolloff.flac', `lowpass=f=9000:poles=1,${tpdf}`);
flac('src.wav', 'real_brick21k5.flac', `${lp(21500)},${tpdf}`);
for (const b of [128, 320]) { ff('-i', at('src.wav'), '-c:a', 'libmp3lame', '-b:a', `${b}k`, at(`m${b}.mp3`)); flac(`m${b}.mp3`, `mp3_${b}.flac`) }
flac('m320.mp3', 'mp3_320_shaped.flac', 'aresample=dither_method=shibata');

const CASES = [
  ['real_full.flac', 'good'], ['real_rolloff.flac', 'good'], ['real_brick21k5.flac', 'good'],
  ['mp3_128.flac', 'bad', /128/], ['mp3_320.flac', 'bad', /320/], ['mp3_320_shaped.flac', 'bad', /320/],
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => typeof S !== 'undefined' && S.an, null, { timeout: 60000 });
let failed = 0;
console.log(`Detector calibration · ${target}/index.html`);
for (const [file, want, est] of CASES) {
  const r = await page.evaluate(async ([n, b64]) => {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    await loadFile(new File([u], n));
    return { s: S.an.v.s, t: S.an.v.t, est: S.an.v.est || '', cut: S.an.cut.full ? 'full band' : (S.an.cut.hz / 1000).toFixed(1) + ' kHz' };
  }, [file, readFileSync(at(file)).toString('base64')]);
  const pass = r.s === want && (!est || est.test(r.est));
  if (!pass) failed++;
  console.log(`${pass ? '  ✓' : '  ✗'} ${file.padEnd(22)} ${r.t} · ${r.cut}${r.est ? ' · ' + r.est : ''}`);
}
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} case(s) misclassified` : '\nall cases classified correctly');
process.exit(failed ? 1 : 0);
