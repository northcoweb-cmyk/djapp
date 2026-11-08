// Offline track analysis: band envelopes, BPM + beat grid, downbeats,
// phrase structure (intro / groove / breakdown / build / drop / outro) and drops.
// Everything is computed before playback so the DJ and the crowd can anticipate.

export const FPS = 200; // analysis frames per second (5 ms)
const SR = 22050;

const yieldUI = () => new Promise((r) => setTimeout(r, 0));
export async function analyzeBuffer(buffer, onProgress = () => {}) {
  onProgress(0.05, 'Splitting frequency bands');
  const bands = await renderBands(buffer);
  onProgress(0.35, 'Building waveform');
  await yieldUI();
  const env = envelopes(bands);
  onProgress(0.5, 'Detecting tempo');
  await yieldUI();
  const onset = onsetCurve(env.low, env.full);
  const { bpm, phase } = detectTempo(onset);
  onProgress(0.7, 'Finding downbeats');
  await yieldUI();
  const grid = buildGrid(bpm, phase, buffer.duration, env, onset);
  onProgress(0.85, 'Mapping song structure');
  await yieldUI();
  const structure = mapStructure(grid, env, buffer.duration);
  onProgress(1, 'Done');
  return {
    duration: buffer.duration,
    bpm,
    fps: FPS,
    // waveform envelopes (normalised 0..1) for CDJ displays + visuals
    wave: { low: env.lowN, mid: env.midN, high: env.highN, full: env.fullN },
    beats: grid.beats,
    downbeatIndex: grid.downbeatIndex, // index into beats of first downbeat
    bars: structure.bars,
    sections: structure.sections,
    drops: structure.drops,
    mixIn: structure.mixIn,
    mixOut: structure.mixOut,
  };
}

async function renderBands(buffer) {
  const length = Math.ceil(buffer.duration * SR);
  const ctx = new OfflineAudioContext(4, length, SR);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const merger = ctx.createChannelMerger(4);
  const mono = () => {
    const g = ctx.createGain();
    g.channelCount = 1;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'speakers';
    return g;
  };
  const chain = (filters, out) => {
    const m = mono();
    src.connect(m);
    let node = m;
    for (const [type, f, q] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      if (q) b.Q.value = q;
      node.connect(b);
      node = b;
    }
    node.connect(merger, 0, out);
  };
  chain([['lowpass', 150, 0.7], ['lowpass', 150, 0.7]], 0);
  chain([['highpass', 250, 0.7], ['lowpass', 2500, 0.7]], 1);
  chain([['highpass', 3000, 0.7], ['highpass', 3000, 0.7]], 2);
  chain([], 3);
  merger.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return [0, 1, 2, 3].map((c) => out.getChannelData(c));
}

function envelopes([low, mid, high, full]) {
  const hop = SR / FPS;
  const n = Math.floor(low.length / hop);
  const mk = () => new Float32Array(n);
  const e = { low: mk(), mid: mk(), high: mk(), full: mk() };
  const src = { low, mid, high, full };
  for (const k of Object.keys(e)) {
    const s = src[k];
    const o = e[k];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      const a = Math.floor(i * hop);
      const b = Math.floor((i + 1) * hop);
      for (let j = a; j < b; j++) sum += s[j] * s[j];
      o[i] = Math.sqrt(sum / (b - a));
    }
  }
  const norm = (arr) => {
    const p = percentile(arr, 0.985) || 1;
    const o = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) o[i] = Math.min(1, arr[i] / p);
    return o;
  };
  e.lowN = norm(e.low);
  e.midN = norm(e.mid);
  e.highN = norm(e.high);
  e.fullN = norm(e.full);
  return e;
}

