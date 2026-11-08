// DJ booth matching the reference layout: CDJ, CDJ, 4-channel mixer, CDJ, CDJ, with the
// RMX-style FX unit raised behind the mixer. Screens draw the real analysed waveform
// (3-band colours), jogs spin while playing, knobs/faders mirror the engine state.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { STAGE } from './club.js';
import { mergeStatic, bakeColored } from './merge.js';
import { cheapenMaterials } from './bloom.js';

const SECTION_COL = { intro: '#555b66', groove: '#2fa860', build: '#e8c020', drop: '#e83a3a', breakdown: '#3a6ae8', outro: '#555b66' };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35, ...opts });
}
const M = {
  body: mat(0x1b1b1e, { roughness: 0.5 }),
  top: mat(0x232327, { roughness: 0.35 }),
  black: mat(0x0b0b0c, { roughness: 0.4 }),
  knob: mat(0x101012, { roughness: 0.3, metalness: 0.2 }),
  metal: mat(0x9a9aa2, { roughness: 0.25, metalness: 0.95 }),
  rubber: mat(0x151515, { roughness: 0.9, metalness: 0 }),
};
const glow = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
// shared materials (fewer state changes / draw calls)
const IND = glow(0xffffff);
const RINGS = new Map();
const ringMat = (c) => {
  if (!RINGS.has(c)) RINGS.set(c, glow(c));
  return RINGS.get(c);
};
const USB = glow(0x2266ff);
const PADS = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

function makeScreen(w, h, px = 512) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round((px * h) / w);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { canvas: c, ctx: c.getContext('2d'), tex, mesh };
}

function knob(r = 0.011, h = 0.018, ring = null) {
  const g = new THREE.Group();
  const k = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 20), M.knob);
  k.position.y = h / 2;
  g.add(k);
  const ind = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.002, r * 0.8), IND);
  ind.position.set(0, h + 0.001, -r * 0.45);
  g.add(ind);
  if (ring) {
    const rg = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.0015, 6, 24), ringMat(ring));
    rg.rotation.x = Math.PI / 2;
    rg.position.y = 0.002;
    g.add(rg);
  }
  return g;
}

function buildCDJ(index) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.33, 0.1, 0.45, 3, 0.012), M.body);
  body.position.y = 0.05;
  g.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.004, 0.43), M.top);
  plate.position.y = 0.101;
  g.add(plate);
  // screen (9" touchscreen) tilted toward the DJ
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.29, 0.18, 0.025, 2, 0.006), M.black);
  housing.position.set(0, 0.18, 0.2);
  housing.rotation.x = 0.42;
  g.add(housing);
  const scr = makeScreen(0.262, 0.152, 512);
  scr.mesh.position.set(0, 0, -0.0131);
  scr.mesh.rotation.y = Math.PI;
  housing.add(scr.mesh);
  // jog wheel
  const jogBase = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.106, 0.012, 48), M.metal);
  jogBase.position.set(0, 0.108, -0.03);
  g.add(jogBase);
  const jog = new THREE.Group();
  jog.position.set(0, 0.115, -0.03);
  g.add(jog);
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.006, 48), mat(0x0e0e10, { roughness: 0.15, metalness: 0.6 }));
  jog.add(platter);
  for (let i = 0; i < 24; i++) {
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.001, 0.012), M.metal);
    const a = (i / 24) * Math.PI * 2;
    dot.position.set(Math.cos(a) * 0.088, 0.0035, Math.sin(a) * 0.088);
    dot.rotation.y = -a;
    jog.add(dot);
  }
  const center = makeScreen(0.07, 0.07, 128);
  center.mesh.rotation.x = -Math.PI / 2;
  center.mesh.position.y = 0.0036;
  jog.add(center.mesh);
  mergeStatic(jog, [center.mesh]); // 24 dots -> 1 mesh
  // play / cue
  const play = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.008, 24), glow(0x1d8f2f));
  play.position.set(-0.125, 0.104, -0.185);
  g.add(play);
  const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.008, 24), glow(0xc87814));
  cue.position.set(-0.125, 0.104, -0.135);
  g.add(cue);
  // tempo fader
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.15), M.black);
  slot.position.set(0.135, 0.104, -0.08);
  g.add(slot);
  const tcap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.012), M.knob);
  tcap.position.set(0.135, 0.11, -0.08);
  g.add(tcap);
  // hot cue pads
  const padCols = [0xff2a6d, 0xff9a1f, 0xffe11f, 0x2aff6a, 0x1fd2ff, 0x3a5cff, 0xa13aff, 0xff3ad2];
  const padGroup = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.006, 0.014), new THREE.MeshBasicMaterial({ color: new THREE.Color(padCols[i]).multiplyScalar(0.3) }));
    p.position.set(-0.098 + i * 0.028, 0.105, 0.095);
    padGroup.add(p);
  }
  const pads = bakeColored(padGroup, PADS); // 8 pads -> 1 mesh
  g.add(pads);
  // misc buttons + browse knob
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.005, 0.01), M.black);
    b.position.set(-0.13, 0.105, 0.03 - i * 0.03);
    g.add(b);
  }
  const browse = knob(0.012, 0.012);
  browse.position.set(0.13, 0.102, 0.06);
  g.add(browse);
  // USB slot
  const usb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.004), USB);
  usb.position.set(0.11, 0.08, -0.226);
  g.add(usb);
  return { group: g, screen: scr, housing, center, jog, play, cue, pads, tcap, index, wfCache: null, wfTrack: null };
}

