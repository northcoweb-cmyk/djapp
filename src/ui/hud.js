// HUD: top bar, set panel (now playing, next transition with live countdown, editable queue,
// history, DJ log), brain panel, DJ waveform view, camera bar, keyboard shortcuts, hide-UI and
// cinematic modes.
import { SHOTS } from '../camera/director.js';
import { REGIONS, BrainView } from './brain.js';
import { DJView } from './djview.js';
import { fmt } from '../audio/library.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const SECTION_COL = { intro: '#4a5060', groove: '#2fa860', build: '#c8a010', drop: '#d83030', breakdown: '#3a6ae8', outro: '#4a5060', idle: '#333' };

export class Hud {
  constructor(o) {
    Object.assign(this, o); // engine, dj, lib, director, getPeople, onCine, onResize
    this.brain = new BrainView($('brainCanvas'));
    this.djv = new DJView($('djCanvas'), o.engine, o.dj);
    this.acc = 0;
    this.lastDrops = '';
    this.hype = new Map();
    this.buildCamBar();
    this.bind();
    this.renderQueue();
  }
  buildCamBar() {
    const bar = $('camBar');
    bar.innerHTML = '';
    for (const s of SHOTS) {
      const b = document.createElement('button');
      b.dataset.cam = s.id;
      b.innerHTML = (s.key ? `<kbd>${s.key}</kbd>` : '') + s.label;
      b.onclick = () => this.director.setShot(s.id);
      bar.appendChild(b);
    }
    const sep = document.createElement('i');
    sep.className = 'sep';
    bar.appendChild(sep);
    const mk = (id, html, cls, fn) => {
      const b = document.createElement('button');
      b.id = id;
      b.className = cls;
      b.innerHTML = html;
      b.onclick = fn;
      bar.appendChild(b);
    };
    mk('autoBtn', '<kbd>A</kbd>Auto', 'auto', () => this.director.toggleAuto());
    mk('cineBtn', '<kbd>C</kbd>Cinematic', '', () => this.toggleCine());
    mk('hideBtn', '<kbd>H</kbd>Hide UI', '', () => this.toggleUI());
  }
  markCam(id) {
    document.querySelectorAll('#camBar button[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === id));
    $('autoBtn').classList.toggle('on', this.director.auto);
    const s = SHOTS.find((x) => x.id === id);
    const n = SHOTS.indexOf(s) + 1;
    $('camName').textContent = `CAM ${n} · ${(s ? s.label : id).toUpperCase()}${this.director.auto ? ' · AUTO' : ''}`;
  }
  bind() {
    $('startSet').onclick = () => this.startSet();
    $('addBtn').onclick = () => $('fileAdd').click();
    $('fileAdd').onchange = (e) => {
      this.onFiles([...e.target.files]);
      e.target.value = '';
    };
    $('helpBtn').onclick = () => ($('help').hidden = false);
    $('helpClose').onclick = () => ($('help').hidden = true);
    $('mixNow').onclick = () => this.dj.mixNow();
    $('loopSet').onchange = (e) => (this.dj.loop = e.target.checked);
    const listClick = (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const li = btn.closest('li[data-id]');
      const t = this.lib.tracks.find((x) => String(x.id) === li.dataset.id);
      if (!t) return;
      const act = btn.dataset.act;
      if (act === 'up') this.dj.move(t, -1);
      else if (act === 'down') this.dj.move(t, 1);
      else if (act === 'next' || act === 'again') this.dj.playNext(t);
      else if (act === 'rm') {
        if (this.dj.remove(t)) {
          this.lib.remove(t);
          this.hint(`Removed "${t.name}"`);
        }
      }
      this.lib.saveOrder(this.dj.upNext);
      this.renderQueue();
    };
    $('upNext').onclick = listClick;
    $('history').onclick = listClick;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }
  startSet() {
    if (!this.dj.canStart()) return;
    this.dj.startSet();
    $('startSet').classList.remove('pulse');
    this.renderQueue();
  }
  onKey(e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const playMode = this.director.mode === 'play';
    if (playMode && /^[wasdWASD]$/.test(k)) return;
    const shot = SHOTS.find((s) => s.key && s.key.toLowerCase() === k.toLowerCase());
    if (shot) {
      this.director.setShot(shot.id);
      e.preventDefault();
      return;
    }
    switch (k.toLowerCase()) {
      case 'tab':
        e.preventDefault();
        this.director.cycle(e.shiftKey ? -1 : 1);
        break;
      case 'a':
        this.director.toggleAuto();
        this.hint(this.director.auto ? 'Auto-director ON — cutting on the music' : 'Auto-director off');
        break;
      case 'h':
        this.toggleUI();
        break;
      case 'c':
        this.toggleCine();
        break;
      case 'f':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
        break;
      case ' ':
        e.preventDefault();
        if (this.dj.canStart()) this.startSet();
        break;
      case 'n':
        this.dj.mixNow();
        break;
      case 'q':
        document.body.classList.toggle('hide-set');
        break;
      case 'b':
        document.body.classList.toggle('hide-brain');
        break;
      case 'd':
        document.body.classList.toggle('hide-dj');
        break;
      case '?':
      case '/':
        $('help').hidden = !$('help').hidden;
        break;
      case 'escape':
        $('help').hidden = true;
        break;
    }
  }
  toggleUI() {
    const hidden = document.body.classList.toggle('ui-hidden');
    this.hint(hidden ? 'UI hidden — press H to bring it back' : '');
  }
  toggleCine() {
    const on = document.body.classList.toggle('cine');
    $('cine').hidden = !on;
    $('cineBtn').classList.toggle('on', on);
    this.onCine && this.onCine(on);
  }
  hint(text) {
    const h = $('hint');
    h.textContent = text;
    h.classList.toggle('show', !!text);
    clearTimeout(this.hintT);
    if (text) this.hintT = setTimeout(() => h.classList.remove('show'), 2600);
  }
  renderQueue() {
    const dj = this.dj;
    const plan = dj.plan;
    const up = dj.upNext;
    $('upNext').innerHTML = up.length
      ? up
          .map((t, i) => {
            const locked = dj.locked(t);
            const isNext = plan && plan.track === t;
            const meta = locked ? 'MIXING IN NOW' : isNext ? `next · ${t.status}` : t.status;
            const btns = locked ? '' : `<button data-act="up" title="Move up">▲</button><button data-act="down" title="Move down">▼</button><button data-act="next" title="Play next">⏭</button><button data-act="rm" title="Remove">✕</button>`;
            return `<li data-id="${t.id}" class="${locked ? 'locked' : isNext ? 'next' : ''}"><div style="min-width:0"><div class="tname">${i + 1}. ${esc(t.name)}</div><div class="tmeta">${esc(meta)}</div></div><div class="tbtns">${btns}</div></li>`;
          })
          .join('')
      : '<li><div class="tmeta">Queue is empty — press + Add songs</div></li>';
    $('history').innerHTML = dj.history
      .slice()
      .reverse()
      .map((t) => `<li data-id="${t.id}"><div style="min-width:0"><div class="tname">${esc(t.name)}</div></div><div class="tbtns"><button data-act="again" title="Play again next">↺</button></div></li>`)
      .join('');
    $('startList').innerHTML = this.lib.tracks.map((t) => `<li>${esc(t.name)} <span class="tmeta">· ${esc(t.status)}</span></li>`).join('');
    const sb = $('startSet');
    sb.style.display = dj.started ? 'none' : '';
    sb.disabled = !dj.canStart();
    sb.classList.toggle('pulse', dj.canStart());
  }
  brainValues(m, people) {
    const sel = people && people.selected;
    let src;
    if (sel) src = sel.b;
    else if (people) {
      src = {};
      for (const k of ['groove', 'anticipation', 'euphoria', 'chills', 'fatigue', 'hype']) src[k] = people.avg(k);
    } else src = { groove: 0, anticipation: 0, euphoria: 0, chills: 0, fatigue: 0, hype: 0 };
    const audio = this.engine.bands.rms;
    return {
      prefrontal: clamp01(src.anticipation * 0.7 + (m.section === 'build' ? 0.25 : 0) + 0.08),
      motor: clamp01(src.groove * 1.1),
      auditory: clamp01(0.1 + audio * 1.7),
      caudate: clamp01(src.anticipation),
      accumbens: clamp01(src.euphoria),
      amygdala: clamp01(src.chills),
      cerebellum: m.playing ? clamp01(0.25 + src.groove * 0.7) : 0.08,
      fatigue: src.fatigue,
      hype: src.hype,
    };
  }
  update(dt, m, people) {
    const v = this.brainValues(m, people);
    this.brain.draw(dt, v, m.playing ? m.beatFrac : 0);
    if (!document.body.classList.contains('hide-dj')) this.djv.draw(dt, m);
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const dj = this.dj;
    // top bar
    $('setClock').textContent = fmt(m.setTime || 0);
    document.querySelector('.live').classList.toggle('on', dj.started);
    $('hypeBar').style.width = `${Math.round(v.hype * 100)}%`;
    if (m.playing) {
      $('deckTag').textContent = `DECK ${m.deck + 1}`;
      $('trackName').textContent = m.track.name;
      const s = $('sectionTag');
      s.textContent = m.section.toUpperCase() + (m.transition ? ' · MIXING' : '');
      s.style.background = SECTION_COL[m.section] || '#333';
      $('dropIn').textContent = m.nextDrop && m.barsToDrop <= 16 ? `DROP IN ${m.barsToDrop} BAR${m.barsToDrop === 1 ? '' : 'S'}` : '';
      $('bpm').textContent = `${m.bpm.toFixed(1)} BPM`;
      let h = this.hype.get(m.track.id);
      if (!h) this.hype.set(m.track.id, (h = []));
      h.push([m.t, v.hype]);
      if (h.length > 2000) h.shift();
    } else {
      $('sectionTag').textContent = dj.started ? 'LOADING' : 'DOORS OPEN';
      $('sectionTag').style.background = '#333';
      $('dropIn').textContent = '';
      $('bpm').textContent = '';
      if (!dj.started) $('trackName').textContent = dj.canStart() ? 'Press Start set' : 'Add songs to start';
    }
    // now playing card
    if (m.playing) {
      $('nowName').textContent = m.track.name;
      $('nowMeta').textContent = `Deck ${m.deck + 1} · ${fmt(m.t)} / ${fmt(m.track.analysis.duration)} · ${fmt(m.remaining)} left · ${m.nextDrop ? 'next drop in ' + m.barsToDrop + ' bars' : 'no more drops'}`;
    } else {
      $('nowName').textContent = dj.started ? 'Loading…' : 'Nothing yet';
      $('nowMeta').textContent = dj.started ? '' : 'The club is open. Line up the queue and press Start set.';
    }
    this.drawNowBar(m);
    // next transition card
    const ps = dj.planSummary();
    $('mixNow').disabled = !dj.current || !!(dj.plan && dj.plan.scheduled);
    if (ps) {
      $('nextName').textContent = `${ps.track.name}`;
      $('nextSteps').innerHTML =
        `<li><span>${esc(ps.type)}</span><span>${ps.startsIn > 0 ? 'in ' + fmt(ps.startsIn) : 'mixing'}</span></li>` +
        ps.steps.map((s) => `<li class="${s.at < 0 ? 'done' : s.at < 8 ? 'soon' : ''}"><span>${esc(s.label)}</span><span>${s.at < 0 ? '✓' : fmt(s.at)}</span></li>`).join('');
    } else {
      $('nextName').textContent = dj.upNext.length ? (dj.started ? 'Planning…' : dj.upNext[0].name) : 'Queue empty';
      $('nextSteps').innerHTML = '';
    }
    // brain panel
    const sel = people && people.selected;
    $('brainTitle').textContent = sel ? `${sel.name.toUpperCase()}'S BRAIN` : 'CROWD BRAIN';
    let state;
    if (!m.playing) state = dj.started ? 'Waiting for the music…' : 'Doors open · chatting at the bar';
    else if (m.section === 'build' && m.barsToDrop <= 8) state = `Anticipating the drop · ${m.barsToDrop} bar${m.barsToDrop === 1 ? '' : 's'}`;
    else if (v.accumbens > 0.45) state = 'Reward release · dopamine peak';
    else if (v.fatigue > 0.6) state = 'Tired legs · needs a break';
    else if (m.section === 'breakdown') state = 'Breathing · chills and chatter';
    else if (m.section === 'drop' || m.section === 'groove') state = v.motor > 0.5 ? 'Locked into the groove' : 'Warming up';
    else state = 'Listening';
    $('brainState').textContent = state;
    const rows = REGIONS.map((r) => [r.label, v[r.id], `rgb(${r.color.join(',')})`]);
    rows.push(['Fatigue', v.fatigue, '#8a8a9a'], ['Overall hype', v.hype, '#b35cff']);
    $('brainBars').innerHTML = rows.map(([n, val, c]) => `<div><i class="dot" style="background:${c}"></i><span>${n}</span><b><i style="width:${Math.round(val * 100)}%;background:${c}"></i></b><span>${Math.round(val * 100)}</span></div>`).join('');
    if (sel) {
      const P = sel.p;
      $('who').innerHTML = `${esc(sel.style)} · ${esc(sel.state)}${sel.holding ? ' · ' + esc(sel.holding) : ''}<br>energy ${pct(P.energy)} · loves bass ${pct(P.bass)} · loves builds ${pct(P.build)}<br>reacts in ${Math.round(P.delay * 1000)} ms · stamina ${pct(P.stamina)}<br><a href="#" id="clearSel">← whole crowd</a>`;
      const cs = $('clearSel');
      if (cs)
        cs.onclick = (e) => {
          e.preventDefault();
          people.selected = null;
          this.onClearSelection && this.onClearSelection();
        };
    } else $('who').textContent = people ? `${people.crowd.length} guests · click anyone to see their brain` : '';
    if (people) {
      const html = people.dropLog.map((d) => `<li><span>${esc(d.track.slice(0, 20))} @${fmt(d.time)}</span><b>${d.score === null ? '…' : d.score + (d.score > 75 ? ' 🔥' : d.score > 50 ? ' ✓' : ' ·')}</b></li>`).join('');
      if (html !== this.lastDrops) $('drops').innerHTML = this.lastDrops = html || '<li class="tmeta">No drops yet</li>';
    }
  }
  drawNowBar(m) {
    const c = $('nowBar');
    const W = c.clientWidth;
    if (!W) return;
    if (c.width !== W) c.width = W;
    const g = c.getContext('2d');
    const H = c.height;
    g.clearRect(0, 0, W, H);
    if (!m.playing) return;
    const A = m.track.analysis;
    for (const s of A.sections) {
      g.fillStyle = SECTION_COL[s.type] || '#444';
      g.globalAlpha = 0.6;
      g.fillRect((s.start / A.duration) * W, 4, ((s.end - s.start) / A.duration) * W, 14);
    }
    g.globalAlpha = 1;
    for (const d of A.drops) {
      g.fillStyle = '#ff3030';
      g.fillRect((d.time / A.duration) * W - 1, 0, 2, 20);
    }
    const p = this.dj.plan;
    if (p && p.from === m.track) {
      const x = (A.bars[p.startOut].start / A.duration) * W;
      g.fillStyle = '#ffd84a';
      g.fillRect(x - 1, 0, 2, H);
    }
    const h = this.hype.get(m.track.id) || [];
    g.strokeStyle = '#ff3a8a';
    g.lineWidth = 1.5;
    g.beginPath();
    h.forEach(([t, v], i) => {
      const x = (t / A.duration) * W;
      const y = H - 2 - v * 12;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    g.fillStyle = '#fff';
    g.fillRect((m.t / A.duration) * W - 1, 0, 2, H);
  }
}
const pct = (v) => Math.round(v * 100) + '%';
