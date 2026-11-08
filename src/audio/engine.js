// Audio engine: 4 decks (trim, 3-band EQ, colour filter, fader) into a master bus,
// RMX-style FX (echo, reverb, noise riser, beat roll) and a synthesized crowd (cheers, claps, chants).

const dbToGain = (db) => Math.pow(10, db / 20);

function makeIR(ctx, seconds = 2.6, decay = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function makeNoise(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export class Deck {
  constructor(eng, index) {
    const ctx = eng.ctx;
    this.eng = eng;
    this.index = index;
    this.srcGain = ctx.createGain();
    this.trim = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 160;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 4000;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 10;
    this.hp.Q.value = 1.2;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 22000;
    this.lp.Q.value = 1.2;
    this.fader = ctx.createGain();
    this.fader.gain.value = 0;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0;
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0;
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 256;
    this.meterBuf = new Float32Array(256);
    this.srcGain.connect(this.trim).connect(this.low).connect(this.mid).connect(this.high).connect(this.hp).connect(this.lp).connect(this.fader);
    this.fader.connect(eng.bus);
    this.fader.connect(this.echoSend).connect(eng.delayIn);
    this.fader.connect(this.revSend).connect(eng.reverb);
    this.fader.connect(this.meter);
    // visible control state (what the knobs show), 0..1 or -1..1
    this.ui = { trim: 0.5, high: 0.5, mid: 0.5, low: 0.5, filter: 0, fader: 0, cfx: 0 };
    this.track = null;
    this.src = null;
    this.playing = false;
    this.rate = 1;
    this.cuePos = 0;
    this.startedAt = 0;
    this.offset0 = 0;
    this.level = 0;
  }
  load(track) {
    this.stop();
    this.track = track;
    this.cuePos = 0;
  }
  play(when, offset) {
    if (!this.track) return;
    const ctx = this.eng.ctx;
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = this.track.buffer;
    src.playbackRate.value = this.rate;
    src.connect(this.srcGain);
    src.start(when, Math.max(0, offset));
    if (offset < 0) {
      /* starting before 0 is clamped; rare */
    }
    this.src = src;
    this.startedAt = when;
    this.offset0 = offset;
    this.playing = true;
    src.onended = () => {
      if (this.src === src) {
        this.playing = false;
        this.src = null;
      }
    };
  }
  stop(when) {
    if (this.src) {
      try {
        this.src.stop(when || 0);
      } catch (e) {}
      if (!when) this.src = null;
    }
    if (!when) this.playing = false;
  }
  get position() {
    if (!this.playing) return this.cuePos;
    return this.offset0 + (this.eng.ctx.currentTime - this.startedAt) * this.rate;
  }
  // convert a track time to the AudioContext time it will play at
  ctxTimeOf(trackTime) {
    return this.startedAt + (trackTime - this.offset0) / this.rate;
  }
  // ---- controls (time = ctx time) ----
  setEQ(band, v, when, ramp = 0.05) {
    // v: 0..1 knob position (0.5 = flat, 0 = kill)
    const db = v >= 0.5 ? (v - 0.5) * 12 : v <= 0.02 ? -40 : (v - 0.5) * 2 * 26;
    const p = this[band].gain;
    const t = when ?? this.eng.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(db, t, ramp / 3);
    this.eng.schedule(t, () => (this.ui[band] = v));
  }
  rampEQ(band, v, t0, t1) {
    const db = v >= 0.5 ? (v - 0.5) * 12 : v <= 0.02 ? -40 : (v - 0.5) * 2 * 26;
    const p = this[band].gain;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(p.value, t0);
    p.linearRampToValueAtTime(db, t1);
    this.eng.animate(t0, t1, this.ui, band, v);
  }
  setFilter(v, t0, t1) {
    // v: -1 (LPF closed) .. 0 (open) .. +1 (HPF closed)
    const ctx = this.eng.ctx;
    const a = t0 ?? ctx.currentTime;
    const b = t1 ?? a + 0.05;
    const hpF = v > 0 ? 20 * Math.pow(300, v) : 10;
    const lpF = v < 0 ? 22000 * Math.pow(0.012, -v) : 22000;
    for (const [node, f] of [
      [this.hp, hpF],
      [this.lp, lpF],
    ]) {
      node.frequency.cancelScheduledValues(a);
      node.frequency.setValueAtTime(Math.max(10, node.frequency.value), a);
      node.frequency.exponentialRampToValueAtTime(Math.max(10, f), b);
    }
    this.eng.animate(a, b, this.ui, 'filter', v);
  }
  setFader(v, t0, t1) {
    const ctx = this.eng.ctx;
    const a = t0 ?? ctx.currentTime;
    const b = t1 ?? a + 0.03;
    const p = this.fader.gain;
    p.cancelScheduledValues(a);
    p.setValueAtTime(p.value, a);
    p.linearRampToValueAtTime(v * v, b);
    this.eng.animate(a, b, this.ui, 'fader', v);
  }
  sendEcho(amount, t0, t1) {
    const p = this.echoSend.gain;
    p.setValueAtTime(p.value, t0);
    p.linearRampToValueAtTime(amount, t0 + 0.02);
    p.setValueAtTime(amount, t1);
    p.linearRampToValueAtTime(0, t1 + 0.05);
  }
  sendReverb(amount, t0, t1) {
    const p = this.revSend.gain;
    p.setValueAtTime(p.value, t0);
    p.linearRampToValueAtTime(amount, t0 + 0.05);
    p.setValueAtTime(amount, t1);
    p.linearRampToValueAtTime(0, t1 + 0.4);
  }
  // beat roll: loop a slice of the track for `dur` seconds, then return in sync (slip mode)
  roll(t0, sliceSec, dur) {
    if (!this.track || !this.playing) return;
    const ctx = this.eng.ctx;
    const pos = this.offset0 + (t0 - this.startedAt) * this.rate;
    const r = ctx.createBufferSource();
    r.buffer = this.track.buffer;
    r.playbackRate.value = this.rate;
    r.loop = true;
    r.loopStart = pos;
    r.loopEnd = pos + sliceSec;
    r.connect(this.trim);
    r.start(t0, pos);
    r.stop(t0 + dur);
    this.srcGain.gain.setValueAtTime(1, t0 - 0.005);
    this.srcGain.gain.linearRampToValueAtTime(0, t0);
    this.srcGain.gain.setValueAtTime(0, t0 + dur - 0.005);
    this.srcGain.gain.linearRampToValueAtTime(1, t0 + dur);
  }
  updateMeter() {
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let s = 0;
    for (let i = 0; i < this.meterBuf.length; i++) s += this.meterBuf[i] * this.meterBuf[i];
    const rms = Math.sqrt(s / this.meterBuf.length);
    this.level = Math.max(rms * 3.2, this.level * 0.88);
  }
}

export class AudioEngine {
  constructor() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }));
    this.bus = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -8;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.15;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    // echo (dotted 1/8 style, tempo synced later)
    this.delayIn = ctx.createGain();
    this.delay = ctx.createDelay(4);
    this.delay.delayTime.value = 0.35;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.5;
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = 'bandpass';
    this.delayTone.frequency.value = 1400;
    this.delayTone.Q.value = 0.5;
    this.delayIn.connect(this.delay).connect(this.delayTone).connect(this.fb).connect(this.delay);
    this.delayTone.connect(this.bus);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeIR(ctx);
    this.revOut = ctx.createGain();
    this.revOut.gain.value = 0.8;
    this.reverb.connect(this.revOut).connect(this.bus);
    // riser (white-noise sweep, the RMX "noise" knob)
    this.noiseBuf = makeNoise(ctx, 3);
    this.riserFilter = ctx.createBiquadFilter();
    this.riserFilter.type = 'bandpass';
    this.riserFilter.Q.value = 2.5;
    this.riserGain = ctx.createGain();
    this.riserGain.gain.value = 0;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    n.connect(this.riserFilter).connect(this.riserGain).connect(this.bus);
    n.start();
    // crowd bus (quiet, under the music)
    this.crowd = ctx.createGain();
    this.crowd.gain.value = 0.22;
    this.crowdVerb = ctx.createGain();
    this.crowdVerb.gain.value = 0.5;
    this.crowd.connect(this.master);
    this.crowd.connect(this.crowdVerb).connect(this.reverb);

    this.bus.connect(this.master).connect(this.comp).connect(this.analyser).connect(ctx.destination);
    this.decks = [0, 1, 2, 3].map((i) => new Deck(this, i));
    this.rmx = { noise: 0, echo: 0, verb: 0, jog: 0 }; // visible RMX state
    this.timers = [];
    this.anims = [];
    this.bands = { low: 0, mid: 0, high: 0, rms: 0 };
  }
  resume() {
    return this.ctx.resume();
  }
  get now() {
    return this.ctx.currentTime;
  }
  schedule(t, fn) {
    this.timers.push({ t, fn });
  }
  animate(t0, t1, obj, key, to) {
    this.anims.push({ t0, t1, obj, key, to, from: null });
  }
  setTempo(bpm) {
    const beat = 60 / bpm;
    this.delay.delayTime.setTargetAtTime(beat * 0.75, this.now, 0.05);
  }
  riser(t0, t1) {
    const g = this.riserGain.gain;
    const f = this.riserFilter.frequency;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(0.16, t1);
    g.setValueAtTime(0, t1 + 0.01);
    f.cancelScheduledValues(t0);
    f.setValueAtTime(300, t0);
    f.exponentialRampToValueAtTime(9000, t1);
    this.animate(t0, t1, this.rmx, 'noise', 1);
    this.schedule(t1, () => (this.rmx.noise = 0));
  }
  update() {
    const t = this.now;
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.t <= t);
      if (due.length) {
        this.timers = this.timers.filter((x) => x.t > t);
        due.forEach((x) => x.fn());
      }
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (t < a.t0) continue;
      if (a.from === null) a.from = a.obj[a.key];
      const k = a.t1 > a.t0 ? Math.min(1, (t - a.t0) / (a.t1 - a.t0)) : 1;
      a.obj[a.key] = a.from + (a.to - a.from) * k;
      if (k >= 1) this.anims.splice(i, 1);
    }
    this.analyser.getByteFrequencyData(this.freq);
    const bin = this.ctx.sampleRate / this.analyser.fftSize;
    const avg = (f0, f1) => {
      let s = 0;
      let c = 0;
      for (let i = Math.floor(f0 / bin); i <= Math.floor(f1 / bin); i++) {
        s += this.freq[i];
        c++;
      }
      return s / c / 255;
    };
    const b = this.bands;
    b.low = avg(30, 140);
    b.mid = avg(300, 2500);
    b.high = avg(4000, 12000);
    b.rms = b.low * 0.5 + b.mid * 0.3 + b.high * 0.2;
    // dominant bass pitch (for crowd chants in key)
    let best = 0;
    let bi = 0;
    for (let i = Math.floor(45 / bin); i < Math.floor(140 / bin); i++)
      if (this.freq[i] > best) {
        best = this.freq[i];
        bi = i;
      }
    if (best > 120) this.bassHz = this.bassHz ? this.bassHz * 0.97 + bi * bin * 0.03 : bi * bin;
    this.decks.forEach((d) => d.updateMeter());
  }

  // ---------------- crowd voice synthesis ----------------
  _voice(t, dur, f0, vowel, gain, glide = 0) {
    const ctx = this.ctx;
    const F = { o: [450, 800, 2830], a: [750, 1200, 2600], u: [325, 700, 2530], e: [500, 1750, 2600] }[vowel] || [600, 1000, 2600];
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(f0 * glide, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 1.5;
    const vg = ctx.createGain();
    vg.gain.value = f0 * 0.012;
    vib.connect(vg).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    env.gain.setValueAtTime(gain, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sum = ctx.createGain();
    F.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * (0.95 + Math.random() * 0.1);
      bp.Q.value = 8;
      const g = ctx.createGain();
      g.gain.value = [1, 0.6, 0.25][i];
      osc.connect(bp).connect(g).connect(sum);
    });
    sum.connect(env).connect(this.crowd);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }
  cheer(intensity = 1, t = this.now) {
    const ctx = this.ctx;
    // broadband roar
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    const dur = 1.6 + intensity * 1.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * intensity, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.crowd);
    src.start(t, Math.random());
    src.stop(t + dur);
    // individual "woo"s, male and female
    const n = Math.round(3 + intensity * 7);
    for (let i = 0; i < n; i++) {
      const female = Math.random() < 0.5;
      const f0 = female ? 380 + Math.random() * 180 : 190 + Math.random() * 90;
      this._voice(t + Math.random() * 0.6, 0.5 + Math.random() * 0.7, f0, Math.random() < 0.6 ? 'u' : 'o', 0.05 + Math.random() * 0.04, 1.25 + Math.random() * 0.3);
    }
  }
  ohYeah(t = this.now) {
    const f0 = 150 + Math.random() * 60;
    this._voice(t, 0.35, f0, 'o', 0.07, 0.9);
    this._voice(t + 0.38, 0.5, f0 * 1.1, 'e', 0.06, 0.85);
  }
  clap(t, count = 18) {
    const ctx = this.ctx;
    for (let i = 0; i < count; i++) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100 + Math.random() * 1200;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      const tt = t + (Math.random() - 0.5) * 0.045;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.06, tt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
      s.connect(bp).connect(g).connect(this.crowd);
      s.start(tt, Math.random() * 2);
      s.stop(tt + 0.1);
    }
  }
  chant(t, beat) {
    // "oh - oh - oh-oh" on the beat, pitched to the track's bass note
    const root = this.bassHz || 55;
    let f = root;
    while (f < 180) f *= 2;
    const notes = [1, 1, 1.189, 1.335];
    notes.forEach((m, i) => {
      for (let v = 0; v < 6; v++) {
        const female = v % 2 === 0;
        this._voice(t + i * beat + Math.random() * 0.03, beat * 0.9, f * m * (female ? 2 : 1) * (0.99 + Math.random() * 0.02), i === 3 ? 'a' : 'o', 0.035, 0);
      }
    });
  }
}
