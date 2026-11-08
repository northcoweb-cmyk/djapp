// The AI DJ: plays the queue back-to-back across 4 decks, plans energy-matched
// phrase-aligned transitions, and performs build/drop FX (filter sweeps, noise riser,
// echo/reverb throws, bass kills, beat rolls). Every move is logged and emitted as a gesture.
import { barAt, sectionAt, nextDrop, beatPhaseAt } from './analyzer.js';

export class AutoDJ {
  constructor(engine) {
    this.eng = engine;
    this.queue = [];
    this.qi = -1;
    this.cur = null; // { deck, track, plan }
    this.next = null;
    this.deckCursor = 0;
    this.masterBpm = null;
    this.log = [];
    this.listeners = { gesture: [], log: [], drop: [], track: [] };
    this.planned = new Set();
    this.firedDrops = new Set();
    this.rng = Math.random;
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
    this.log.length = Math.min(this.log.length, 40);
    this.emit('log', item);
  }
  gesture(deck, control, when, dur = 0.6) {
    this.emit('gesture', { deck, control, when, dur });
  }
  addTrack(track) {
    this.queue.push(track);
    if (!this.cur && track.analysis) this.start();
  }
  trackReady() {
    if (!this.cur) this.start();
    else if (!this.next) this.prepareNext();
  }
  start() {
    const i = this.queue.findIndex((t) => t.analysis);
    if (i < 0) return;
    this.qi = i;
    const t = this.queue[i];
    this.masterBpm = t.analysis.bpm;
    this.eng.setTempo(this.masterBpm);
    const deck = this.eng.decks[this.deckCursor];
    deck.load(t);
    deck.rate = 1;
    const when = this.eng.now + 0.3;
    deck.setFader(1, when, when + 0.02);
    ['low', 'mid', 'high'].forEach((b) => deck.setEQ(b, 0.5, when));
    deck.setFilter(0, when, when + 0.05);
    deck.play(when, 0);
    this.cur = { deck, track: t };
    this.gesture(deck.index, 'play', when);
    this.say(`Deck ${deck.index + 1}: ${t.name} (${t.analysis.bpm} BPM)`, 'track');
    this.emit('track', this.cur);
    this.prepareNext();
  }
  pickNextIndex() {
    const ready = this.queue.map((t, i) => [t, i]).filter(([t]) => t.analysis);
    if (ready.length < 2) return ready.length === 1 && this.queue.length === 1 ? null : null;
    for (let k = 1; k <= this.queue.length; k++) {
      const j = (this.qi + k) % this.queue.length;
      if (this.queue[j].analysis && j !== this.qi) return j;
    }
    return null;
  }
  // Plan where the outgoing track hands over and where the incoming track enters so that
  // the incoming drop lands exactly when the outgoing high-energy section ends.
  prepareNext() {
    const j = this.pickNextIndex();
    if (j === null) return;
    const out = this.cur;
    const A = out.track.analysis;
    const inc = this.queue[j];
    const B = inc.analysis;
    // incoming: pick its main drop (strongest non-kick-in drop in the first 60%), else first drop
    const cands = B.drops.filter((d) => !d.kickIn && d.time < B.duration * 0.6);
    const dropB = cands.sort((a, b) => b.strength - a.strength)[0] || B.drops[0] || { bar: Math.min(16, B.bars.length - 1) };
    // outgoing: last high-energy section
    const outBars = A.bars;
    let endHigh = outBars.length - 1;
    const lastDrop = A.sections.filter((s) => s.type === 'drop' || s.type === 'groove').pop();
    if (lastDrop) endHigh = lastDrop.endBar + 1;
    const now = barAt(A, out.deck.position) + 2;
    let L = 16;
    if (dropB.bar < 16) L = Math.max(4, dropB.bar - (dropB.bar % 4));
    let startOut = endHigh - L;
    startOut -= ((startOut - (lastDrop ? lastDrop.startBar : 0)) % 4 + 4) % 4; // phrase align
    if (startOut < now) {
      // not enough room (short radio edit): shorten the blend
      L = Math.max(4, Math.min(L, endHigh - now));
      startOut = Math.max(now, endHigh - L);
    }
    if (startOut >= outBars.length - 1) startOut = outBars.length - 1 - L;
    const entryBar = Math.max(0, dropB.bar - L);
    const deck = this.eng.decks[(out.deck.index + 1) % 4];
    const type = L >= 16 ? '16-bar blend' : L >= 8 ? '8-bar blend' : 'quick cut';
    this.next = { j, track: inc, deck, L, startOut, entryBar, dropBar: dropB.bar, type, scheduled: false };
    deck.load(inc);
    deck.rate = Math.max(0.92, Math.min(1.08, this.masterBpm / B.bpm));
    deck.cuePos = B.bars[entryBar].start;
    this.say(
      `Plan: ${type} into "${inc.name}" on deck ${deck.index + 1}. Mixing in at its bar ${entryBar + 1} so its drop lands as "${out.track.name}" leaves its last drop (bar ${startOut + 1}→${startOut + L + 1}). Bass swap halfway, high-pass + echo out.`,
      'plan'
    );
  }
  scheduleTransition() {
    const n = this.next;
    const out = this.cur;
    const A = out.track.analysis;
    const B = n.track.analysis;
    const od = out.deck;
    const id = n.deck;
    const barSec = (4 * 60) / this.masterBpm;
    const t0 = od.ctxTimeOf(A.bars[n.startOut].start);
    const tSwap = t0 + (n.L / 2) * barSec;
    const tEnd = t0 + n.L * barSec;
    const beat = barSec / 4;
    // start incoming phase-aligned on the downbeat
    id.setFader(0, t0 - 0.05, t0 - 0.04);
    id.setEQ('low', 0, t0 - 0.05);
    id.setEQ('mid', 0.5, t0 - 0.05);
    id.setEQ('high', 0.5, t0 - 0.05);
    id.setFilter(0.35, t0 - 0.05, t0 - 0.04);
    id.play(t0, B.bars[n.entryBar].start);
    this.gesture(id.index, 'play', t0);
    id.setFader(1, t0, t0 + Math.min(4, n.L / 2) * barSec);
    this.gesture(id.index, 'fader', t0, 1.5);
    id.setFilter(0, t0, t0 + Math.min(8, n.L - 1) * barSec);
    this.gesture(id.index, 'filter', t0 + barSec, 1.2);
    // bass swap on the phrase
    od.setEQ('low', 0, tSwap, 0.08);
    id.setEQ('low', 0.5, tSwap, 0.08);
    this.gesture(od.index, 'low', tSwap - 0.2, 0.5);
    this.gesture(id.index, 'low', tSwap + 0.1, 0.5);
    // outgoing: high-pass sweep over the last part, echo throw on the last beat
    od.setFilter(0.7, tSwap + barSec, tEnd - beat);
    this.gesture(od.index, 'filter', tSwap + barSec, 1.2);
    od.sendEcho(0.7, tEnd - beat, tEnd);
    od.sendReverb(0.5, tEnd - beat * 2, tEnd);
    this.eng.schedule(tEnd - beat, () => {
      this.eng.rmx.echo = 1;
      setTimeout(() => (this.eng.rmx.echo = 0), 900);
    });
    this.gesture(-1, 'rmx', tEnd - beat, 0.8);
    // riser into the incoming drop if its entry is a build/breakdown
    const entrySec = sectionAt(B, B.bars[Math.max(0, n.dropBar - 2)].start);
    if (entrySec && (entrySec.type === 'build' || entrySec.type === 'breakdown')) {
      this.eng.riser(tEnd - 4 * barSec, tEnd);
      this.gesture(-1, 'rmx', tEnd - 4 * barSec, 1);
    }
    // cut the outgoing on the one
    od.setFader(0, tEnd, tEnd + 0.04);
    this.gesture(od.index, 'fader', tEnd - 0.1, 0.5);
    od.stop(tEnd + 6);
    this.eng.schedule(tEnd + 0.05, () => {
      od.setFilter(0, this.eng.now, this.eng.now + 0.1);
      ['low', 'mid', 'high'].forEach((b) => od.setEQ(b, 0.5));
      this.cur = { deck: id, track: n.track };
      this.qi = n.j;
      this.next = null;
      this.planned = new Set();
      this.say(`Now playing: ${n.track.name} (deck ${id.index + 1})`, 'track');
      this.emit('track', this.cur);
      setTimeout(() => this.prepareNext(), 500);
    });
    this.eng.schedule(t0, () => this.say(`Transition: ${n.type} started — deck ${id.index + 1} in, low EQ cut, filter open`, 'mix'));
    this.eng.schedule(tSwap, () => this.say(`Bass swap: deck ${od.index + 1} low out, deck ${id.index + 1} low in`, 'mix'));
    this.eng.schedule(tEnd - beat, () => this.say(`Echo-out on deck ${od.index + 1}, drop of "${n.track.name}" lands now`, 'mix'));
    n.scheduled = true;
  }
  // FX for builds/drops inside the playing track (subtle mid-song, bigger on builds)
  planTrackFX() {
    const c = this.cur;
    const A = c.track.analysis;
    const d = c.deck;
    const pos = d.position;
    const barSec = (4 * 60) / this.masterBpm;
    const beat = barSec / 4;
    for (const drop of A.drops) {
      if (drop.time < pos + 0.5 || drop.time > pos + 30) continue;
      const key = c.track.id + ':' + drop.bar;
      if (this.planned.has(key)) continue;
      // don't stack on the transition window of the outgoing track
      if (this.next && this.next.scheduled && c.deck !== this.next.deck) continue;
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
      // last beat: bass kill + echo/reverb throw, then slam back
      d.setEQ('low', 0, tDrop - beat, 0.02);
      this.gesture(d.index, 'low', tDrop - beat - 0.15, 0.4);
      if (big) d.sendEcho(0.45, tDrop - beat, tDrop - 0.02);
      d.sendReverb(big ? 0.45 : 0.25, tDrop - beat * 2, tDrop - 0.02);
      d.setEQ('low', 0.5, tDrop, 0.01);
      d.setFilter(0, tDrop - 0.01, tDrop + 0.01);
      this.eng.schedule(tBuild, () => this.say(`Build-up on deck ${d.index + 1}: ${big ? 'HPF sweep + noise riser' : 'gentle HPF'} (${Math.round(buildLen / barSec)} bars)`, 'fx'));
      this.eng.schedule(tDrop - beat, () => this.say(`Bass kill + ${big ? 'echo' : 'reverb'} throw… DROP`, 'fx'));
      this.eng.schedule(tDrop + (drop.reactDelay || 0), () => this.emit('drop', { track: c.track, drop, time: tDrop }));
      // RMX beat roll halfway through big drops (every other drop)
      if (big && drop.bar % 2 === 0) {
        const tRoll = tDrop + 8 * barSec - beat;
        d.roll(tRoll, beat / 2, beat);
        this.gesture(-1, 'rmx', tRoll - 0.2, 0.6);
        this.eng.schedule(tRoll, () => this.say('RMX: 1/2-beat roll', 'fx'));
      }
    }
  }
  update() {
    const c = this.cur;
    if (!c) return;
    if (!c.deck.playing && !(this.next && this.next.scheduled)) {
      // track ended without a planned mix (e.g. single track): restart queue
      this.cur = null;
      this.start();
      return;
    }
    this.planTrackFX();
    if (this.next && !this.next.scheduled) {
      const A = c.track.analysis;
      const tStart = A.bars[this.next.startOut].start;
      if (c.deck.position > tStart - 6) this.scheduleTransition();
    } else if (!this.next) this.prepareNext();
  }
  // ---- state the crowd and visuals read every frame ----
  state() {
    const c = this.cur;
    if (!c || !c.deck.playing) return { playing: false, energy: 0, section: 'idle', hype: 0 };
    const A = c.track.analysis;
    const t = c.deck.position;
    const bi = barAt(A, t);
    const bar = A.bars[Math.max(0, bi)];
    const sec = sectionAt(A, t);
    const nd = nextDrop(A, t);
    const ph = beatPhaseAt(A, t);
    const barSec = (4 * 60) / this.masterBpm;
    return {
      playing: true,
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
      toDrop: nd ? nd.time - t : Infinity,
      barsToDrop: nd ? Math.ceil((nd.time - t) / ((4 * 60) / A.bpm)) : Infinity,
      beatFrac: ph.frac,
      beatInBar: ph.beatInBar,
      beat: ph.beat,
      bpm: this.masterBpm,
      barSec,
      transition: !!(this.next && this.next.scheduled),
    };
  }
}
