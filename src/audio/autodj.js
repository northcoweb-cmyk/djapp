// The AI DJ. Owns the set: now playing, the up-next queue and history. Plays back-to-back
// across decks 1->2->3->4, plans energy-matched, phrase-aligned transitions (incoming drop
// lands as the outgoing track leaves its last high-energy section), and performs build/drop
// FX (filter sweeps, noise riser, echo/reverb throws, bass kills, beat rolls). Every move is
// logged and emitted as a gesture so the 3D DJ reaches for the right control.
import { barAt, sectionAt, nextDrop, beatPhaseAt } from './analyzer.js';
import { fmt } from './library.js';

export class AutoDJ {
  constructor(engine, library) {
    this.eng = engine;
    this.lib = library;
    this.upNext = [];
    this.history = [];
    this.current = null; // { deck, track, startedAt }
    this.plan = null;
    this.started = false;
    this.loop = true;
    this.masterBpm = null;
    this.setStart = null;
    this.deckCursor = 0;
    this.log = [];
    this.listeners = { gesture: [], log: [], drop: [], track: [], queue: [], plan: [] };
    this.planned = new Set();
  }
  get cur() {
    return this.current;
  }
  on(ev, fn) {
    this.listeners[ev].push(fn);
  }
  emit(ev, x) {
    this.listeners[ev].forEach((f) => f(x));
  }
  say(text, kind = 'fx') {
    const item = { text, kind, at: Date.now() };
    this.log.unshift(item);
    this.log.length = Math.min(this.log.length, 60);
    this.emit('log', item);
  }
  gesture(deck, control, when, dur = 0.6) {
    this.emit('gesture', { deck, control, when, dur });
  }

