// Test harness: serves repo src + scratch songs via Playwright routing, runs analyzer.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const SONGS = process.env.SONGS_DIR || path.join(__dirname, 'songs');
const html = `<script type="module">
import { analyzeBuffer } from '/src/audio/analyzer.js';
window.run = async (f) => {
  const ab = await (await fetch('/songs/' + f)).arrayBuffer();
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(ab);
  const t = performance.now();
  const a = await analyzeBuffer(buf);
  return { ms: Math.round(performance.now()-t), bpm: a.bpm, dur: a.duration.toFixed(1), firstBeat: a.beats[0].toFixed(3), down: a.downbeatIndex,
    nb: a.bars.length,
    sections: a.sections.map(s => s.type + '[' + s.startBar + '-' + s.endBar + '] ' + s.start.toFixed(1) + 's').join('\\n'),
    drops: a.drops.map(d => 'bar ' + d.bar + ' @' + d.time.toFixed(1) + 's str ' + d.strength.toFixed(2) + ' off ' + d.offBars + (d.kickIn?' kickin':'')).join('\\n'),
    bass: a.bars.map(b => b.bassLevel.toFixed(1)).join(' '),
    energy: a.bars.map(b => b.energy.toFixed(1)).join(' '),
    hi: a.bars.map(b => b.hi.toFixed(1)).join(' '),
    mixOut: a.mixOut };
};
</script>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('console', (m) => console.log('console:', m.text()));
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.route('http://app.test/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/') return route.fulfill({ body: html, contentType: 'text/html' });
    let f;
    if (u.pathname.startsWith('/songs/')) f = path.join(SONGS, u.pathname.slice(7));
    else f = path.join(REPO, u.pathname);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    const ct = f.endsWith('.js') ? 'text/javascript' : 'audio/mpeg';
    route.fulfill({ body: fs.readFileSync(f), contentType: ct });
  });
  await p.goto('http://app.test/');
  await p.waitForFunction(() => window.run);
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['berlin.mp3', 'shesgone.mp3', 'goodgirl.mp3'];
  for (const f of files) {
    const r = await p.evaluate((f) => run(f), f);
    console.log('=== ' + f);
    for (const [k, v] of Object.entries(r)) console.log(k + ':', typeof v === 'object' ? JSON.stringify(v) : v);
  }
  await b.close();
})();
