import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { analyzeBuffer } from './audio/analyzer.js';
import { AudioEngine } from './audio/engine.js';
import { AutoDJ } from './audio/autodj.js';
import { buildClub, updateClub, STAGE, zoneAt } from './scene/club.js';
import { buildBooth, updateBooth, controlWorldPos } from './scene/booth.js';
import { loadAssets, PeopleSim } from './scene/people.js';

const $ = (id) => document.getElementById(id);
const BASE = import.meta.env.BASE_URL || '/';

// ---------------- renderer / scene ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false;
const maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
let dpr = Math.min(0.85, maxDpr);
renderer.setPixelRatio(dpr);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030208);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
camera.position.set(0, 6.2, 8.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.6, -2);
controls.enableDamping = true;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.52;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.5, 0.78);
composer.addPass(bloom);
const fisheye = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.55 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); vec2 q = p * (1.0 - strength*0.35 + strength*0.35*r*r);
      vec2 uv = q*0.5+0.5; float vig = smoothstep(1.45, 0.75, r);
      if (r > 1.38) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
      gl_FragColor = vec4(texture2D(tDiffuse, uv).rgb * vig, 1.0); }`,
});
fisheye.enabled = false;
composer.addPass(fisheye);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const club = buildClub(scene);
const booth = buildBooth(scene);

// ---------------- audio + DJ ----------------
const engine = new AudioEngine();
const dj = new AutoDJ(engine);
const tracks = [];
let trackId = 0;
let people = null;
const lightFX = { flash: 0, strobe: 0 };

function cleanName(n) {
  return n.replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-/, '').replace(/_/g, ' ');
}

async function addFiles(files, persist = true) {
  for (const f of files) {
    if (!/audio|mpeg|mp3|wav|m4a|aac|ogg/i.test(f.type + f.name)) continue;
    const t = { id: ++trackId, name: cleanName(f.name), status: 'decoding', file: f };
    tracks.push(t);
    renderQueue();
    if (persist) saveTrack(f);
    try {
      const buf = await f.arrayBuffer();
      t.buffer = await engine.ctx.decodeAudioData(buf);
      t.status = 'analysing';
      renderQueue();
      t.analysis = await analyzeBuffer(t.buffer, (p, msg) => {
        t.status = `${msg} ${Math.round(p * 100)}%`;
        renderQueue();
      });
      t.status = `${t.analysis.bpm} BPM · ${t.analysis.drops.length} drops`;
      dj.addTrack(t);
      dj.trackReady();
    } catch (e) {
      console.error(e);
      t.status = 'could not decode';
    }
    renderQueue();
  }
}

function renderQueue() {
  const html = tracks
    .map((t) => `<li class="${dj.cur && dj.cur.track === t ? 'playing' : ''}">${escapeHtml(t.name)}<br><span class="s">${escapeHtml(t.status)}</span></li>`)
    .join('');
  $('queue').innerHTML = html;
  $('startList').innerHTML = html;
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// IndexedDB: remember dropped songs on this computer only
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('clubsim', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'name' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveTrack(f) {
  try {
    const db = await idb();
    db.transaction('tracks', 'readwrite').objectStore('tracks').put({ name: f.name, blob: f });
  } catch (e) {}
}
async function loadSaved() {
  try {
    const db = await idb();
    const all = await new Promise((res, rej) => {
      const r = db.transaction('tracks').objectStore('tracks').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (all.length) addFiles(all.map((x) => new File([x.blob], x.name, { type: x.blob.type || 'audio/mpeg' })), false);
  } catch (e) {}
}

// file inputs + drag/drop
for (const id of ['file', 'file2']) $(id).addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});
$('addBtn').addEventListener('click', () => $('file2').click());
const dropEl = $('drop');
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropEl.classList.add('over');
});
window.addEventListener('dragleave', () => dropEl.classList.remove('over'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropEl.classList.remove('over');
  addFiles([...e.dataTransfer.files]);
});

// DJ events -> UI, hands, crowd
const logEl = $('log');
dj.on('log', (item) => {
  const d = document.createElement('div');
  d.className = item.kind;
  d.textContent = item.text;
  logEl.prepend(d);
  while (logEl.children.length > 30) logEl.lastChild.remove();
});
dj.on('gesture', (e) => {
  if (!people) return;
  people.gesture(e, controlWorldPos(booth, e.deck, e.control), e.when);
});
dj.on('drop', (ev) => {
  lightFX.flash = 1;
  lightFX.dropAt = engine.now;
  lightFX.dropStrength = ev.drop.strength;
  if (!people) return;
  people.onDrop(ev, engine.now, (4 * 60) / (dj.masterBpm || 124));
  const eu = people.avg('anticipation') + ev.drop.strength * 0.6;
  engine.cheer(Math.min(1, 0.35 + eu * 0.6));
});
dj.on('track', () => {
  renderQueue();
  if (!people) return;
  // random crowd traits per track: clap-along (~1 in 4), chant/sing-along (~1 in 5)
  people.events.clapAlong = Math.random() < 0.25;
  people.events.chant = Math.random() < 0.2;
  if (people.events.clapAlong) dj.say('Crowd: this one gets a clap-along on the builds', 'track');
  if (people.events.chant) dj.say('Crowd: they are singing along to this one ("oh-oh")', 'track');
});

// ---------------- people ----------------
let assetsReady = false;
loadAssets(BASE, (p) => ($('enter').textContent = `Loading people ${Math.round(p * 100)}%`))
  .then((assets) => {
    window.__assets = assets;
    assetsReady = true;
    $('enter').disabled = false;
    $('enter').textContent = 'Enter the club';
  })
  .catch((e) => {
    console.error(e);
    $('enter').disabled = false;
    $('enter').textContent = 'Enter (people failed to load)';
  });

$('enter').addEventListener('click', async () => {
  await engine.resume();
  const q = $('quality').value;
  quality = q;
  if (q === 'low') dpr = 0.7;
  bloom.enabled = q !== 'low';
  if (q === 'high') dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  resize();
  if (assetsReady && !people) {
    people = new PeopleSim(scene, window.__assets, booth);
    people.populate(parseInt($('crowdSize').value, 10));
    people.onToast = toast;
  }
  $('start').style.display = 'none';
  $('hud').hidden = false;
  dj.trackReady();
  renderQueue();
});
loadSaved();

let toastTimer = null;
function toast(first, second, delay) {
  const t = $('toast');
  t.className = '';
  t.textContent = first;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = 'ok';
    t.textContent = second;
    toastTimer = setTimeout(() => (t.style.display = 'none'), 1800);
  }, delay * 1000);
}

// ---------------- cameras ----------------
let camMode = 'orbit';
const input = { keys: {}, active: false, camYaw: Math.PI / 2, camPitch: 0.25, drag: false };
window.addEventListener('keydown', (e) => (input.keys[e.code] = true));
window.addEventListener('keyup', (e) => (input.keys[e.code] = false));
let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  input.drag = true;
  downAt = [e.clientX, e.clientY];
});
window.addEventListener('pointerup', (e) => {
  input.drag = false;
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5 && people) {
    const p = people.pick(e.clientX, e.clientY, camera, window.innerWidth, window.innerHeight);
    if (p) setMarker(p);
  }
  downAt = null;
});
window.addEventListener('pointermove', (e) => {
  if (camMode === 'play' && input.drag) {
    input.camYaw -= e.movementX * 0.006;
    input.camPitch = Math.max(-0.2, Math.min(0.9, input.camPitch + e.movementY * 0.004));
  }
});
document.querySelectorAll('#cams button').forEach((b) =>
  b.addEventListener('click', () => {
    camMode = b.dataset.cam;
    document.querySelectorAll('#cams button').forEach((x) => x.classList.toggle('on', x === b));
    controls.enabled = camMode === 'orbit';
    input.active = camMode === 'play';
    fisheye.enabled = camMode === 'fisheye';
    camera.fov = camMode === 'fisheye' ? 115 : camMode === 'drone' ? 75 : camMode === 'phone' ? 68 : 60;
    camera.updateProjectionMatrix();
    if (phoneHolder) phoneHolder.forceAnim = false;
    if (camMode === 'phone' && people) {
      phoneHolder = pickFilmer();
      if (phoneHolder) phoneHolder.forceAnim = true;
    }
  })
);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xff3a8a, toneMapped: false, transparent: true, opacity: 0.9 }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
function setMarker(p) {
  marker.visible = true;
  marker.userData.p = p;
}

// drone: waypoints with inertia, banking and altitude hold
const drone = { pos: new THREE.Vector3(-10, 5, 8), vel: new THREE.Vector3(), i: 0, roll: 0, look: new THREE.Vector3(0, 2, -6) };
const droneWP = [
  [-10, 5, 8],
  [-6, 3.2, 2],
  [0, 2.6, -2],
  [5, 3.4, -4.5],
  [8, 5.5, -1],
  [6, 6.6, 5],
  [0, 6.8, 3],
  [-6, 4.2, 6],
  [0, 3.5, 8.4],
  [8, 2.8, 7],
  [12, 3.2, 2],
  [3, 4.5, -3],
].map((a) => new THREE.Vector3(...a));
let phoneHolder = null;
let boothHint = false;
function pickFilmer() {
  const c = people.crowd.filter((p) => p.state === 'dance').sort((a, b) => a.home.z - b.home.z);
  const mid = c.slice(Math.floor(c.length * 0.35), Math.floor(c.length * 0.8));
  const f = mid.filter((p) => p.style === 'filmer');
  const pool = f.length ? f : mid.length ? mid : c;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
function updateCamera(dt, t, m) {
  if (camMode === 'orbit') {
    controls.update();
    return;
  }
  if (camMode === 'drone') {
    const wp = droneWP[drone.i];
    tv.subVectors(wp, drone.pos);
    const d = tv.length();
    if (d < 1.2) drone.i = (drone.i + 1) % droneWP.length;
    const desired = tv.normalize().multiplyScalar(Math.min(3.2, d * 1.2));
    const acc = desired.sub(drone.vel).clampLength(0, 2.4);
    drone.vel.addScaledVector(acc, dt);
    drone.vel.multiplyScalar(1 - dt * 0.15);
    drone.pos.addScaledVector(drone.vel, dt);
    drone.pos.y += Math.sin(t * 1.7) * 0.004; // hover wobble
    const lateral = acc.x * Math.cos(t) - acc.z * Math.sin(t);
    drone.roll += (-lateral * 0.08 - drone.roll) * dt * 2;
    tv2.copy(drone.pos).addScaledVector(drone.vel, 2.5);
    tv2.lerp(new THREE.Vector3(0, 2.2, -7), 0.55);
    drone.look.lerp(tv2, dt * 1.5);
    camera.position.copy(drone.pos);
    camera.lookAt(drone.look);
    camera.rotateZ(drone.roll);
    return;
  }
  if (camMode === 'balcony') {
    camera.position.set(-12.6 + Math.sin(t * 0.2) * 0.05, 5.9, 1.5);
    camera.lookAt(0, 2.0, -5.5);
    return;
  }
  if (camMode === 'djpov' && people) {
    people.dj.head(tv);
    camera.position.copy(tv).add(new THREE.Vector3(0, 0.08, 0.12));
    camera.lookAt(0, 1.0, -3.5);
    return;
  }
  if (camMode === 'fisheye') {
    camera.position.set(0, STAGE.y + 1.22, -7.28);
    camera.lookAt(0, STAGE.y + 1.55, -8.8);
    return;
  }
  if (camMode === 'front') {
    camera.position.set(Math.sin(t * 0.15) * 1.5, 2.3, -1.5);
    camera.lookAt(0, 2.6, -9);
    return;
  }
  if (camMode === 'phone' && phoneHolder) {
    phoneHolder.head(tv);
    const fwd = new THREE.Vector3(Math.sin(phoneHolder.yaw), 0, Math.cos(phoneHolder.yaw));
    const shake = (m.playing ? 0.01 + m.energy * 0.012 : 0.004) * (phoneHolder.curName === 'jump' ? 3 : 1);
    camera.position.copy(tv).addScaledVector(fwd, 0.32).add(new THREE.Vector3(Math.sin(t * 13) * shake, 0.1 + Math.sin(t * 9.3) * shake, Math.sin(t * 11.7) * shake));
    camera.lookAt(0 + Math.sin(t * 0.7) * 0.6, 2.7, -9);
    camera.rotateZ(Math.sin(t * 2.1) * 0.03);
    return;
  }
  if (camMode === 'play' && people) {
    const p = people.player;
    const py = p.root.position.y;
    if (zoneAt(p.pos.x, p.pos.z, p.level) === 'booth') {
      // next to the DJ: over-the-shoulder view of the decks and his hands
      const side = p.pos.x >= 0 ? 1 : -1;
      tv2.set(p.pos.x + side * 0.25, py + 2.0, Math.min(p.pos.z, -8.55) - 0.25);
      camera.position.lerp(tv2, Math.min(1, dt * 7));
      camera.lookAt(side * 0.2, booth.topY + 0.05, -7.95);
      if (!boothHint) {
        boothHint = true;
        toast('You are in the DJ booth', 'Watching the decks. Walk out to leave.', 1.2);
      }
      return;
    }
    const back = new THREE.Vector3(Math.sin(input.camYaw), 0, Math.cos(input.camYaw));
    const dist = 3.2;
    const target = tv.set(p.pos.x, py + 1.65, p.pos.z);
    const want = tv2.copy(target).addScaledVector(back, -dist * Math.cos(input.camPitch)).add(new THREE.Vector3(0, dist * Math.sin(input.camPitch), 0));
    want.x = Math.max(-14.6, Math.min(14.6, want.x));
    want.z = Math.max(-13.6, Math.min(9.6, want.z));
    want.y = Math.max(py + 0.6, Math.min(7.2, want.y));
    camera.position.lerp(want, Math.min(1, dt * 8));
    camera.lookAt(target);
  }
}

// ---------------- HUD ----------------
const SECTION_COL = { intro: '#555b66', groove: '#2fa860', build: '#e8c020', drop: '#e83a3a', breakdown: '#3a6aff', outro: '#555b66', idle: '#333' };
const hypeHistory = [];
let lastDropsHtml = '';
let hudT = 0;
function updateHUD(m, dt) {
  hudT += dt;
  if (hudT < 0.25) return;
  hudT = 0;
  const crowdHype = people ? people.avg('hype') : 0;
  $('hypeBar').style.width = `${Math.round(crowdHype * 100)}%`;
  if (m.playing) {
    $('deckTag').textContent = `DECK ${m.deck + 1}`;
    $('trackName').textContent = m.track.name;
    const s = $('sectionTag');
    s.textContent = m.section.toUpperCase() + (m.transition ? ' · MIXING' : '');
    s.style.background = SECTION_COL[m.section] || '#333';
    $('dropIn').textContent = m.nextDrop && m.barsToDrop <= 16 ? `DROP IN ${m.barsToDrop} BAR${m.barsToDrop === 1 ? '' : 'S'}` : '';
    $('bpm').textContent = `${m.bpm.toFixed(1)} BPM`;
    hypeHistory.push([m.track.id, m.t, crowdHype]);
    if (hypeHistory.length > 4000) hypeHistory.shift();
  }
  // brain panel
  if (people) {
    const sel = marker.userData.p;
    const src = sel ? sel.b : { groove: people.avg('groove'), anticipation: people.avg('anticipation'), euphoria: people.avg('euphoria'), fatigue: people.avg('fatigue'), hype: crowdHype };
    $('brainTitle').textContent = sel ? `${sel.name}'s brain` : 'Crowd brain';
    const rows = [
      ['Groove (motor)', src.groove, '#3a6aff'],
      ['Anticipation', src.anticipation, '#e8c020'],
      ['Euphoria', src.euphoria, '#ff3a8a'],
      ['Fatigue', src.fatigue, '#8a8a9a'],
      ['Hype', src.hype, '#9a5cff'],
    ];
    $('brainBars').innerHTML = rows.map(([n, v, c]) => `<div><span>${n}</span><b><i style="width:${Math.round(v * 100)}%;background:${c}"></i></b><span>${Math.round(v * 100)}</span></div>`).join('');
    $('rMotor').setAttribute('opacity', 0.15 + src.groove * 0.85);
    $('rAnt').setAttribute('opacity', 0.15 + src.anticipation * 0.85);
    $('rEu').setAttribute('opacity', 0.15 + src.euphoria * 0.85);
    $('rFat').setAttribute('opacity', 0.15 + src.fatigue * 0.85);
    if (sel) {
      const P = sel.p;
      $('who').innerHTML = `${sel.style} · ${sel.state}${sel.holding ? ' · holding ' + sel.holding : ''}<br>energy ${pct(P.energy)} · bass taste ${pct(P.bass)} · build taste ${pct(P.build)} · reaction ${Math.round(P.delay * 1000)} ms · stamina ${pct(P.stamina)}<br><a href="#" id="clearSel">show whole crowd</a>`;
      const cs = $('clearSel');
      if (cs)
        cs.onclick = (e) => {
          e.preventDefault();
          marker.userData.p = null;
          marker.visible = false;
        };
    } else $('who').textContent = `${people.crowd.length} people · click anyone to see their brain`;
    const dropsHtml = people.dropLog
      .map((d) => `<li>${escapeHtml(d.track.slice(0, 22))} @${fmt(d.time)} · ${d.score === null ? '…' : d.score + '/100 ' + (d.score > 75 ? '🔥 massive' : d.score > 50 ? 'solid' : 'flat')}</li>`)
      .join('');
    if (dropsHtml !== lastDropsHtml) $('drops').innerHTML = lastDropsHtml = dropsHtml;
  }
  drawTimeline(m);
}
const pct = (v) => Math.round(v * 100) + '%';
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function drawTimeline(m) {
  const c = $('timeline');
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  if (!m.playing) {
    g.fillStyle = '#8f8aa8';
    g.font = '14px system-ui';
    g.fillText('Timeline: drop MP3s to start the set', 12, 38);
    return;
  }
  const A = m.track.analysis;
  for (const s of A.sections) {
    g.fillStyle = SECTION_COL[s.type] || '#444';
    g.globalAlpha = 0.55;
    g.fillRect((s.start / A.duration) * W, 8, ((s.end - s.start) / A.duration) * W, 22);
  }
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.font = '11px system-ui';
  for (const s of A.sections) if ((s.end - s.start) / A.duration > 0.06) g.fillText(s.type, (s.start / A.duration) * W + 4, 23);
  for (const d of A.drops) {
    g.fillStyle = '#ff3030';
    g.fillRect((d.time / A.duration) * W - 1, 4, 3, 30);
  }
  // crowd hype trace for this track
  g.strokeStyle = '#ff3a8a';
  g.lineWidth = 2;
  g.beginPath();
  let first = true;
  for (const [id, t, h] of hypeHistory) {
    if (id !== m.track.id) continue;
    const x = (t / A.duration) * W;
    const y = H - 6 - h * 30;
    if (first) g.moveTo(x, y);
    else g.lineTo(x, y);
    first = false;
  }
  g.stroke();
  g.fillStyle = '#fff';
  g.fillRect((m.t / A.duration) * W - 1, 0, 2, H);
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let quality = 'auto';
let fpsAcc = 0;
let fpsN = 0;
let lastBeat = -1;
let lastBar = -1;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  engine.update();
  dj.update();
  const m = dj.state();
  // light cues: flash on drops (set by event), strobe in the last bar of a build
  lightFX.flash = Math.max(0, lightFX.flash - dt * 1.6);
  const since = engine.now - (lightFX.dropAt ?? -99);
  lightFX.impact = m.playing && since >= 0 && since < m.barSec * 2 ? (1 - since / (m.barSec * 2)) * (0.6 + 0.4 * (lightFX.dropStrength || 1)) : 0;
  lightFX.strobe = m.playing && ((m.section === 'build' && m.toDrop < m.barSec) || (since >= 0 && since < m.barSec * 0.5)) ? 1 : 0;
  updateClub(club, t, dt, m, engine.bands, lightFX);
  updateBooth(booth, engine, dt, engine.now, camera.position);
  if (people) {
    people.update(dt, m, engine.now, camera, engine, input);
    const p = marker.userData.p;
    if (p) marker.position.set(p.pos.x, p.root.position.y + 0.03, p.pos.z);
  }
  // crowd sounds on the beat grid
  if (people && m.playing) {
    const beatSec = 60 / m.bpm;
    const nextBeatAt = engine.now + (1 - m.beatFrac) * beatSec;
    if (m.beat !== lastBeat) {
      lastBeat = m.beat;
      const nb = (m.beatInBar + 1) % 4;
      if (people.events.clapAlong && m.section === 'build' && (nb === 1 || nb === 3)) engine.clap(nextBeatAt, 14);
    }
    if (m.bar !== lastBar) {
      lastBar = m.bar;
      if ((m.section === 'breakdown' || m.section === 'intro') && Math.random() < 0.1) engine.ohYeah(engine.now + Math.random() * 1.5);
      if (people.events.chant && m.section === 'drop' && m.bar % 4 === 0) engine.chant(engine.now + (1 - m.beatFrac) * beatSec, beatSec);
    }
  }
  updateCamera(dt, t, m);
  // FPS + adaptive resolution (holds ~60 fps on integrated GPUs)
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc;
    $('fps').textContent = `${Math.round(fps)} fps · ${Math.round(dpr * 100)}% res${bloom.enabled ? '' : ' · no bloom'} · ${renderer.info.render.calls} draws${people ? ' · ' + people.people.length + ' people' : ''}`;
    if (quality === 'auto') {
      // ladder: lower resolution, then drop bloom, then lower resolution further
      if (fps < 50) {
        if (dpr > 0.75) dpr = Math.max(0.75, dpr - 0.15);
        else if (bloom.enabled) bloom.enabled = false;
        else if (dpr > 0.55) dpr = Math.max(0.55, dpr - 0.1);
      } else if (fps > 58 && bloom.enabled && dpr < Math.min(1, maxDpr)) dpr = Math.min(1, dpr + 0.05);
      if (Math.abs(renderer.getPixelRatio() - dpr) > 0.01) {
        renderer.setPixelRatio(dpr);
        resize();
      }
    }
    fpsAcc = 0;
    fpsN = 0;
  }
  renderer.info.reset();
  composer.render(dt);
  updateHUD(m, dt);

}
loop();
window.__sim = { camera, scene, controls, THREE, engine, dj, get people() { return people; }, tracks, addFiles };