function buildMixer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.1, 0.45, 3, 0.012), M.body);
  body.position.y = 0.05;
  g.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.004, 0.43), M.top);
  plate.position.y = 0.101;
  g.add(plate);
  const ch = [];
  // DJ's left = +x: channel 1 is the left-most
  const xs = [0.165, 0.075, -0.015, -0.105];
  xs.forEach((x, i) => {
    const c = { x };
    const mk = (name, z, ring) => {
      const k = knob(0.011, 0.016, ring);
      k.position.set(x, 0.102, z);
      g.add(k);
      c[name] = k;
    };
    mk('trim', 0.185);
    mk('high', 0.14);
    mk('mid', 0.1);
    mk('low', 0.06);
    mk('filter', 0.005, 0x3a6aff);
    // VU meter (12 segments)
    // 12 segments as one instanced mesh (lit segments recoloured each frame)
    const vu = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.003, 0.006), new THREE.MeshBasicMaterial({ toneMapped: false }), 12);
    const m4 = new THREE.Matrix4();
    vu.userData.on = [];
    for (let s = 0; s < 12; s++) {
      m4.makeTranslation(x + 0.033, 0.103, 0.015 + s * 0.0145);
      vu.setMatrixAt(s, m4);
      vu.userData.on.push(new THREE.Color(s > 10 ? 0xff2020 : s > 8 ? 0xffa020 : 0x20ff60));
      vu.setColorAt(s, new THREE.Color(0x050505));
    }
    vu.userData.off = new THREE.Color(0x060606);
    vu.userData.lit = -1;
    g.add(vu);
    c.vu = vu;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.002, 0.1), M.black);
    slot.position.set(x, 0.104, -0.12);
    g.add(slot);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.014), mat(0x2a2a2e, { roughness: 0.6 }));
    cap.position.set(x, 0.112, -0.17);
    g.add(cap);
    c.cap = cap;
    // cue buttons
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.01), glow(0xffa020));
    cb.position.set(x, 0.105, -0.045);
    cb.material.color.multiplyScalar(0.3);
    g.add(cb);
    ch.push(c);
  });
  // crossfader
  const xslot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.002, 0.005), M.black);
  xslot.position.set(0.03, 0.104, -0.205);
  g.add(xslot);
  const xcap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.03), mat(0x2a2a2e));
  xcap.position.set(0.03, 0.112, -0.205);
  g.add(xcap);
  // beat FX section (right side) with its small screen
  const fxScr = makeScreen(0.06, 0.04, 128);
  fxScr.mesh.rotation.x = -Math.PI / 2;
  fxScr.mesh.position.set(-0.19, 0.104, 0.15);
  g.add(fxScr.mesh);
  const fxKnob = knob(0.013, 0.016);
  fxKnob.position.set(-0.19, 0.102, 0.08);
  g.add(fxKnob);
  const fxOn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 20), glow(0xff3030));
  fxOn.position.set(-0.19, 0.105, -0.12);
  g.add(fxOn);
  const master = knob(0.012, 0.016);
  master.position.set(-0.19, 0.102, 0.0);
  g.add(master);
  return { group: g, ch, xcap, fxScr, fxKnob, fxOn };
}