function onsetCurve(low, full) {
  const n = low.length;
  const o = new Float32Array(n);
  const eps = 1e-4;
  for (let i = 2; i < n; i++) {
    const dl = Math.log(low[i] + eps) - Math.log(low[i - 2] + eps);
    const df = Math.log(full[i] + eps) - Math.log(full[i - 2] + eps);
    o[i] = Math.max(0, dl) * 0.7 + Math.max(0, df) * 0.3;
  }
  // subtract local mean so sustained sections don't dominate
  const w = 40;
  const out = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += o[i];
    if (i >= w) acc -= o[i - w];
    const mean = acc / Math.min(i + 1, w);
    out[i] = Math.max(0, o[i] - mean);
  }
  return out;
}

function sample(arr, x) {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= arr.length) return 0;
  const f = x - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

function combScore(onset, period, phase) {
  let s = 0;
  let cnt = 0;
  for (let x = phase; x < onset.length - 1; x += period) {
    s += Math.max(sample(onset, x - 0.5), sample(onset, x), sample(onset, x + 0.5));
    cnt++;
  }
  return cnt ? s / cnt : 0;
}

function detectTempo(onset) {
  // House lives in 112..132 BPM; search a slightly wider window.
  let best = { score: -1, bpm: 124, phase: 0 };
  const evalBpm = (bpm, phaseStep) => {
    const period = (60 / bpm) * FPS;
    let bp = { score: -1, phase: 0 };
    for (let ph = 0; ph < period; ph += phaseStep) {
      const s = combScore(onset, period, ph);
      if (s > bp.score) bp = { score: s, phase: ph };
    }
    return { bpm, ...bp };
  };
  for (let bpm = 108; bpm <= 140; bpm += 0.25) {
    const r = evalBpm(bpm, 2);
    if (r.score > best.score) best = r;
  }
  // refine
  const coarse = best;
  for (let bpm = coarse.bpm - 0.3; bpm <= coarse.bpm + 0.3; bpm += 0.02) {
    const r = evalBpm(bpm, 0.5);
    if (r.score > best.score) best = r;
  }
  // snap to integer BPM when it scores nearly as well (most club tracks are integer)
  const rounded = Math.round(best.bpm);
  if (Math.abs(rounded - best.bpm) < 0.35) {
    const r = evalBpm(rounded, 0.25);
    if (r.score > best.score * 0.97) best = r;
  }
  return { bpm: Math.round(best.bpm * 100) / 100, phase: best.phase };
}

function buildGrid(bpm, phase, duration, env, onset) {
  const period = (60 / bpm) * FPS;
  let start = phase;
  while (start - period >= 0) start -= period;
  const beats = [];
  for (let x = start; x / FPS < duration; x += period) beats.push(x / FPS);

  // Downbeat: energy changes cluster on bar 1. Use per-beat low/full novelty.
  const beatE = beats.map((t) => meanRange(env.fullN, t, t + 60 / bpm));
  const beatL = beats.map((t) => meanRange(env.lowN, t, t + 60 / bpm));
  const nov = beats.map((_, i) =>
    i === 0 ? 0 : Math.abs(beatE[i] - beatE[i - 1]) + Math.abs(beatL[i] - beatL[i - 1])
  );
  const accent = beats.map((t) => sample(onset, t * FPS));
  let bestK = 0;
  let bestS = -1;
  for (let k = 0; k < 4; k++) {
    let s = 0;
    for (let i = k; i < beats.length; i += 4) s += nov[i] * 3 + accent[i] * 0.2;
    if (s > bestS) {
      bestS = s;
      bestK = k;
    }
  }
  return { beats, downbeatIndex: bestK, period: 60 / bpm };
}

function meanRange(arr, t0, t1) {
  const a = Math.max(0, Math.floor(t0 * FPS));
  const b = Math.min(arr.length, Math.floor(t1 * FPS));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += arr[i];
  return s / (b - a);
}

function percentile(arr, p) {
  const step = Math.max(1, Math.floor(arr.length / 4000));
  const tmp = [];
  for (let i = 0; i < arr.length; i += step) tmp.push(arr[i]);
  tmp.sort((a, b) => a - b);
  return tmp[Math.min(tmp.length - 1, Math.floor(p * tmp.length))];
}

