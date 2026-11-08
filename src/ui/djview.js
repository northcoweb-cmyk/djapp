// DJ view: all four decks as scrolling 3-band waveforms (pre-rendered strips, cheap to draw),
// beat grid with bar numbers, song sections, drops, the planned transition (incoming track
// scrolls in toward its mix-in point) and each channel's mixer state.
const SECTION_COL = { intro: '#4a5060', groove: '#2fa860', build: '#e8c020', drop: '#e83a3a', breakdown: '#3a6ae8', outro: '#4a5060' };
const PPS = 80; // strip pixels per track-second
const STRIP_H = 64;
const CHUNK = 4096;
const fmt = (s) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

export class DJView {
  constructor(canvas, engine, dj) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.eng = engine;
    this.dj = dj;
    this.cache = new Map();
    this.acc = 0;
  }
  strips(track) {
    let s = this.cache.get(track);
    if (s) return s;
    const A = track.analysis;
    const total = Math.ceil(A.duration * PPS);
    const chunks = [];
    const n = A.wave.low.length;
    for (let x0 = 0; x0 < total; x0 += CHUNK) {
      const w = Math.min(CHUNK, total - x0);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = STRIP_H;
      const g = cv.getContext('2d');
      const cy = STRIP_H / 2;
      for (let x = 0; x < w; x++) {
        const i0 = Math.floor(((x0 + x) / PPS) * A.fps);
        const i1 = Math.max(i0 + 1, Math.floor(((x0 + x + 1) / PPS) * A.fps));
        let lo = 0;
        let mi = 0;
        let hi = 0;
        for (let i = i0; i < i1 && i < n; i++) {
          if (A.wave.low[i] > lo) lo = A.wave.low[i];
          if (A.wave.mid[i] > mi) mi = A.wave.mid[i];
          if (A.wave.high[i] > hi) hi = A.wave.high[i];
        }
        g.fillStyle = '#2050e8';
        g.fillRect(x, cy - lo * cy, 1, lo * 2 * cy);
        g.fillStyle = '#ff9a20';
        g.fillRect(x, cy - mi * cy * 0.72, 1, mi * 1.44 * cy);
        g.fillStyle = '#f4f4ff';
        g.fillRect(x, cy - hi * cy * 0.42, 1, hi * 0.84 * cy);
      }
      chunks.push(cv);
    }
    s = { chunks, total };
    this.cache.set(track, s);
    if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
    return s;
  }
  draw(dt, state) {
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const c = this.c;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const headW = Math.min(200, Math.max(140, W * 0.17));
    const mixW = Math.min(150, Math.max(110, W * 0.12));
    const waveX = headW;
    const waveW = W - headW - mixW;
    const laneH = H / 4;
    const playX = waveX + waveW * 0.42;
    const span = 11;
    const sPPS = waveW / span;
    const plan = this.dj.plan;
    const summary = this.dj.planSummary();
    const cur = this.dj.current;
    for (let i = 0; i < 4; i++) {
      const deck = this.eng.decks[i];
      const y = i * laneH;
      const isCur = cur && cur.deck === deck;
      const isNext = plan && plan.deck === deck;
      g.fillStyle = isCur ? 'rgba(90,60,220,0.20)' : isNext ? 'rgba(232,192,32,0.08)' : 'rgba(255,255,255,0.025)';
      g.fillRect(0, y + 1, W, laneH - 2);
      // ---- header ----
      g.fillStyle = deck.playing ? (isCur ? '#7b4dff' : '#2f6bff') : '#2a2840';
      g.fillRect(6, y + 6, 22, laneH - 12);
      g.fillStyle = '#fff';
      g.font = 'bold 13px system-ui';
      g.fillText(String(i + 1), 13, y + laneH / 2 + 5);
      const tr = deck.track;
      const compact = laneH < 60;
      g.font = '600 12px system-ui';
      g.fillStyle = tr ? '#e8e6f2' : '#5a5870';
      g.fillText(tr ? clip(g, tr.name, headW - 42) : 'EMPTY', 36, y + (compact ? 16 : 17));
      if (tr && tr.analysis) {
        const A = tr.analysis;
        const status = deck.playing ? (isCur ? 'PLAYING' : 'ON AIR') : isNext ? (summary ? `CUED · ${fmt(summary.startsIn)}` : 'CUED') : 'LOADED';
        const bpm = `${(A.bpm * deck.rate).toFixed(1)}`;
        const rem = `-${fmt((A.duration - deck.vpos) / deck.rate)}`;
        if (compact) {
          g.font = '10px system-ui';
          g.fillStyle = deck.playing ? '#7dff9a' : isNext ? '#ffd84a' : '#6a6688';
          g.fillText(status, 36, y + 30);
          g.fillStyle = '#9a96b8';
          g.fillText(`${bpm} · ${rem}`, 36 + g.measureText(status).width + 6, y + 30);
        } else {
          g.font = '11px system-ui';
          g.fillStyle = '#9a96b8';
          g.fillText(`${bpm} BPM  ${deck.rate !== 1 ? ((deck.rate - 1) * 100).toFixed(1) + '%' : ''}`, 36, y + 31);
          g.fillText(rem, 36, y + 45);
          g.fillStyle = deck.playing ? '#7dff9a' : isNext ? '#ffd84a' : '#6a6688';
          g.fillText(status, 36, y + Math.min(laneH - 6, 59));
        }
      }
      // ---- waveform ----
      if (tr && tr.analysis) this.lane(g, deck, tr, y, laneH, waveX, waveW, playX, sPPS, plan, summary);
      // ---- mixer strip ----
      this.mixer(g, deck, W - mixW, y, mixW, laneH);
    }
    // playhead across all lanes
    g.fillStyle = 'rgba(255,60,60,0.95)';
    g.fillRect(playX - 1, 0, 2, H);
  }
  lane(g, deck, tr, y, laneH, waveX, waveW, playX, sPPS, plan, summary) {
    const A = tr.analysis;
    const rate = deck.rate;
    let pos = deck.vpos;
    const isNext = plan && plan.deck === deck && !deck.playing;
    let startT = 0;
    if (isNext && summary) {
      // where the incoming track will be when the mix starts: it scrolls in toward the playhead
      startT = A.bars[plan.entryBar].start;
      pos = startT - summary.startsIn * rate;
    }
    const top = y + 6;
    const h = laneH - 18;
    g.save();
    g.beginPath();
    g.rect(waveX, y, waveW, laneH);
    g.clip();
    const s = this.strips(tr);
    const k = sPPS / rate / PPS;
    const tLeft = pos - ((playX - waveX) / sPPS) * rate;
    const tRight = pos + ((waveX + waveW - playX) / sPPS) * rate;
    for (let ci = 0; ci < s.chunks.length; ci++) {
      const cw = s.chunks[ci].width;
      const ct0 = (ci * CHUNK) / PPS;
      const ct1 = (ci * CHUNK + cw) / PPS;
      if (ct1 < tLeft || ct0 > tRight) continue;
      g.globalAlpha = deck.playing || isNext ? 1 : 0.45;
      g.drawImage(s.chunks[ci], 0, 0, cw, STRIP_H, playX + ((ct0 - pos) / rate) * sPPS, top, cw * k, h);
    }
    g.globalAlpha = 1;
    if (isNext) {
      // nothing plays before the entry point
      const xe = playX + ((startT - pos) / rate) * sPPS;
      if (xe > waveX) {
        g.fillStyle = 'rgba(10,8,20,0.85)';
        g.fillRect(waveX, y, xe - waveX, laneH);
      }
    }
    // played part dimmed
    g.fillStyle = 'rgba(5,4,12,0.35)';
    g.fillRect(waveX, y, playX - waveX, laneH);
    // beat grid
    const beat = 60 / A.bpm;
    const b0 = Math.ceil((tLeft - A.beats[0]) / beat);
    g.font = '10px system-ui';
    for (let b = b0; ; b++) {
      const tb = A.beats[0] + b * beat;
      const x = playX + ((tb - pos) / rate) * sPPS;
      if (x > waveX + waveW) break;
      const inBar = (((b - A.downbeatIndex) % 4) + 4) % 4;
      if (inBar === 0) {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(x, top, 1, h);
        const barNo = Math.floor((b - A.downbeatIndex) / 4) + 1;
        if (barNo % 4 === 1) {
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillText(String(barNo), x + 2, top + 9);
        }
      } else {
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.fillRect(x, top + h - 6, 1, 6);
      }
    }
    // sections strip + drops
    for (const sec of A.sections) {
      const x0 = playX + ((sec.start - pos) / rate) * sPPS;
      const x1 = playX + ((sec.end - pos) / rate) * sPPS;
      if (x1 < waveX || x0 > waveX + waveW) continue;
      g.fillStyle = SECTION_COL[sec.type] || '#555';
      g.fillRect(x0, y + laneH - 9, x1 - x0, 4);
      if (x1 - x0 > 50) {
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText(sec.type, Math.max(x0, waveX) + 3, y + laneH - 11);
      }
    }
    for (const d of A.drops) {
      const x = playX + ((d.time - pos) / rate) * sPPS;
      if (x < waveX - 20 || x > waveX + waveW) continue;
      g.fillStyle = '#ff3030';
      g.beginPath();
      g.moveTo(x - 5, top);
      g.lineTo(x + 5, top);
      g.lineTo(x, top + 7);
      g.fill();
      g.fillRect(x - 0.5, top, 1.5, h);
      g.fillStyle = '#ff8a8a';
      g.fillText('DROP', x + 4, top + 18);
    }
    // planned transition markers
    if (plan) {
      const marks = [];
      if (plan.outDeck === deck) {
        const nb = A.bars.length;
        marks.push([A.bars[plan.startOut].start, 'MIX START', '#ffd84a']);
        if (plan.L >= 2) marks.push([A.bars[Math.min(nb - 1, plan.startOut + Math.floor(plan.L / 2))].start, 'BASS SWAP', '#7dc0ff']);
        marks.push([A.bars[Math.min(nb - 1, plan.startOut + plan.L)].start, 'OUT', '#ff7ad8']);
      }
      if (plan.deck === deck) {
        marks.push([A.bars[plan.entryBar].start, 'MIX IN', '#ffd84a']);
        marks.push([A.bars[Math.min(A.bars.length - 1, plan.dropBar)].start, 'DROP LANDS', '#ff3a3a']);
      }
      g.font = 'bold 10px system-ui';
      for (const [t, label, col] of marks) {
        const x = playX + ((t - pos) / rate) * sPPS;
        if (x < waveX - 40 || x > waveX + waveW) continue;
        g.fillStyle = col;
        g.fillRect(x - 1, y + 2, 2, laneH - 4);
        g.fillText(label, x + 4, y + 28);
      }
    }
    g.restore();
  }
  mixer(g, deck, x, y, w, h) {
    const u = deck.ui;
    const cy = y + h / 2;
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(x, y + 3, w - 4, h - 6);
    const knobs = [
      ['HI', u.high],
      ['MID', u.mid],
      ['LOW', u.low],
    ];
    const r = Math.min(9, h / 5);
    knobs.forEach(([lab, v], i) => {
      const kx = x + 16 + i * (r * 2 + 8);
      const ky = cy - 4;
      g.strokeStyle = '#2a2840';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(kx, ky, r, Math.PI * 0.75, Math.PI * 2.25);
      g.stroke();
      const a0 = Math.PI * 1.5;
      const a1 = Math.PI * 0.75 + v * Math.PI * 1.5;
      g.strokeStyle = v < 0.1 ? '#ff3a3a' : Math.abs(v - 0.5) < 0.02 ? '#8a86a8' : '#7dc0ff';
      g.beginPath();
      g.arc(kx, ky, r, Math.min(a0, a1), Math.max(a0, a1));
      g.stroke();
      g.fillStyle = '#8a86a8';
      g.font = '9px system-ui';
      g.fillText(lab, kx - 7, ky + r + 11);
    });
    // filter (bipolar)
    const fx = x + 16 + 3 * (r * 2 + 8) - 4;
    g.fillStyle = '#2a2840';
    g.fillRect(fx, cy - 2, 26, 4);
    g.fillStyle = u.filter > 0.02 ? '#ffd84a' : u.filter < -0.02 ? '#7dc0ff' : '#8a86a8';
    g.fillRect(fx + 13, cy - 2, u.filter * 13, 4);
    g.fillStyle = '#8a86a8';
    g.fillText('FLT', fx + 4, cy + r + 7);
    // fader + level
    const fh = h - 14;
    const fxx = x + w - 30;
    g.fillStyle = '#2a2840';
    g.fillRect(fxx, y + 7, 5, fh);
    g.fillStyle = '#e8e6f2';
    g.fillRect(fxx - 3, y + 7 + fh * (1 - u.fader) - 2, 11, 4);
    const lv = Math.min(1, deck.level);
    const grd = g.createLinearGradient(0, y + 7 + fh, 0, y + 7);
    grd.addColorStop(0, '#20ff60');
    grd.addColorStop(0.75, '#ffa020');
    grd.addColorStop(1, '#ff2020');
    g.fillStyle = '#16142a';
    g.fillRect(fxx + 12, y + 7, 5, fh);
    g.fillStyle = grd;
    g.fillRect(fxx + 12, y + 7 + fh * (1 - lv), 5, fh * lv);
  }
}

function clip(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 3 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