function buildRMX() {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.008, 0.22), M.metal);
  stand.position.y = 0.0;
  g.add(stand);
  for (const x of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012), M.metal);
    leg.position.set(x, -0.08, 0.08);
    g.add(leg);
  }
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.06, 0.2, 3, 0.012), M.body);
  body.position.y = 0.034;
  g.add(body);
  const knobs = [];
  for (let i = 0; i < 3; i++) {
    const k = knob(0.022, 0.02, 0xffffff);
    k.position.set(0.14 - i * 0.065, 0.064, 0.0);
    g.add(k);
    knobs.push(k);
  }
  const jogRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.006, 10, 40), glow(0x1a6aff));
  jogRing.rotation.x = Math.PI / 2;
  jogRing.position.set(-0.1, 0.066, 0);
  g.add(jogRing);
  const jog = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.052, 0.018, 36), M.knob);
  jog.position.set(-0.1, 0.07, 0);
  g.add(jog);
  const scr = makeScreen(0.07, 0.03, 128);
  scr.mesh.rotation.x = -Math.PI / 2;
  scr.mesh.position.set(0.075, 0.0645, 0.075);
  g.add(scr.mesh);
  return { group: g, knobs, jogRing, jog, scr };
}

export function buildBooth(scene) {
  const booth = new THREE.Group();
  const topY = STAGE.y + 0.95;
  booth.position.set(0, topY, -8.0);
  scene.add(booth);
  // table
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 0.8), mat(0x0e0e10, { roughness: 0.7 }));
  table.position.y = -0.475;
  booth.add(table);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.95), new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.3, metalness: 0.6 }));
  front.position.set(0, -0.475, 0.401);
  booth.add(front);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.02, 0.02), glow(0x6a2cff));
  strip.position.set(0, -0.06, 0.41);
  strip.userData.led = true;
  booth.add(strip);
  const strip2 = strip.clone();
  strip2.position.y = -0.9;
  booth.add(strip2);

  const decks = [];
  const xs = [0.765, 0.415, -0.415, -0.765];
  for (let i = 0; i < 4; i++) {
    const d = buildCDJ(i);
    d.group.position.set(xs[i], 0, 0);
    booth.add(d.group);
    decks.push(d);
  }
  const mixer = buildMixer();
  booth.add(mixer.group);
  const rmx = buildRMX();
  rmx.group.position.set(0, 0.2, 0.32);
  rmx.group.rotation.x = 0.25;
  booth.add(rmx.group);
  // cables
  const cableMat = mat(0x050505, { roughness: 0.8, metalness: 0 });
  for (const x of [...xs, 0]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.05, 0.22), new THREE.Vector3(x * 0.9, -0.02, 0.36), new THREE.Vector3(x * 0.5, -0.3, 0.38), new THREE.Vector3(0, -0.5, 0.35)]);
    const c = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.004, 5), cableMat);
    booth.add(c);
  }
  // headphones resting on the table
  const hp = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 20, Math.PI), M.black);
  hp.position.set(1.05, 0.02, -0.15);
  hp.rotation.set(-Math.PI / 2, 0, 0.4);
  booth.add(hp);

  const keep = [];
  for (const d of decks) keep.push(d.housing, d.jog, d.play, d.cue, d.tcap, d.pads);
  for (const c of mixer.ch) keep.push(c.trim, c.high, c.mid, c.low, c.filter, c.cap, c.vu);
  keep.push(mixer.xcap, mixer.fxScr.mesh, mixer.fxKnob, mixer.fxOn, ...rmx.knobs, rmx.jogRing, rmx.jog, rmx.scr.mesh, strip, strip2);
  cheapenMaterials(booth);
  console.info('booth meshes merged', mergeStatic(booth, keep));
  return { group: booth, decks, mixer, rmx, topY, wfT: 0 };
}