function mapStructure(grid, env, duration) {
  const { beats, downbeatIndex } = grid;
  const barLen = grid.period * 4;
  // bars start at downbeats; include a pickup bar if the first downbeat isn't beat 0
  const bars = [];
  let t0 = beats[downbeatIndex];
  while (t0 - barLen > -barLen * 0.5) t0 -= barLen;
  for (let t = t0; t < duration - barLen * 0.25; t += barLen) {
    const s = Math.max(0, t);
    const e = Math.min(duration, t + barLen);
    bars.push({
      start: s,
      end: e,
      low: meanRange(env.lowN, s, e),
      mid: meanRange(env.midN, s, e),
      high: meanRange(env.highN, s, e),
      full: meanRange(env.fullN, s, e),
    });
  }
  const nb = bars.length;
  const lowP = percentile(Float32Array.from(bars.map((b) => b.low)), 0.8) || 1;
  const fullP = percentile(Float32Array.from(bars.map((b) => b.full)), 0.8) || 1;
  const highP = percentile(Float32Array.from(bars.map((b) => b.high)), 0.8) || 1;
  for (const b of bars) {
    b.bassLevel = b.low / lowP;
    b.energy = b.full / fullP;
    b.hi = b.high / highP;
    b.bassOn = b.bassLevel > 0.55;
  }
  // smooth isolated bass flips (single-bar breaks are fills, not breakdowns)
  for (let i = 1; i < nb - 1; i++) {
    if (!bars[i].bassOn && bars[i - 1].bassOn && bars[i + 1].bassOn) bars[i].fill = true;
  }
  const on = (i) => i >= 0 && i < nb && (bars[i].bassOn || bars[i].fill);

  // --- drops: bass returns after >=2 bars of absence, sustained >=3 bars ---
  const drops = [];
  for (let i = 2; i < nb - 2; i++) {
    if (!on(i) || on(i - 1)) continue;
    let offRun = 0;
    for (let j = i - 1; j >= 0 && !on(j); j--) offRun++;
    let onRun = 0;
    for (let j = i; j < nb && on(j); j++) onRun++;
    if (offRun < 2 || onRun < 3) continue;
    const before = avg(bars.slice(Math.max(0, i - offRun), i).map((b) => b.energy));
    const after = avg(bars.slice(i, Math.min(nb, i + 4)).map((b) => b.energy));
    const bassAfter = avg(bars.slice(i, Math.min(nb, i + 4)).map((b) => b.bassLevel));
    const buildHi = avg(bars.slice(Math.max(0, i - 4), i).map((b) => b.hi));
    const contrast = Math.max(0, after - before);
    const strength = clamp01(0.25 + contrast * 0.9 + (bassAfter - 0.8) * 0.5 + Math.min(offRun, 16) / 40 + buildHi * 0.1);
    drops.push({ bar: i, time: bars[i].start, offBars: offRun, strength, buildBars: Math.min(offRun, 8) });
  }
  // the very first time the groove kicks in (end of intro) when there is no earlier drop
  // counts as a "kick-in" (softer)
  let firstOn = 0;
  while (firstOn < nb && !on(firstOn)) firstOn++;

  // --- section labels per bar ---
  const label = new Array(nb).fill('groove');
  // intro: before firstOn, or first low-energy run
  let introEnd = firstOn;
  if (introEnd === 0) {
    // kick from the start: intro = opening bars with energy below 0.8 (max 16)
    while (introEnd < Math.min(16, nb) && bars[introEnd].energy < 0.8) introEnd++;
  }
  for (let i = 0; i < introEnd; i++) label[i] = 'intro';
  // outro: trailing bars after last strong groove whose energy fades
  let lastStrong = nb - 1;
  while (lastStrong > 0 && !(on(lastStrong) && bars[lastStrong].energy > 0.75)) lastStrong--;
  let outroStart = lastStrong + 1;
  // also treat a final dip in energy as outro
  for (let i = lastStrong; i > Math.max(introEnd, nb - 16); i--) {
    if (bars[i].energy < 0.7) outroStart = i;
    else break;
  }
  for (let i = outroStart; i < nb; i++) label[i] = 'outro';
  // breakdowns + builds
  for (let i = introEnd; i < outroStart; i++) if (!on(i)) label[i] = 'breakdown';
  for (const d of drops) {
    const bstart = Math.max(introEnd, d.bar - d.buildBars);
    // builds: the last bars of the breakdown, extended back while highs are rising
    let b = d.bar - 1;
    let n = 0;
    while (b >= bstart && n < 8) {
      label[b] = 'build';
      b--;
      n++;
      if (n >= 4 && b >= 0 && bars[b].hi < bars[b + 1].hi * 0.8) break;
    }
    d.buildStart = bars[Math.max(0, d.bar - n)].start;
    for (let j = d.bar; j < Math.min(outroStart, d.bar + 16) && on(j); j++) label[j] = 'drop';
  }
  // first kick-in after a quiet intro also gets a build in front of it
  if (firstOn > 2 && !drops.find((d) => d.bar === firstOn)) {
    drops.unshift({
      bar: firstOn,
      time: bars[firstOn].start,
      offBars: firstOn,
      strength: 0.45,
      buildBars: Math.min(4, firstOn),
      buildStart: bars[Math.max(0, firstOn - 4)].start,
      kickIn: true,
    });
    for (let j = Math.max(0, firstOn - 4); j < firstOn; j++) label[j] = 'build';
  }
  drops.sort((a, b) => a.time - b.time);

  bars.forEach((b, i) => {
    b.label = label[i];
    // hype potential: how much this bar "should" move a crowd
    b.hype = clamp01(
      b.energy * 0.45 + b.bassLevel * 0.35 + b.hi * 0.15 + (label[i] === 'drop' ? 0.2 : 0) - (label[i] === 'breakdown' ? 0.25 : 0)
    );
  });

  // merge consecutive labels into sections
  const sections = [];
  for (let i = 0; i < nb; i++) {
    const last = sections[sections.length - 1];
    if (last && last.type === label[i]) {
      last.end = bars[i].end;
      last.endBar = i;
    } else sections.push({ type: label[i], start: bars[i].start, end: bars[i].end, startBar: i, endBar: i });
  }

  // mix points for the auto DJ (in bars)
  const mixIn = { bar: 0, time: bars[0].start, introBars: Math.max(introEnd, 8) };
  const outroBars = nb - outroStart;
  const mixOutBar = Math.max(introEnd + 8, Math.min(outroStart, nb - 16));
  const mixOut = { bar: mixOutBar, time: bars[mixOutBar]?.start ?? duration - 30, outroBars };
  return { bars, sections, drops, mixIn, mixOut };
}

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Helpers used at runtime
export function barAt(analysis, t) {
  const bars = analysis.bars;
  let lo = 0;
  let hi = bars.length - 1;
  if (t < bars[0].start) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (bars[m].start <= t) lo = m;
    else hi = m - 1;
  }
  return lo;
}

export function beatPhaseAt(analysis, t) {
  // returns { beat (int index), frac (0..1), beatInBar (0..3) }
  const period = 60 / analysis.bpm;
  const b0 = analysis.beats[0];
  const x = (t - b0) / period;
  const beat = Math.floor(x);
  const frac = x - beat;
  const beatInBar = (((beat - analysis.downbeatIndex) % 4) + 4) % 4;
  return { beat, frac, beatInBar, period };
}

export function sectionAt(analysis, t) {
  for (const s of analysis.sections) if (t >= s.start && t < s.end) return s;
  return analysis.sections[analysis.sections.length - 1];
}

export function nextDrop(analysis, t) {
  for (const d of analysis.drops) if (d.time > t) return d;
  return null;
}
