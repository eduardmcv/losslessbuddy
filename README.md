# Lossless Buddy

An audio converter and analyzer that runs entirely in the browser, designed as a piece of retro rack hardware. Drop in a file and it tells you whether that "lossless" FLAC is really a re-encoded MP3, measures its loudness, and converts it to whatever your car stereo, iPod, DJ deck or streaming platform actually plays. Nothing is uploaded: decoding, analysis and encoding all happen client-side.

**[Live demo →](https://eduardmcv.github.io/losslessbuddy/)**

![Analyzer unit](docs/analyzer.png)

## Features

**Analyzer (LB-1)**
- **Fake-lossless detection.** Finds the spectral cutoff and checks how abrupt it is, how stable it stays over time, band holes, upsampled hi-res and padded 24-bit. Gives a verdict (REAL / LOSSY / DUDA / FAKE) with a confidence score and the likely source bitrate (e.g. "≈ MP3 128 kbps"), mapped to LAME's lowpass table.
- **Loudness per ITU-R BS.1770-4 / EBU R128:** integrated LUFS, loudness range (LRA), 4× oversampled true peak and dynamic range. Results agree with `ffmpeg -af ebur128` to within ±0.05 LU.
- **Spectrogram** with linear or logarithmic frequency scale.
- **Analog-style playback.** Needle meter, LED ladder, and a tuning dial with a draggable wheel to pick the start point.

**Converter (LB-2)**
- **Encoders:** FLAC, ALAC, WAV, AIFF, MP3, AAC (LC/HE, CBR/VBR, `.m4a` / `.m4b` / ADTS) and Opus (`.opus` / `.ogg`).
- **Resampling, bit depth and channels:** resampling, TPDF dither, mono downmix, and normalization to a LUFS target or to peak, with a −1 dBTP ceiling.
- **Preset browser:** 76 presets organised by category › brand › model (car head units, portable players, phones, Bluetooth codecs, DJ gear, upload platforms, voice, archiving). It has search and keyboard navigation, and there is a "request a preset" flow for missing devices.
- **Test pack:** builds a zip of the same 30-second clip in 8 formats, to find what an unknown device accepts.

**Label (LB-3)**
- **Tags:** reads and writes ID3v2.3 (+ optional ID3v1), Vorbis comments, MP4 `ilst` atoms and RIFF INFO.
- **Cover art:** re-encodes the cover as a square baseline JPEG (500 / 600 / 1000 px) for head units that choke on large or progressive images.

| Converter | Label |
|---|---|
| ![Converter](docs/converter.png) | ![Label](docs/label.png) |

## How it works

No frameworks and no bundler; it ships as one HTML file. Every container format is written by hand:

| Area | Implementation |
|---|---|
| Decoding / resampling | Web Audio `decodeAudioData` + `OfflineAudioContext` |
| FLAC | Own encoder: fixed predictors (order 0–4), partitioned Rice coding, CRC-8/16, STREAMINFO + VORBIS_COMMENT + PICTURE blocks |
| ALAC | Own encoder: stereo decorrelation, adaptive Golomb coding, raw-frame fallback. Output decodes bit-exact in FFmpeg |
| AAC / Opus | WebCodecs `AudioEncoder` → own MP4 muxer (`esds`, `stts`, `ilst`, `covr`) and Ogg muxer (OpusHead/OpusTags, page lacing, CRC) |
| MP3 | [lamejs](https://github.com/zhuker/lamejs) + own ID3v2.3 writer |
| WAV / AIFF | Own writers incl. `LIST/INFO`, 80-bit extended sample rate and `ID3 ` chunk |
| Analysis | K-weighting biquads, gated loudness, polyphase true-peak, FFT spectrogram |

```
src/
├── index.html            markup + script order
├── assets/               preview track (inlined into dist at build time)
├── css/                  design tokens (dark/light) and faceplate styles
└── js/
    ├── core.js           helpers, format matrix, help texts, app state
    ├── audio.js          header sniffing, fallback demo signal, processing chain
    ├── measure.js        BS.1770 loudness, true peak, DR, fake detection
    ├── meta.js           tag/cover read and write
    ├── presets.js        device preset database
    ├── zip.js            store-only zip writer
    ├── codecs/           FLAC/WAV/MP3/AAC, ALAC, AIFF + Ogg Opus, MP4 muxer
    ├── ui/               preset browser, needle/ladder/knobs/tuner
    └── app.js            analysis, playback, conversion, rendering, events
```

## Getting started

Open `src/index.html` directly in a browser to develop. No server is required.

```bash
npm install && npx playwright install chromium   # only needed for tests
npm run build      # inline everything into dist/index.html
npm test           # build, then run the end-to-end encoder checks
```

The end-to-end test loads the app in headless Chromium, checks the analysis and tag reading on the preview track, and encodes it to every format the browser supports. If `ffprobe` is installed, each output is then decoded with FFmpeg and its codec, sample rate and channel count are verified.

## Browser support

The analyzer and the lossless encoders run in any modern browser. AAC and Opus depend on WebCodecs support in the browser (Chrome, Edge, Safari 17+). Codecs the browser can't encode are shown as unavailable rather than failing.

## License

Code: [MIT](LICENSE).

Preview track: "Jungle Breakbeat" by Musinova, from [Pixabay](https://pixabay.com/music/) under the Pixabay Content License (20-second excerpt).