// world position of a control, for the DJ's hand targets
const v = new THREE.Vector3();
export function controlWorldPos(booth, deck, control) {
  let obj;
  if (control === 'rmx') obj = booth.rmx.knobs[1];
  else if (deck < 0) obj = booth.mixer.fxKnob;
  else if (control === 'play' || control === 'cue') obj = booth.decks[deck].play;
  else if (control === 'fader') obj = booth.mixer.ch[deck].cap;
  else obj = booth.mixer.ch[deck][control] || booth.mixer.ch[deck].filter;
  obj.updateWorldMatrix(true, false);
  return obj.getWorldPosition(v.clone());
}

function drawOverview(track, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const A = track.analysis;
  const n = A.wave.full.length;
  for (let x = 0; x < w; x++) {
    const i0 = Math.floor((x / w) * n);
    const i1 = Math.floor(((x + 1) / w) * n);
    let lo = 0;
    let mi = 0;
    let hi = 0;
    for (let i = i0; i < i1; i++) {
      lo = Math.max(lo, A.wave.low[i]);
      mi = Math.max(mi, A.wave.mid[i]);
      hi = Math.max(hi, A.wave.high[i]);
    }
    const cy = h / 2;
    g.fillStyle = '#1f4fe0';
    g.fillRect(x, cy - lo * cy, 1, lo * 2 * cy);
    g.fillStyle = '#ff9a20';
    g.fillRect(x, cy - mi * cy * 0.7, 1, mi * 1.4 * cy);
    g.fillStyle = '#ffffff';
    g.fillRect(x, cy - hi * cy * 0.4, 1, hi * 0.8 * cy);
  }
  return c;
}

