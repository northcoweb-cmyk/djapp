import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioEngine } from './audio/engine.js';
import { AutoDJ } from './audio/autodj.js';
import { Library } from './audio/library.js';
import { buildClub, updateClub } from './scene/club.js';
import { buildBooth, updateBooth, controlWorldPos } from './scene/booth.js';
import { loadAssets, PeopleSim } from './scene/people.js';
import { Director } from './camera/director.js';
import { Hud } from './ui/hud.js';

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
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 120);
camera.position.set(0, 4.7, 9.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.6, -2.5);
controls.enableDamping = true;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.52;
controls.enabled = false;

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
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*7.13) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float d = length(vUv - 0.5);
      c *= mix(0.6, 1.0, smoothstep(0.82, 0.3, d));
      c += (rnd(floor(vUv * vec2(960.0, 540.0))) - 0.5) * 0.05;
      gl_FragColor = vec4(c, 1.0); }`,
});
film.enabled = false;
composer.addPass(film);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const club = buildClub(scene);
const booth = buildBooth(scene);

// ---------------- audio, library, DJ ----------------
const engine = new AudioEngine();
const lib = new Library(engine.ctx);
const dj = new AutoDJ(engine, lib);
let people = null;
const lightFX = { flash: 0, strobe: 0, impact: 0, dropAt: -99, dropStrength: 1 };
const input = { keys: {}, active: false, camYaw: Math.PI / 2, camPitch: 0.25, drag: false };
const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xff3a8a, toneMapped: false, transparent: true, opacity: 0.9 }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);

let hud = null;
const director = new Director(camera, controls, {
  people: () => people,
  booth,
  input,
  fisheye,
  onChange: (id) => hud && hud.markCam(id),
  toast: (a, b, d) => toast(a, b, d),
});

async function addFiles(files) {
  const added = lib.add(files);
  for (const t of added) dj.enqueue(t);
  lib.saveOrder(dj.upNext);
  hud.renderQueue();
  if (added.length) hud.hint(`Added ${added.length} song${added.length === 1 ? '' : 's'} to the queue`);
}
hud = new Hud({
  engine,
  dj,
  lib,
  director,
  getPeople: () => people,
  onFiles: addFiles,
  onCine: (on) => (film.enabled = on),
  onClearSelection: () => (marker.visible = false),
});
lib.on(() => hud.renderQueue());
lib.onAnalysed = (t) => {
  if (!t.failed) dj.trackReady();
  hud.renderQueue();
};
lib.init().then(() => {
  for (const t of lib.tracks) dj.enqueue(t);
  hud.renderQueue();
});
dj.on('queue', () => hud.renderQueue());
dj.on('plan', () => hud.renderQueue());

$('file').addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});
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

const logEl = $('log');
dj.on('log', (item) => {
  const d = document.createElement('div');
  d.className = item.kind;
  d.textContent = item.text;
  logEl.prepend(d);
  while (logEl.children.length > 40) logEl.lastChild.remove();
});
dj.on('gesture', (e) => {
  if (people) people.gesture(e, controlWorldPos(booth, e.deck, e.control));
});
dj.on('drop', (ev) => {
  lightFX.flash = 1;
  lightFX.dropAt = engine.now;
  lightFX.dropStrength = ev.drop.strength;
  hud.brain.burst();
  director.onDrop();
  if (ev.drop.strength > 0.62 && !ev.drop.kickIn) club.rooms.co2.fire(0.85 + ev.drop.strength * 0.3);
  if (!people) return;
  people.onDrop(ev, engine.now, (4 * 60) / (dj.masterBpm || 124));
  const eu = people.avg('anticipation') + ev.drop.strength * 0.6;
  engine.cheer(Math.min(1, 0.35 + eu * 0.6));
});
dj.on('track', (cur) => {
  hud.renderQueue();
  if (!people || !cur) return;
  // per-track crowd traits: clap-along (~1 in 4), sing-along chant (~1 in 5)
  people.events.clapAlong = Math.random() < 0.25;
  people.events.chant = Math.random() < 0.2;
  if (people.events.clapAlong) dj.say('Crowd: this one gets a clap-along on the builds', 'track');
  if (people.events.chant) dj.say('Crowd: they sing along to this one ("oh-oh")', 'track');
});

// ---------------- entering the club ----------------
let assetsReady = false;
let quality = 'auto';
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
  quality = $('quality').value;
  if (quality === 'low') dpr = 0.7;
  if (quality === 'high') dpr = maxDpr;
  bloom.enabled = quality !== 'low';
  renderer.setPixelRatio(dpr);
  resize();
  if (assetsReady && !people) {
    people = new PeopleSim(scene, window.__assets, booth);
    people.populate(parseInt($('crowdSize').value, 10));
    people.onToast = toast;
    people.onStallDoor = (s, open) => {
      const d = club.rooms.stallDoors.get(s.z.toFixed(2));
      if (d) d.userData.target = open ? 1.4 : 0;
    };
  }
  // compile every shader up front so camera cuts never stutter on first use
  $('enter').textContent = 'Warming up…';
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) {}
  $('start').style.display = 'none';
  $('hud').hidden = false;
  engine.murmur(1);
  director.setShot('wide');
  hud.renderQueue();
  hud.hint(dj.canStart() ? 'Press Start set (or Space) when you are ready' : 'Add songs with + Add songs');
});

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

// ---------------- input ----------------
window.addEventListener('keydown', (e) => (input.keys[e.code] = true));
window.addEventListener('keyup', (e) => (input.keys[e.code] = false));
window.addEventListener('blur', () => (input.keys = {}));
let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  input.drag = true;
  downAt = [e.clientX, e.clientY];
});
window.addEventListener('pointerup', (e) => {
  input.drag = false;
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5 && people) {
    const p = people.pick(e.clientX, e.clientY, camera, window.innerWidth, window.innerHeight);
    marker.visible = !!p;
  }
  downAt = null;
});
window.addEventListener('pointermove', (e) => {
  if (director.mode === 'play' && input.drag) {
    input.camYaw -= e.movementX * 0.006;
    input.camPitch = Math.max(-0.2, Math.min(0.9, input.camPitch + e.movementY * 0.004));
  }
});

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let fpsAcc = 0;
let fpsN = 0;
let lastBeat = -1;
let lastBar = -1;
let tcAcc = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  engine.update();
  dj.update();
  const m = dj.state();
  // light cues: flash + 2-bar impact on drops, strobe in the last bar of a build
  lightFX.flash = Math.max(0, lightFX.flash - dt * 1.6);
  const since = engine.now - lightFX.dropAt;
  lightFX.impact = m.playing && since >= 0 && since < m.barSec * 2 ? (1 - since / (m.barSec * 2)) * (0.6 + 0.4 * (lightFX.dropStrength || 1)) : 0;
  lightFX.strobe = m.playing && ((m.section === 'build' && m.toDrop < m.barSec) || (since >= 0 && since < m.barSec * 0.5)) ? 1 : 0;
  updateClub(club, t, dt, m, engine.bands, lightFX);
  updateBooth(booth, engine, dt, engine.now, camera.position);
  if (people) {
    const ps = dj.plan && !dj.plan.scheduled ? dj.planSummary() : null;
    people.cueUntil = ps && ps.startsIn < 20 ? engine.now + ps.startsIn : 0;
    people.update(dt, m, engine.now, camera, engine, input);
    const p = people.selected;
    if (p && marker.visible) marker.position.set(p.pos.x, p.root.position.y + 0.03, p.pos.z);
    // crowd sounds on the beat grid
    engine.murmur(m.playing ? 0.25 : 1);
    if (m.playing) {
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
  }
  director.update(dt, t, m);
  // adaptive quality ladder (before rendering, so a resize never shows a blank frame)
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc;
    $('fps').textContent = `${Math.round(fps)} fps · ${Math.round(dpr * 100)}% res${bloom.enabled ? '' : ' · no bloom'} · ${renderer.info.render.calls} draws`;
    if (quality === 'auto') {
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
  film.uniforms.time.value = t;
  renderer.info.reset();
  composer.render(dt);
  hud.update(dt, m, people);
  tcAcc += dt;
  if (film.enabled && tcAcc > 0.04) {
    tcAcc = 0;
    const s = m.setTime || t;
    const f = Math.floor((s % 1) * 25);
    $('tc').textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s) % 60, f].map((x) => String(x).padStart(2, '0')).join(':');
  }
}
loop();
window.__sim = {
  camera,
  scene,
  controls,
  THREE,
  engine,
  dj,
  lib,
  director,
  hud,
  get people() {
    return people;
  },
  setCam: (id) => director.setShot(id),
};
