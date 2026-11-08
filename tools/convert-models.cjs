// Converts the raw Mixamo FBX downloads in source-models/ into small web assets:
//   public/models/chars/<id>.glb   (normalised bone names, 512px textures, simplified mesh)
//   public/models/anims/<id>.json  (animation clip only, in-place, normalised units)
//   public/models/manifest.json
// Run: NODE_PATH=$(npm root -g) node tools/convert-models.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const SRC = path.join(REPO, 'source-models');
const OUT = path.join(REPO, 'public', 'models');

const CHARS = [
  ['dj', 'characters/Talking.fbx'],
  ['owner', 'characters/Ch01_nonPBR.fbx'],
  ['guard', 'animations/Talking.fbx'],
  ['bartender', 'characters/character.fbx'],
  ['m42', 'characters/Ch42_nonPBR.fbx'],
  ['f02', 'characters/Ch02_nonPBR.fbx'],
  ['f22', 'characters/Ch22_nonPBR.fbx'],
  ['f37', 'characters/Ch37_nonPBR.fbx'],
  ['twerk', 'characters/Dancing_Twerk.fbx'],
];
const CLIPS = [
  ['idle', 'animations/Breathing Idle.fbx'],
  ['house', 'animations/House Dancing.fbx'],
  ['hiphop', 'animations/Hip Hop Dancing.fbx'],
  ['jump', 'animations/Jumping.fbx'],
  ['clap', 'animations/Clapping.fbx'],
  ['cheer', 'animations/Cheering.fbx'],
  ['cheer2', 'animations/Cheering (1).fbx'],
  ['drink', 'animations/Drinking.fbx'],
  ['rally', 'animations/Rallying.fbx'],
  ['sit', 'animations/Sitting Drinking.fbx'],
  ['talk', 'animations/Talking.fbx'],
  ['walk', 'animations/Walking.fbx'],
  ['twerk', 'characters/Dancing_Twerk.fbx'],
];

const html = `<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const norm = (n) => n.replace(/^mixamorig\\d*:?/, 'mixamorig');
const load = (url) => new Promise((res, rej) => new FBXLoader().load(url, res, undefined, rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function b64(buf) {
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function conv(m, o) {
  const alpha = /hair|lash|brow/i.test((m.name || '') + ' ' + o.name);
  const skin = /body/i.test(o.name);
  const nm = new THREE.MeshStandardMaterial({
    name: (m.name || o.name),
    map: m.map || null,
    normalMap: m.normalMap || null,
    color: m.map ? 0xffffff : (m.color || new THREE.Color(0x888888)),
    roughness: skin ? 0.62 : 0.86,
    metalness: 0,
    alphaTest: alpha ? 0.4 : 0,
    side: alpha ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (nm.map) nm.map.userData.mimeType = alpha ? 'image/png' : 'image/jpeg';
  if (nm.normalMap) nm.normalMap.userData.mimeType = 'image/jpeg';
  return nm;
}
window.exportChar = async (url) => {
  const obj = await load(url);
  await sleep(1800);
  obj.animations = [];
  const box = new THREE.Box3().setFromObject(obj);
  const height = box.max.y - box.min.y;
  const meshes = [];
  obj.traverse((o) => {
    if (o.isBone) o.name = norm(o.name);
    if (o.isMesh) {
      meshes.push(o.name);
      o.material = Array.isArray(o.material) ? o.material.map((m) => conv(m, o)) : conv(o.material, o);
    }
  });
  const glb = await new GLTFExporter().parseAsync(obj, { binary: true, maxTextureSize: 512, onlyVisible: false });
  return { b64: b64(glb), height, meshes };
};
window.exportClip = async (url) => {
  const obj = await load(url);
  const box = new THREE.Box3().setFromObject(obj);
  const h = box.max.y - box.min.y;
  const u = 176 / h;
  const clip = obj.animations.find((c) => c.tracks.length > 0);
  let drift = [0, 0];
  clip.tracks = clip.tracks.filter((t) => !/\\.scale$/.test(t.name));
  for (const t of clip.tracks) {
    t.name = norm(t.name);
    if (/Hips\\.position$/.test(t.name)) {
      const v = t.values, ts = t.times, n = ts.length, T = ts[n - 1] || 1;
      const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
      drift = [dx * u, dz * u];
      for (let i = 0; i < n; i++) { const f = ts[i] / T; v[i * 3] -= dx * f; v[i * 3 + 2] -= dz * f; }
    }
    if (/\\.position$/.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= u;
  }
  const json = THREE.AnimationClip.toJSON(clip);
  for (const t of json.tracks) {
    t.times = Array.from(t.times, (x) => Math.round(x * 1000) / 1000);
    t.values = Array.from(t.values, (x) => Math.round(x * 10000) / 10000);
  }
  return { json: JSON.stringify(json), duration: clip.duration, drift, srcHeight: h };
};
</script>`;

async function withPage(fn) {
  const b = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)));
  let current = null;
  await p.route('http://app.test/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/') return route.fulfill({ body: html, contentType: 'text/html' });
    if (u.pathname === '/m.fbx') return route.fulfill({ body: fs.readFileSync(current), contentType: 'application/octet-stream' });
    const fp = path.join(REPO, decodeURIComponent(u.pathname));
    if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ body: fs.readFileSync(fp), contentType: 'text/javascript' });
  });
  await p.goto('http://app.test/');
  await p.waitForFunction(() => window.exportChar && window.exportClip);
  try {
    return await fn(p, (f) => (current = f));
  } finally {
    await b.close().catch(() => {});
  }
}

(async () => {
  const { NodeIO } = await import('@gltf-transform/core');
  const { weld, simplify, prune, dedup } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const io = new NodeIO();
  fs.mkdirSync(path.join(OUT, 'chars'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'anims'), { recursive: true });
  const manifestPath = path.join(OUT, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { chars: {}, clips: {} };
  const only = process.argv[2];

  for (const [id, rel] of CLIPS) {
    if (only && only !== id && only !== 'clips') continue;
    try {
      const r = await withPage((p, set) => { set(path.join(SRC, rel)); return p.evaluate(() => exportClip('/m.fbx')); });
      fs.writeFileSync(path.join(OUT, 'anims', id + '.json'), r.json);
      const speed = Math.hypot(r.drift[0], r.drift[1]) / 100 / r.duration;
      manifest.clips[id] = { file: 'anims/' + id + '.json', duration: +r.duration.toFixed(3), speed: +speed.toFixed(3) };
      console.log('clip', id, r.duration.toFixed(1) + 's', 'speed', speed.toFixed(2), (r.json.length / 1024).toFixed(0) + 'KB');
    } catch (e) { console.log('clip FAILED', id, e.message.slice(0, 200)); }
  }
  for (const [id, rel] of CHARS) {
    if (only && only !== id && only !== 'chars') continue;
    try {
      const r = await withPage((p, set) => { set(path.join(SRC, rel)); return p.evaluate(() => exportChar('/m.fbx')); });
      const doc = await io.readBinary(new Uint8Array(Buffer.from(r.b64, 'base64')));
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.32, error: 0.006 }), prune(), dedup());
      const out = await io.writeBinary(doc);
      fs.writeFileSync(path.join(OUT, 'chars', id + '.glb'), out);
      manifest.chars[id] = { file: 'chars/' + id + '.glb', height: +r.height.toFixed(2) };
      console.log('char', id, 'h', r.height.toFixed(0), (out.length / 1048576).toFixed(2) + 'MB', r.meshes.join(','));
    } catch (e) { console.log('char FAILED', id, e.message.slice(0, 300)); }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log('DONE');
})();