function fmt(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function drawCDJScreen(d, deck, now) {
  const { ctx: g, canvas } = d.screen;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, W, H);
  const tr = deck.track;
  g.font = 'bold 16px Arial';
  g.fillStyle = '#3a8bff';
  g.fillText(`DECK ${deck.index + 1}`, 8, 20);
  if (!tr || !tr.analysis) {
    if (d.emptyDrawn) return;
    d.emptyDrawn = true;
    g.fillStyle = '#666';
    g.font = 'bold 26px Arial';
    g.fillText('NO TRACK', W / 2 - 70, H / 2);
    g.font = '14px Arial';
    g.fillText('load a track from the queue', W / 2 - 88, H / 2 + 24);
    d.screen.tex.needsUpdate = true;
    return;
  }
  d.emptyDrawn = false;
  const A = tr.analysis;
  const pos = deck.vpos;
  g.fillStyle = '#fff';
  g.font = 'bold 15px Arial';
  g.fillText(tr.name.slice(0, 34), 80, 20);
  g.font = 'bold 22px Arial';
  g.fillStyle = deck.playing ? '#fff' : '#ffb020';
  g.fillText(fmt(pos), 8, H - 12);
  g.fillStyle = '#ff4d4d';
  g.fillText('-' + fmt(A.duration - pos), 120, H - 12);
  g.fillStyle = '#fff';
  g.fillText((A.bpm * deck.rate).toFixed(1), W - 80, H - 12);
  g.font = '11px Arial';
  g.fillStyle = '#9aa';
  g.fillText('BPM', W - 22, H - 12);
  g.fillText(`${((deck.rate - 1) * 100).toFixed(1)}%`, W - 140, H - 12);
  // beat counter
  const bt = Math.floor((pos - A.beats[0]) / (60 / A.bpm));
  for (let i = 0; i < 4; i++) {
    g.fillStyle = ((((bt - A.downbeatIndex) % 4) + 4) % 4) === i && deck.playing ? '#ff3030' : '#333';
    g.fillRect(W - 140 + i * 30, 30, 24, 6);
  }
  // zoomed waveform (8 s window)
  const top = 44;
  const wh = 120;
  const cy = top + wh / 2;
  const fps = A.fps;
  const span = 8;
  for (let x = 0; x < W; x++) {
    const t0 = pos + ((x - W / 2) / W) * span;
    if (t0 < 0 || t0 > A.duration) continue;
    const i = Math.floor(t0 * fps);
    const j = Math.floor((pos + ((x + 1 - W / 2) / W) * span) * fps);
    let lo = 0;
    let mi = 0;
    let hi = 0;
    for (let k = i; k <= j && k < A.wave.low.length; k++) {
      lo = Math.max(lo, A.wave.low[k]);
      mi = Math.max(mi, A.wave.mid[k]);
      hi = Math.max(hi, A.wave.high[k]);
    }
    const past = x < W / 2 ? 0.55 : 1;
    g.globalAlpha = past;
    g.fillStyle = '#1f4fe0';
    g.fillRect(x, cy - lo * wh * 0.5, 1, lo * wh);
    g.fillStyle = '#ff9a20';
    g.fillRect(x, cy - mi * wh * 0.36, 1, mi * wh * 0.72);
    g.fillStyle = '#ffffff';
    g.fillRect(x, cy - hi * wh * 0.2, 1, hi * wh * 0.4);
  }
  g.globalAlpha = 1;
  // beat grid
  const beat = 60 / A.bpm;
  const firstB = Math.ceil((pos - span / 2 - A.beats[0]) / beat);
  for (let b = firstB; ; b++) {
    const tb = A.beats[0] + b * beat;
    const x = W / 2 + ((tb - pos) / span) * W;
    if (x > W) break;
    const down = (((b - A.downbeatIndex) % 4) + 4) % 4 === 0;
    g.fillStyle = down ? '#ff4040' : 'rgba(255,255,255,0.5)';
    g.fillRect(x, top, down ? 2 : 1, 8);
  }
  // sections strip + playhead
  for (const s of A.sections) {
    const x0 = W / 2 + ((s.start - pos) / span) * W;
    const x1 = W / 2 + ((s.end - pos) / span) * W;
    if (x1 < 0 || x0 > W) continue;
    g.fillStyle = SECTION_COL[s.type] || '#555';
    g.fillRect(Math.max(0, x0), top + wh + 2, Math.min(W, x1) - Math.max(0, x0), 5);
  }
  g.fillStyle = '#ff2020';
  g.fillRect(W / 2 - 1, top - 2, 2, wh + 6);
  // overview
  if (d.wfTrack !== tr) {
    d.wfCache = drawOverview(tr, W - 16, 34);
    d.wfTrack = tr;
  }
  const oy = top + wh + 12;
  g.drawImage(d.wfCache, 8, oy);
  const px = 8 + (pos / A.duration) * (W - 16);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(8, oy, px - 8, 34);
  for (const dr of A.drops) {
    g.fillStyle = '#ff3030';
    g.fillRect(8 + (dr.time / A.duration) * (W - 16), oy - 3, 2, 3);
  }
  g.fillStyle = '#fff';
  g.fillRect(px, oy - 2, 2, 38);
  d.screen.tex.needsUpdate = true;
}