  // ---------------- queue ----------------
  enqueue(t) {
    if (this.upNext.includes(t) || (this.current && this.current.track === t)) return;
    this.upNext.push(t);
    this.changed();
  }
  locked(t) {
    return this.plan && this.plan.track === t && this.plan.scheduled;
  }
  remove(t) {
    if (this.locked(t)) return false;
    this.upNext = this.upNext.filter((x) => x !== t);
    this.history = this.history.filter((x) => x !== t);
    if (this.plan && this.plan.track === t) this.cancelPlan();
    this.changed();
    return true;
  }
  move(t, dir) {
    const i = this.upNext.indexOf(t);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.upNext.length) return;
    if (this.locked(this.upNext[i]) || this.locked(this.upNext[j])) return;
    [this.upNext[i], this.upNext[j]] = [this.upNext[j], this.upNext[i]];
    this.changed();
  }
  playNext(t) {
    if (this.locked(t)) return;
    const from = this.history.includes(t);
    this.history = this.history.filter((x) => x !== t);
    this.upNext = this.upNext.filter((x) => x !== t);
    const lockedFirst = this.plan && this.plan.scheduled ? 1 : 0;
    this.upNext.splice(lockedFirst, 0, t);
    if (from) this.say(`Re-queued "${t.name}"`, 'track');
    this.changed();
  }
  changed() {
    if (this.plan && !this.plan.scheduled && this.upNext[0] !== this.plan.track) this.cancelPlan();
    this.emit('queue');
  }
  trackReady() {
    this.emit('queue');
  }

  // ---------------- set start ----------------
  canStart() {
    return !this.started && this.upNext.some((t) => t.analysis);
  }
  async startSet() {
    if (this.started) return false;
    const t = this.upNext.find((x) => x.analysis);
    if (!t) return false;
    this.started = true;
    this.upNext = this.upNext.filter((x) => x !== t);
    this.emit('queue');
    this.say(`Starting the set with "${t.name}"…`, 'track');
    await this.lib.getBuffer(t);
    this.begin(t, true);
    return true;
  }
  begin(t, intro) {
    this.masterBpm = this.masterBpm || t.analysis.bpm;
    this.eng.setTempo(this.masterBpm);
    const deck = this.eng.decks[this.deckCursor];
    deck.load(t);
    deck.rate = Math.max(0.92, Math.min(1.08, this.masterBpm / t.analysis.bpm));
    const when = this.eng.now + 0.25;
    if (intro) {
      // 6-second open: closed low-pass + thin bass, fader rising, then everything opens up
      deck.setFader(0, when - 0.02, when - 0.01);
      deck.setFader(1, when, when + 4);
      deck.setFilter(-0.92, when - 0.03, when - 0.02);
      deck.setFilter(0, when + 0.3, when + 6.5);
      deck.setEQ('low', 0.15, when - 0.02);
      deck.rampEQ('low', 0.5, when + 1.5, when + 6.5);
      deck.setEQ('mid', 0.5, when - 0.02);
      deck.setEQ('high', 0.5, when - 0.02);
      this.gesture(deck.index, 'filter', when + 0.3, 3);
      this.setStart = when;
      this.say('Intro: low-pass filter opening over 6 s, bass fades in', 'mix');
    } else {
      deck.setFader(1, when, when + 0.05);
      ['low', 'mid', 'high'].forEach((b) => deck.setEQ(b, 0.5, when));
      deck.setFilter(0, when, when + 0.05);
    }
    deck.play(when, 0);
    this.current = { deck, track: t, startedAt: when };
    this.planned = new Set();
    this.gesture(deck.index, 'play', when);
    this.say(`Deck ${deck.index + 1}: ${t.name} (${t.analysis.bpm} BPM)`, 'track');
    this.emit('track', this.current);
    this.emit('queue');
  }

  // the next playable track (refills from history when looping)
  nextCandidate() {
    let t = this.upNext.find((x) => x.analysis && x.analysis.bars.length > 8);
    if (!t && this.loop && this.history.length) {
      const cur = this.current && this.current.track;
      this.upNext.push(...this.history.filter((x) => x !== cur && !this.upNext.includes(x)));
      this.history = [];
      this.emit('queue');
      t = this.upNext.find((x) => x.analysis && x.analysis.bars.length > 8);
    }
    if (t && this.upNext[0] !== t) {
      this.upNext = [t, ...this.upNext.filter((x) => x !== t)];
      this.emit('queue');
    }
    return t || null;
  }
  cancelPlan() {
    if (!this.plan || this.plan.scheduled) return;
    const d = this.plan.deck;
    if (d.track === this.plan.track && !d.playing) d.track = null;
    this.lib.release(this.plan.track);
    this.plan = null;
    this.emit('plan', null);
  }
  mixNow() {
    if (!this.current || (this.plan && this.plan.scheduled)) return;
    this.cancelPlan();
    this.makePlan(true);
    if (this.plan) this.say('Mix now: bringing the next track in at the next phrase', 'mix');
  }

  // Plan: where the outgoing track hands over and where the incoming enters so that the
  // incoming drop lands as the outgoing high-energy section ends. Robust to late additions.
  makePlan(soon = false) {
    const t = this.nextCandidate();
    if (!t || !this.current) return;
    const out = this.current;
    const A = out.track.analysis;
    const B = t.analysis;
    const nb = A.bars.length;
    const posBar = Math.max(0, barAt(A, out.deck.position));
    const earliest = Math.min(nb - 2, posBar + (soon ? 2 : 3));
    const cands = B.drops.filter((d) => !d.kickIn && d.time < B.duration * 0.6);
    const dropB = cands.sort((a, b) => b.strength - a.strength)[0] || B.drops.find((d) => !d.kickIn) || B.drops[0] || { bar: Math.min(16, B.bars.length - 1), strength: 0.6 };
    const hi = A.sections.filter((s) => s.type === 'drop' || s.type === 'groove');
    const lastHi = hi[hi.length - 1];
    const endHigh = lastHi ? Math.min(nb - 1, lastHi.endBar + 1) : nb - 8;
    const anchor = lastHi ? lastHi.startBar : 0;
    const align = (bar, step) => bar + ((((anchor - bar) % step) + step) % step);
    let L = dropB.bar >= 16 ? 16 : Math.max(4, dropB.bar - (dropB.bar % 4));
    if (soon) L = Math.min(L, 8);
    let startOut = endHigh - L;
    startOut -= (((startOut - anchor) % 4) + 4) % 4;
    if (soon || startOut < earliest) {
      startOut = Math.min(nb - 2, align(earliest, soon ? 2 : 4));
      L = Math.min(L, nb - 1 - startOut);
    }
    if (L < 1) {
      startOut = Math.max(earliest, nb - 2);
      L = 1;
    }
    const entryBar = Math.max(0, dropB.bar - L);
    const deck = this.eng.decks[(out.deck.index + 1) % 4];
    const type = L >= 16 ? '16-bar blend' : L >= 8 ? '8-bar blend' : L >= 4 ? '4-bar quick mix' : 'echo-out cut';
    deck.load(t);
    deck.rate = Math.max(0.92, Math.min(1.08, this.masterBpm / B.bpm));
    deck.cuePos = B.bars[Math.min(entryBar, B.bars.length - 1)].start;
    this.lib.getBuffer(t).catch(() => {}); // decode ahead
    this.plan = { track: t, from: out.track, deck, outDeck: out.deck, L, startOut, entryBar, dropBar: dropB.bar, dropStrength: dropB.strength ?? 0.7, type, scheduled: false };
    this.say(
      `Plan: ${type} into "${t.name}" (deck ${deck.index + 1}). It enters at its bar ${entryBar + 1} so its drop lands as "${out.track.name}" leaves bar ${startOut + L + 1}. ` +
        (L >= 4 ? 'Low EQ cut on the way in, bass swap halfway, high-pass + echo out.' : 'Echo-out on the last beat, cut on the one.'),
      'plan'
    );
    this.emit('plan', this.plan);
  }

  scheduleTransition() {
    const n = this.plan;
    const out = this.current;
    const A = out.track.analysis;
    const B = n.track.analysis;
    const od = out.deck;
    const id = n.deck;
    const barSec = (4 * 60) / this.masterBpm;
    const beat = barSec / 4;
    const t0 = Math.max(this.eng.now + 0.08, od.ctxTimeOf(A.bars[n.startOut].start));
    const tSwap = t0 + Math.max(0.5, n.L / 2) * barSec;
    const tEnd = t0 + n.L * barSec;
    n.t0 = t0;
    n.tSwap = tSwap;
    n.tEnd = tEnd;
    id.setFader(0, t0 - 0.05, t0 - 0.04);
    id.setEQ('low', 0, t0 - 0.05);
    id.setEQ('mid', 0.5, t0 - 0.05);
    id.setEQ('high', 0.5, t0 - 0.05);
    id.setFilter(n.L >= 4 ? 0.35 : 0, t0 - 0.05, t0 - 0.04);
    id.play(t0, B.bars[n.entryBar].start);
    this.gesture(id.index, 'play', t0);
    id.setFader(1, t0, t0 + Math.min(4, Math.max(0.25, n.L / 2)) * barSec);
    this.gesture(id.index, 'fader', t0, 1.5);
    if (n.L >= 4) {
      id.setFilter(0, t0, t0 + Math.min(8, n.L - 1) * barSec);
      this.gesture(id.index, 'filter', t0 + barSec, 1.2);
    }
    // bass swap on the phrase
    od.setEQ('low', 0, tSwap, 0.08);
    id.setEQ('low', 0.5, tSwap, 0.08);
    this.gesture(od.index, 'low', tSwap - 0.2, 0.5);
    this.gesture(id.index, 'low', tSwap + 0.1, 0.5);
    // outgoing: high-pass sweep, echo + reverb throw on the last beat
    if (n.L >= 2) {
      od.setFilter(0.7, tSwap + barSec * 0.5, tEnd - beat);
      this.gesture(od.index, 'filter', tSwap + barSec * 0.5, 1.2);
    }
    od.sendEcho(0.7, tEnd - beat, tEnd);
    od.sendReverb(0.5, tEnd - beat * 2, tEnd);
    this.eng.schedule(tEnd - beat, () => {
      this.eng.rmx.echo = 1;
      setTimeout(() => (this.eng.rmx.echo = 0), 900);
    });
    this.gesture(-1, 'rmx', tEnd - beat, 0.8);
    const entrySec = sectionAt(B, B.bars[Math.max(0, n.dropBar - 2)].start);
    if (entrySec && (entrySec.type === 'build' || entrySec.type === 'breakdown') && n.L >= 4) {
      this.eng.riser(tEnd - 4 * barSec, tEnd);
      this.gesture(-1, 'rmx', tEnd - 4 * barSec, 1);
    }
    od.setFader(0, tEnd, tEnd + 0.04);
    this.gesture(od.index, 'fader', tEnd - 0.1, 0.5);
    od.stop(tEnd + 6);
    const dropObj = B.drops.find((d) => d.bar === n.dropBar) || { bar: n.dropBar, time: B.bars[n.dropBar].start, strength: n.dropStrength };
    this.eng.schedule(tEnd, () => this.emit('drop', { track: n.track, drop: dropObj, time: tEnd }));
    this.eng.schedule(tEnd + 0.05, () => {
      od.setFilter(0, this.eng.now, this.eng.now + 0.1);
      ['low', 'mid', 'high'].forEach((b) => od.setEQ(b, 0.5));
      this.history.push(out.track);
      this.current = { deck: id, track: n.track, startedAt: t0 };
      this.upNext = this.upNext.filter((x) => x !== n.track);
      this.plan = null;
      this.planned = new Set([n.track.id + ':' + n.dropBar]);
      this.say(`Now playing: ${n.track.name} (deck ${id.index + 1})`, 'track');
      this.emit('track', this.current);
      this.emit('plan', null);
      this.emit('queue');
    });
    this.eng.schedule(tEnd + 7, () => {
      if (!(this.current && this.current.track === out.track) && !(this.plan && this.plan.track === out.track)) this.lib.release(out.track);
    });
    this.eng.schedule(t0, () => this.say(`Transition: ${n.type} started — deck ${id.index + 1} in${n.L >= 4 ? ', low EQ cut, filter opening' : ''}`, 'mix'));
    if (n.L >= 2) this.eng.schedule(tSwap, () => this.say(`Bass swap: deck ${od.index + 1} low out, deck ${id.index + 1} low in`, 'mix'));
    this.eng.schedule(tEnd - beat, () => this.say(`Echo-out on deck ${od.index + 1}, drop of "${n.track.name}" lands now`, 'mix'));
    n.scheduled = true;
    this.emit('plan', n);
  }

  // FX for builds/drops inside the playing track (subtle mid-song, bigger on builds)
  planTrackFX() {
    const c = this.current;
    const A = c.track.analysis;
    const d = c.deck;
    const pos = d.position;
    const barSec = (4 * 60) / this.masterBpm;
    const beat = barSec / 4;
    for (const drop of A.drops) {
      if (drop.time < pos + 0.5 || drop.time > pos + 30) continue;
      const key = c.track.id + ':' + drop.bar;
      if (this.planned.has(key)) continue;
      if (this.plan && this.plan.scheduled) continue;
      if (this.plan && drop.bar >= this.plan.startOut) continue; // the mix handles it
      this.planned.add(key);
      const tDrop = d.ctxTimeOf(drop.time);
      const tBuild = d.ctxTimeOf(drop.buildStart ?? drop.time - 4 * barSec);
      const buildLen = tDrop - tBuild;
      const big = drop.strength > 0.6 && !drop.kickIn;
      if (buildLen > barSec * 1.5) {
        d.setFilter(big ? 0.35 : 0.2, tBuild, tDrop - beat);
        this.gesture(d.index, 'filter', tBuild, 1);
        if (big) {
          this.eng.riser(Math.max(tBuild, tDrop - 4 * barSec), tDrop);
          this.gesture(-1, 'rmx', Math.max(tBuild, tDrop - 4 * barSec), 1);
        }
      }
      d.setEQ('low', 0, tDrop - beat, 0.02);
      this.gesture(d.index, 'low', tDrop - beat - 0.15, 0.4);
      if (big) d.sendEcho(0.45, tDrop - beat, tDrop - 0.02);
      d.sendReverb(big ? 0.45 : 0.25, tDrop - beat * 2, tDrop - 0.02);
      d.setEQ('low', 0.5, tDrop, 0.01);
      d.setFilter(0, tDrop - 0.01, tDrop + 0.01);
      this.eng.schedule(tBuild, () => this.say(`Build-up on deck ${d.index + 1}: ${big ? 'HPF sweep + noise riser' : 'gentle HPF'} (${Math.round(buildLen / barSec)} bars)`, 'fx'));
      this.eng.schedule(tDrop - beat, () => this.say(`Bass kill + ${big ? 'echo' : 'reverb'} throw… DROP`, 'fx'));
      this.eng.schedule(tDrop, () => this.emit('drop', { track: c.track, drop, time: tDrop }));
      if (big && drop.bar % 2 === 0) {
        const tRoll = tDrop + 8 * barSec - beat;
        d.roll(tRoll, beat / 2, beat);
        this.gesture(-1, 'rmx', tRoll - 0.2, 0.6);
        this.eng.schedule(tRoll, () => this.say('RMX: 1/2-beat roll', 'fx'));
      }
    }
  }

  update() {
    if (!this.started) return;
    const c = this.current;
    if (!c) return;
    if (!c.deck.playing && !(this.plan && this.plan.scheduled)) {
      // the track ran out without a mix (queue was empty)
      this.history.push(c.track);
      this.lib.release(c.track);
      this.current = null;
      const nxt = this.nextCandidate();
      if (nxt) {
        this.upNext = this.upNext.filter((x) => x !== nxt);
        this.deckCursor = (c.deck.index + 1) % 4;
        this.lib.getBuffer(nxt).then(() => this.begin(nxt, true));
      } else {
        this.started = false;
        this.say('Set finished — add songs and press Start set', 'track');
        this.emit('track', null);
      }
      this.emit('queue');
      return;
    }
    this.planTrackFX();
    if (!this.plan) {
      if (this.upNext.some((t) => t.analysis) || (this.loop && this.history.length)) this.makePlan();
      return;
    }
    if (this.plan.scheduled) return;
    const A = c.track.analysis;
    const tStart = A.bars[this.plan.startOut].start;
    const pos = c.deck.position;
    if (pos > tStart - 7) {
      if (this.plan.track.buffer) this.scheduleTransition();
      else if (pos > tStart - 1) {
        // still decoding: push the mix back a phrase
        this.say('Next track still loading — pushing the mix back a phrase', 'plan');
        this.cancelPlan();
      }
    }
  }

  // ---- state the crowd and visuals read every frame ----
  state() {
    const c = this.current;
    if (!c || !c.deck.playing) return { playing: false, energy: 0, section: 'idle', hype: 0, started: this.started };
    const A = c.track.analysis;
    const t = c.deck.vpos;
    const bi = barAt(A, t);
    const bar = A.bars[Math.max(0, bi)];
    const sec = sectionAt(A, t);
    const nd = nextDrop(A, t);
    const ph = beatPhaseAt(A, t);
    const barSec = (4 * 60) / this.masterBpm;
    const p = this.plan;
    return {
      playing: true,
      started: this.started,
      track: c.track,
      deck: c.deck.index,
      t,
      bar: bi,
      barInfo: bar,
      section: sec ? sec.type : 'groove',
      energy: bar ? bar.energy : 0,
      hype: bar ? bar.hype : 0,
      bass: bar ? bar.bassLevel : 0,
      nextDrop: nd,
      toDrop: nd ? (nd.time - t) / c.deck.rate : Infinity,
      barsToDrop: nd ? Math.ceil((nd.time - t) / ((4 * 60) / A.bpm)) : Infinity,
      beatFrac: ph.frac,
      beatInBar: ph.beatInBar,
      beat: ph.beat,
      bpm: this.masterBpm,
      barSec,
      transition: !!(p && p.scheduled),
      mixIn: p ? (p.scheduled ? p.t0 - this.eng.now : (A.bars[p.startOut].start - t) / c.deck.rate) : null,
      remaining: (A.duration - t) / c.deck.rate,
      setTime: this.setStart ? this.eng.now - this.setStart : 0,
    };
  }
  planSummary() {
    const p = this.plan;
    if (!p || !this.current) return null;
    const A = this.current.track.analysis;
    const pos = this.current.deck.position;
    const rate = this.current.deck.rate;
    const barSec = (4 * 60) / this.masterBpm;
    const inS = p.scheduled ? p.t0 - this.eng.now : (A.bars[p.startOut].start - pos) / rate;
    return {
      ...p,
      startsIn: inS,
      steps: [
        { at: inS, label: `Deck ${p.deck.index + 1} starts at bar ${p.entryBar + 1}${p.L >= 4 ? ' (low cut, HPF)' : ''}` },
        ...(p.L >= 2 ? [{ at: inS + (p.L / 2) * barSec, label: 'Bass swap' }] : []),
        { at: inS + p.L * barSec - barSec / 4, label: `Echo-out deck ${p.outDeck.index + 1}` },
        { at: inS + p.L * barSec, label: `Drop of "${p.track.name}"` },
      ],
      fmtIn: fmt(inS),
    };
  }
}