function drawJogCenter(d, deck) {
  const { ctx: g, canvas } = d.center;
  const W = canvas.width;
  g.clearRect(0, 0, W, W);
  g.fillStyle = '#050505';
  g.beginPath();
  g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
  g.fill();
  const playing = deck.playing;
  const frac = deck.track && deck.track.analysis ? deck.vpos / deck.track.analysis.duration : 0;
  g.lineWidth = 10;
  g.strokeStyle = playing ? '#ff2a4a' : '#552030';
  g.beginPath();
  g.arc(W / 2, W / 2, W / 2 - 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#1a6aff';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(W / 2, W / 2, W / 2 - 22, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#fff';
  g.fillRect(W / 2 - 2, 10, 4, 22);
  d.center.tex.needsUpdate = true;
}

export function updateBooth(booth, engine, dt, now, camPos) {
  booth.wfT += dt;
  const near = !camPos || camPos.distanceTo(booth.group.position) < 9;
  const redraw = booth.wfT > (near ? 1 / 12 : 1 / 2);
  if (redraw) booth.wfT = 0;
  booth.decks.forEach((d, i) => {
    const deck = engine.decks[i];
    if (deck.playing) d.jog.rotation.y -= dt * deck.rate * ((33.33 / 60) * Math.PI * 2);
    const sig = (deck.track ? deck.track.id : 0) + ':' + deck.cuePos.toFixed(2);
    if (redraw && (deck.playing || d.sig !== sig)) {
      d.sig = sig;
      drawCDJScreen(d, deck, now);
      drawJogCenter(d, deck);
    }
    const blink = Math.floor(now * 2) % 2 === 0;
    d.play.material.color.setHex(deck.playing ? 0x2aff4a : deck.track ? (blink ? 0x2aff4a : 0x0a3010) : 0x0a2010);
    d.cue.material.color.setHex(deck.track ? 0xffa020 : 0x3a2008);
    d.tcap.position.z = -0.08 + (deck.rate - 1) * 0.6;
    // mixer channel
    const c = booth.mixer.ch[i];
    const knobAngle = (v) => -(v - 0.5) * 2 * 2.35;
    c.high.rotation.y = knobAngle(deck.ui.high);
    c.mid.rotation.y = knobAngle(deck.ui.mid);
    c.low.rotation.y = knobAngle(deck.ui.low);
    c.filter.rotation.y = -deck.ui.filter * 2.35;
    c.trim.rotation.y = knobAngle(0.55);
    c.cap.position.z = -0.17 + deck.ui.fader * 0.095;
    const lv = Math.min(1, deck.level);
    const lit = Math.round(lv * 12);
    if (lit !== c.vu.userData.lit) {
      c.vu.userData.lit = lit;
      for (let k = 0; k < 12; k++) c.vu.setColorAt(k, k < lit ? c.vu.userData.on[k] : c.vu.userData.off);
      c.vu.instanceColor.needsUpdate = true;
    }
  });
  const r = booth.rmx;
  r.knobs[0].rotation.y = -engine.rmx.noise * 4;
  r.knobs[1].rotation.y = -engine.rmx.echo * 3;
  r.knobs[2].rotation.y = -engine.rmx.verb * 3;
  const active = engine.rmx.noise + engine.rmx.echo > 0.05;
  r.jogRing.material.color.setHex(active ? 0x6ab0ff : 0x1a4aff);
  if (active) r.jog.rotation.y += dt * 3;
  booth.mixer.fxOn.material.color.setHex(active ? 0xff3030 : 0x401010);
  if (redraw) {
    const g = r.scr.ctx;
    g.fillStyle = '#020610';
    g.fillRect(0, 0, 128, 55);
    g.fillStyle = active ? '#6ab0ff' : '#2a4a8a';
    g.font = 'bold 18px Arial';
    g.fillText(engine.rmx.noise > 0.05 ? 'NOISE' : engine.rmx.echo > 0.05 ? 'ECHO' : 'RMX', 8, 34);
    r.scr.tex.needsUpdate = true;
    const f = booth.mixer.fxScr.ctx;
    f.fillStyle = '#020610';
    f.fillRect(0, 0, 128, 85);
    f.fillStyle = '#ff9a20';
    f.font = 'bold 20px Arial';
    f.fillText('ECHO 3/4', 6, 30);
    f.fillStyle = '#fff';
    f.font = '14px Arial';
    f.fillText(`${(engine.decks[0].eng && 0) || ''}`, 6, 60);
    booth.mixer.fxScr.tex.needsUpdate = true;
  }
}
