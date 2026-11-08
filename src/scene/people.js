// People: crowd (personality + "brain"), staff (bartenders, security), the DJ (hands on the
// gear via IK, steps along the booth, hand-ups and jumps), dancers behind the decks and the
// playable club owner. Characters are atlased (1 draw call each) with per-person outfit tints.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { collides, zoneAt, floorY, PRIVATE, POI, DANCE, findPath, levelAfterMove, FEATURES, STAGE } from './nav.js';
import { prepCharacter, atlasCharacter, makeTintMaterial, bakeColored } from './merge.js';

const _frustum = new THREE.Frustum();
const _proj = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const FEMALE = ['f02', 'f22', 'f37', 'twerk'];
const MALE = ['m42', 'owner', 'dj', 'bartender'];
const NAMES_F = ['Mia', 'Ava', 'Zoe', 'Lena', 'Nina', 'Chloe', 'Sofia', 'Maya', 'Ella', 'Aria', 'Jade', 'Luna', 'Ivy', 'Sara', 'Noa', 'Tess', 'Kira', 'Dana'];
const NAMES_M = ['Leo', 'Max', 'Kai', 'Noah', 'Eli', 'Omar', 'Luca', 'Jay', 'Ben', 'Sam', 'Theo', 'Ivan', 'Marco', 'Dev', 'Alex', 'Nico', 'Ravi', 'Jon'];
// dance styles: clips for grooving, how they react to drops, how much they move
export const STYLES = {
  raver: { dance: ['rally', 'house'], drop: ['cheer2', 'rally'], energy: [0.75, 1], bob: 0.2, hop: 0.75 },
  jumper: { dance: ['house', 'hiphop'], drop: ['cheer2', 'cheer'], energy: [0.6, 0.95], bob: 0.16, hop: 0.9 },
  twostep: { dance: ['house', 'hiphop'], drop: ['house', 'cheer'], energy: [0.45, 0.8], bob: 0.14, hop: 0.25 },
  bobber: { dance: ['idle'], drop: ['cheer2', 'idle'], energy: [0.3, 0.6], bob: 0.3, hop: 0.15 },
  swayer: { dance: ['idle', 'house'], drop: ['cheer', 'idle'], energy: [0.2, 0.5], bob: 0.1, hop: 0.05 },
  filmer: { dance: ['idle', 'house'], drop: ['idle'], energy: [0.35, 0.7], bob: 0.14, hop: 0.1 },
  twerker: { dance: ['twerk', 'house'], drop: ['cheer2', 'twerk'], energy: [0.6, 0.9], bob: 0.08, hop: 0.4 },
};
const DANCE_CLIPS = new Set(['house', 'hiphop', 'twerk', 'rally', 'clap', 'cheer', 'cheer2', 'jump']);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const wrapPi = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

const TOPS = [0x101010, 0x0b0b0b, 0xf0f0f0, 0x5a0f1a, 0x13204a, 0x2f3524, 0x5a5a62, 0x2a0f3a, 0xb81f4a, 0x1c1c1c, 0x7a5a3a, 0xd8d0c0];
const BOTTOMS = [0x0c0c0c, 0x141a2a, 0x2a2a2e, 0x1a1410, 0x3a3a3a, 0x1c2433];
const HAIR = [0x3a2616, 0x120c08, 0x6a4a2a, 0xa88a5a, 0x241810, 0x55361f];
const SHOES = [0x111111, 0xeeeeee, 0x222222, 0x8a6a4a];

// ---------------- assets ----------------
function clipBeat(clip) {
  const t = clip.tracks.find((tr) => /Hips\.position$/.test(tr.name));
  if (!t || clip.duration < 1) return 0;
  const fps = 60;
  const n = Math.floor(clip.duration * fps);
  const y = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / fps;
    while (k < t.times.length - 2 && t.times[k + 1] < tt) k++;
    const t0 = t.times[k];
    const t1 = t.times[k + 1] ?? t0;
    const f = t1 > t0 ? Math.min(1, (tt - t0) / (t1 - t0)) : 0;
    y[i] = t.values[k * 3 + 1] * (1 - f) + (t.values[(k + 1) * 3 + 1] ?? t.values[k * 3 + 1]) * f;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i];
  mean /= n;
  for (let i = 0; i < n; i++) y[i] -= mean;
  let best = 0;
  let bl = 0;
  for (let lag = Math.floor(0.33 * fps); lag <= Math.floor(0.8 * fps) && lag < n - 10; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += y[i] * y[i + lag];
    s /= n - lag;
    if (s > best) {
      best = s;
      bl = lag;
    }
  }
  return bl ? bl / fps : 0;
}

export async function loadAssets(base, onProgress = () => {}) {
  const man = await (await fetch(base + 'models/manifest.json')).json();
  const loader = new GLTFLoader();
  const total = Object.keys(man.chars).length + Object.keys(man.clips).length + 1;
  let done = 0;
  const tick = () => onProgress(++done / total);
  const chars = {};
  const clips = {};
  // characters one at a time keeps peak memory low while atlases are built
  for (const [id, c] of Object.entries(man.chars)) {
    const gltf = await loader.loadAsync(base + 'models/' + c.file);
    prepCharacter(gltf.scene);
    atlasCharacter(gltf.scene, id);
    chars[id] = { scene: gltf.scene, height: c.height, unit: c.height / 176 };
    if (c.lo) {
      const lo = await loader.loadAsync(base + 'models/' + c.lo);
      prepCharacter(lo.scene);
      atlasCharacter(lo.scene, id);
      chars[id].lo = lo.scene;
    }
    tick();
  }
  await Promise.all(
    Object.entries(man.clips).map(async ([id, c]) => {
      const j = await (await fetch(base + 'models/' + c.file)).json();
      const clip = THREE.AnimationClip.parse(j);
      clip.name = id;
      clip.userData = { speed: c.speed || 0, beat: DANCE_CLIPS.has(id) ? clipBeat(clip) : 0 };
      clips[id] = clip;
      tick();
    })
  );
  let phone = null;
  try {
    phone = (await loader.loadAsync(base + 'models/phone/scene.gltf')).scene;
  } catch (e) {
    console.warn('phone model failed', e);
  }
  tick();
  return { chars, clips, phone };
}

// ---------------- props ----------------
function makeProps(phoneScene) {
  const P = {};
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const C = (h) => new THREE.Color(h);
  const beer = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 15, 10), new THREE.MeshBasicMaterial({ color: 0x3a2008 }));
  const bn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.0, 8, 10), bb.material);
  bn.position.y = 11;
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 6, 10), new THREE.MeshBasicMaterial({ color: 0xd8c070 }));
  beer.add(bb, bn, lab);
  P.beer = bakeColored(beer, lam);
  const cup = new THREE.Group();
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 3.4, 11, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8d0dc }));
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 3.4, 7, 12), new THREE.MeshBasicMaterial({ color: 0xd89a20 }));
  liq.position.y = -2;
  cup.add(c1, liq);
  P.cup = bakeColored(cup, lam);
  const ck = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8d0dc }));
  bowl.rotation.x = Math.PI;
  bowl.position.y = 7;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 7, 6), bowl.material);
  const fill = new THREE.Mesh(new THREE.ConeGeometry(4.2, 4.6, 12), new THREE.MeshBasicMaterial({ color: 0xc0105a }));
  fill.rotation.x = Math.PI;
  fill.position.y = 7.6;
  ck.add(bowl, stem, fill);
  P.cocktail = bakeColored(ck, lam);
  // phone (the user's model): measured in world space, stood upright, 15 cm long, baked to one mesh
  let phoneGroup;
  if (phoneScene) {
    const inner = phoneScene.clone(true);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    inner.position.sub(box.getCenter(new THREE.Vector3()));
    const a = new THREE.Group();
    a.add(inner);
    const dims = [size.x, size.y, size.z];
    const long = dims.indexOf(Math.max(...dims));
    if (long === 0) a.rotation.z = Math.PI / 2;
    if (long === 2) a.rotation.x = Math.PI / 2;
    const b = new THREE.Group();
    b.add(a);
    b.updateMatrixWorld(true);
    const s2 = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
    if (s2.x < s2.z) b.rotation.y = Math.PI / 2;
    phoneGroup = new THREE.Group();
    phoneGroup.add(b);
    phoneGroup.scale.setScalar(15 / Math.max(...dims));
  } else {
    phoneGroup = new THREE.Group();
    phoneGroup.add(new THREE.Mesh(new THREE.BoxGeometry(7, 15, 0.8), new THREE.MeshBasicMaterial({ color: 0x111111 })));
  }
  const phoneMat = (k) => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(k, k, k) });
  P.phoneMats = [phoneMat(0.55), phoneMat(1.0), phoneMat(1.8)];
  P.phone = bakeColored(phoneGroup, P.phoneMats[1], (m) => {
    const n = ((m.material && m.material.name) || '').toLowerCase();
    if (/screen/.test(n)) return C(0x9ab4ff);
    if (/lens/.test(n)) return C(0x050505);
    if (/chrome/.test(n)) return C(0x5a5a60);
    if (/glass/.test(n)) return C(0x0e0e12);
    return C(0x0b0b0d);
  });
  P.flashMat = new THREE.SpriteMaterial({ color: 0xfff4e6, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  return P;
}

// ---------------- Person ----------------
let uid = 0;
export class Person {
  constructor(sim, type, o = {}) {
    this.id = uid++;
    this.sim = sim;
    this.type = type;
    this.female = FEMALE.includes(type);
    this.name = o.name || pick(this.female ? NAMES_F : NAMES_M);
    const tpl = sim.assets.chars[type];
    this.unit = tpl.unit;
    this.obj = SkeletonUtils.clone(o.lo && tpl.lo ? tpl.lo : tpl.scene);
    this.root = new THREE.Group();
    this.root.add(this.obj);
    this.height = o.height || (this.female ? rand(1.62, 1.76) : rand(1.72, 1.88));
    this.obj.scale.setScalar(this.height / tpl.height);
    this.bones = {};
    let sk = null;
    this.mesh = null;
    this.obj.traverse((b) => {
      if (b.isBone) this.bones[b.name.replace('mixamorig', '')] = b;
      if (b.isSkinnedMesh) {
        if (!this.mesh) this.mesh = b;
        if (!sk) sk = b.skeleton;
        else if (b.skeleton.bones.length === sk.bones.length) b.bind(sk, b.bindMatrix);
      }
    });
    if (sk) {
      const orig = sk.update.bind(sk);
      sk.update = () => {
        if (this.dirty !== false) {
          orig();
          this.dirty = false;
        }
      };
    }
    if (this.mesh) {
      this.regions = this.mesh.userData.regions || [];
      this.mesh.material = makeTintMaterial(this.mesh.material);
      this.dress(o.outfit || {});
    }
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.actions = {};
    this.cur = null;
    this.curName = '';
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.level = o.level || 0;
    this.yaw = o.yaw ?? Math.PI;
    this.yOff = 0;
    this.role = o.role || 'crowd';
    this.style = o.style || 'twostep';
    const st = STYLES[this.style] || STYLES.twostep;
    this.p = {
      energy: rand(st.energy[0], st.energy[1]),
      bass: rand(0.3, 1),
      vocal: rand(0.2, 1),
      build: rand(0.3, 1),
      delay: rand(0.04, 0.4),
      stamina: rand(0.3, 1),
      social: rand(0, 1),
      tempo: rand(0.97, 1.03),
      phase: rand(0, Math.PI * 2),
      amp: rand(0.7, 1.3),
      sway: rand(0.02, 0.09),
    };
    this.b = { groove: 0.3, anticipation: 0, euphoria: 0, chills: 0, fatigue: rand(0, 0.15), hype: 0.2, thirst: rand(0, 0.7), bladder: rand(0, 0.6) };
    this.state = 'dance';
    this.react = 0;
    this.home = this.pos.clone();
    this.yieldV = new THREE.Vector2();
    this.path = [];
    this.hand = null;
    this.acc = 0;
    sim.scene.add(this.root);
    this.place();
  }
  dress(o) {
    const u = this.mesh.material.userData;
    const solidTop = o.solidTop ?? Math.random() < 0.6;
    const top = o.top ?? pick(TOPS);
    const bottom = o.bottom ?? pick(BOTTOMS);
    const hair = o.hair ?? pick(HAIR);
    const shoes = o.shoes ?? pick(SHOES);
    for (const r of this.regions) {
      let c = null;
      let mix = 0;
      if (r.kind === 'top') {
        c = top;
        mix = solidTop ? 0.85 : 0;
        if (!solidTop) c = new THREE.Color(top).lerp(new THREE.Color(0xffffff), 0.55).getHex();
      } else if (r.kind === 'bottom') {
        c = bottom;
        mix = 0.8;
      } else if (r.kind === 'hair') {
        c = new THREE.Color(hair).lerp(new THREE.Color(0xffffff), 0.45).getHex();
        mix = 0;
      } else if (r.kind === 'shoes') {
        c = shoes;
        mix = 0.6;
      } else if (r.kind === 'socks') {
        c = o.socks ?? bottom;
        mix = 0.85;
      } else if (r.kind === 'tie' || r.kind === 'belt') {
        c = o.tie ?? 0x0b0b0b;
        mix = 0.85;
      }
      if (o.byName)
        for (const [re, col, m] of o.byName)
          if (re.test(r.name)) {
            c = col;
            mix = m ?? 0.85;
          }
      if (c !== null) {
        u.tints.value[r.index].set(c);
        u.tintMix.value[r.index] = mix;
      }
    }
  }
  attach(boneName, obj, pos, rot) {
    const b = this.bones[boneName];
    if (!b) return null;
    b.add(obj);
    if (pos) obj.position.set(...pos);
    if (rot) obj.rotation.set(...rot);
    return obj;
  }
  hold(kind) {
    if (this.hand) this.hand.removeFromParent();
    this.hand = null;
    this.holding = kind;
    if (!kind) return;
    const P = this.sim.props;
    let obj;
    if (kind === 'phone') {
      obj = new THREE.Group();
      const ph = new THREE.Mesh(P.phone.geometry, P.phoneMats[this.phoneBright ?? 1]);
      obj.add(ph);
      if (this.phoneFlash) {
        const fl = new THREE.Sprite(P.flashMat);
        fl.scale.setScalar(12);
        fl.position.set(0, 5, -1.5);
        obj.add(fl);
        obj.userData.flash = fl;
      }
    } else obj = new THREE.Mesh(P[kind].geometry, P[kind].material);
    const u = this.unit || 1;
    obj.scale.multiplyScalar(u);
    this.hand = this.attach('RightHand', obj, kind === 'phone' ? [0, 9 * u, 3 * u] : [0, 8 * u, 4 * u]);
  }
  play(name, fade = 0.4, ts = 1) {
    if (!this.sim.assets.clips[name]) name = 'idle';
    const clip = this.sim.clipFor(this.type, name);
    let a = this.actions[name];
    if (!a) a = this.actions[name] = this.mixer.clipAction(clip);
    a.timeScale = ts;
    if (this.cur === a) return;
    a.enabled = true;
    a.reset();
    a.time = Math.random() * clip.duration * 0.5;
    a.setEffectiveWeight(1);
    a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a;
    this.curName = name;
  }
  walkClip() {
    return this.female ? 'walk' : 'walkm';
  }
  walkTS(speed) {
    const c = this.sim.assets.clips[this.walkClip()] || this.sim.assets.clips.walk;
    const cs = (c && c.userData.speed) || 1.03;
    return Math.max(0.5, Math.min(2.2, speed / (cs * (this.height / 1.76))));
  }
  place() {
    this.root.position.set(this.pos.x, floorY(this.pos.x, this.pos.z, this.level) + this.yOff, this.pos.z);
    this.root.rotation.y = this.yaw;
  }
  head(out) {
    const h = this.bones.Head;
    if (h) return h.getWorldPosition(out);
    return out.copy(this.root.position).setY(this.root.position.y + this.height);
  }
  goTo(x, z, level, speed, then) {
    this.path = findPath(this.pos.x, this.pos.z, this.level, x, z, level ?? this.level);
    this.walkSpeed = speed || rand(0.95, 1.2);
    this.state = 'walk';
    this.then = then;
    this.play(this.walkClip(), 0.35, this.walkTS(this.walkSpeed));
  }
}

// ---------------- the simulation ----------------
export class PeopleSim {
  constructor(scene, assets, booth) {
    this.scene = scene;
    this.assets = assets;
    this.booth = booth;
    this.props = makeProps(assets.phone);
    this.people = [];
    this.crowd = [];
    this.staff = [];
    this.guards = [];
    this.clipCache = {};
    this.barQueue = [];
    this.dropLog = [];
    this.selected = null;
    this.events = { clapAlong: false, chant: false };
    this.grid = new Map();
    this.frame = 0;
    this.cleared = {};
    this.onStallDoor = null;
  }
  clipFor(type, name) {
    const unit = this.assets.chars[type].unit;
    if (Math.abs(unit - 1) < 0.03) return this.assets.clips[name];
    const key = type + ':' + name;
    if (!this.clipCache[key]) {
      const c = this.assets.clips[name].clone();
      c.userData = { ...this.assets.clips[name].userData };
      for (const t of c.tracks) if (/\.position$/.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= unit;
      this.clipCache[key] = c;
    }
    return this.clipCache[key];
  }
  add(type, o) {
    const p = new Person(this, type, o);
    this.people.push(p);
    return p;
  }
  danceTS(p, name, bpm) {
    const clip = this.assets.clips[name];
    const beat = clip && clip.userData.beat;
    const songBeat = 60 / (bpm || 124);
    if (!beat) return p.p.tempo * ((bpm || 124) / 124);
    let ts = beat / songBeat;
    while (ts > 1.6) ts /= 2;
    while (ts < 0.62) ts *= 2;
    return ts * p.p.tempo;
  }
  populate(count = 120) {
    // dance floor slots: roomy enough that nobody overlaps, denser toward the stage
    const slots = [];
    for (let z = DANCE.z0 + 0.1; z < DANCE.z1; ) {
      const sp = z < -3 ? 0.78 : z < 1.5 ? 0.88 : 1.02;
      for (let x = DANCE.x0 + 0.2; x <= DANCE.x1 - 0.2; x += sp) slots.push([x + rand(-0.12, 0.12), z + rand(-0.1, 0.1)]);
      z += sp;
    }
    const w = (z) => (z < -3 ? 1.0 : z < 1.5 ? 0.75 : 0.5);
    slots.forEach((sl) => (sl.k = -Math.log(Math.random()) / w(sl[1])));
    slots.sort((a, b) => a.k - b.k);
    const nSeated = Math.min(POI.lounge.length + POI.balconySeats.length, Math.round(count * 0.12));
    const nRail = Math.min(POI.balconyRail.length, Math.round(count * 0.05));
    const nFloor = Math.min(count - nSeated - nRail, slots.length);
    for (let i = 0; i < nFloor; i++) {
      const [x, z] = slots[i];
      const front = z < -3;
      const back = z > 1.8;
      const r = Math.random();
      let style;
      if (front) style = r < 0.45 ? 'raver' : r < 0.8 ? 'jumper' : 'filmer';
      else if (back) style = r < 0.35 ? 'bobber' : r < 0.6 ? 'swayer' : r < 0.75 ? 'filmer' : r < 0.88 ? 'jumper' : 'twostep';
      else style = r < 0.4 ? 'jumper' : r < 0.7 ? 'twostep' : r < 0.85 ? 'filmer' : 'bobber';
      const female = Math.random() < 0.48;
      const type = female ? pick(FEMALE) : pick(MALE);
      if (type === 'twerk' && (style === 'jumper' || style === 'twostep') && Math.random() < 0.4) style = 'twerker';
      const height = front ? (female ? rand(1.7, 1.8) : rand(1.82, 1.94)) : female ? rand(1.6, 1.74) : rand(1.7, 1.86);
      const p = this.add(type, { x, z, yaw: Math.PI + rand(-0.3, 0.3), style, height, lo: true });
      p.home.set(x, 0, z);
      if (style === 'filmer') {
        p.phoneBright = Math.floor(rand(0, 3));
        p.phoneFlash = Math.random() < 0.35;
      }
      if (Math.random() < 0.3) p.hold(pick(['beer', 'cup', 'cup', 'cocktail']));
      p.play(pick(STYLES[style].dance), 0, p.p.tempo);
      this.crowd.push(p);
    }
    // seated guests (lounge + balcony) and people watching from the balcony railing
    const seats = [...POI.lounge, ...POI.balconySeats].sort(() => Math.random() - 0.5);
    for (let i = 0; i < nSeated; i++) this.seat(this.newGuest(seats[i]), seats[i], true);
    const rails = [...POI.balconyRail].sort(() => Math.random() - 0.5);
    for (let i = 0; i < nRail; i++) {
      const s = rails[i];
      const p = this.newGuest(s);
      p.state = 'rail';
      p.spot = s;
      s.taken = p;
      p.play(pick(['idle', 'house']), 0, 0.9);
    }
    // pairs that chat in quiet sections
    for (let i = 0; i + 1 < this.crowd.length; i += 7) {
      const a = this.crowd[i];
      const b = this.crowd.find((c) => c !== a && !c.partner && c.state === 'dance' && Math.hypot(c.home.x - a.home.x, c.home.z - a.home.z) < 1.2);
      if (b && !a.partner) {
        a.partner = b;
        b.partner = a;
      }
    }
    this.spawnStaff();
  }
  newGuest(spot) {
    const female = Math.random() < 0.55;
    const p = this.add(female ? pick(FEMALE) : pick(MALE), { x: spot.x, z: spot.z, level: spot.level || 0, yaw: spot.yaw, style: pick(['swayer', 'bobber', 'twostep']), lo: true });
    p.home.set(rand(DANCE.x0 + 1, DANCE.x1 - 1), 0, rand(-1, 4.5));
    p.hold(pick(['cocktail', 'beer', 'cup']));
    this.crowd.push(p);
    return p;
  }
  seat(p, s, instant) {
    p.state = 'sit';
    p.seatSpot = s;
    s.taken = p;
    p.level = s.level || 0;
    p.pos.set(s.x, 0, s.z);
    p.yaw = s.yaw;
    p.sitUntil = (this.now || 0) + rand(40, 120);
    p.play('sit', instant ? 0 : 0.5);
  }
  spawnStaff() {
    const bartenders = [-4, 0, 4].map((x) =>
      this.add('bartender', { x, z: 9.15, yaw: Math.PI, role: 'staff', outfit: { top: 0x0b0b0b, bottom: 0x0b0b0b, solidTop: true }, height: rand(1.72, 1.86) })
    );
    bartenders.forEach((b) => {
      b.state = 'bartend';
      b.play('idle', 0);
      b.station = b.pos.x;
      this.staff.push(b);
    });
    const guardSpots = [
      { x: -8.7, z: -5.2, yaw: Math.PI * 0.85, post: 'stage' },
      { x: 8.7, z: -5.2, yaw: -Math.PI * 0.85, post: 'stage' },
      { x: 10.1, z: 2.0, yaw: -Math.PI / 2, post: 'lounge' },
      { x: -13.6, z: 6.4, yaw: Math.PI / 2, post: 'entrance' },
      { x: 7.7, z: 8.9, yaw: Math.PI, post: 'barstaff' },
    ];
    for (const g of guardSpots) {
      const p = this.add('guard', {
        x: g.x,
        z: g.z,
        yaw: g.yaw,
        role: 'guard',
        outfit: { top: pick([0x0a0a0c, 0x10131c]), bottom: 0x0a0a0c, solidTop: true, byName: [[/shirt/i, 0xf2f2f2, 0.85]] },
        height: rand(1.84, 1.96),
      });
      p.post = g.post;
      p.homeYaw = g.yaw;
      p.state = 'guard';
      p.play('idle', 0, 0.8);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      p.attach('Head', ear, [7.5, 6, 1]);
      this.guards.push(p);
    }
    [
      ['twerk', -4.6, 'twerk'],
      ['f22', 4.4, 'house'],
      ['f37', 5.4, 'hiphop'],
    ].forEach(([t, x, clip]) => {
      const p = this.add(t, { x, z: -9.2, yaw: rand(-0.3, 0.3), role: 'dancer', outfit: { top: pick([0x0a0a0a, 0xb81f4a, 0xe8e8e8, 0x2a0f3a]), bottom: 0x0a0a0a, solidTop: true }, height: rand(1.66, 1.76) });
      p.state = 'stage';
      p.play(clip, 0);
      p.danceClip = clip;
      if (Math.random() < 0.5) p.hold('cocktail');
    });
    // the DJ (Ch38): white shirt, black bottoms, black cap, sunglasses, silver watch, headphones
    const dj = this.add('dj', { x: 0, z: -8.72, yaw: 0, role: 'dj', outfit: { top: 0xffffff, bottom: 0x0b0b0b, socks: 0x0b0b0b, shoes: 0x111111, hair: 0x15100c, solidTop: false }, height: 1.83 });
    dj.state = 'dj';
    dj.play('idle', 0, 0.9);
    const black = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    const cap = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), black);
    dome.scale.set(1, 0.85, 1.1);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.8, 18, 1, false, -Math.PI / 2, Math.PI), black);
    brim.scale.set(1, 1, 0.95);
    brim.position.set(0, 0.4, 3.5);
    cap.add(dome, brim);
    dj.attach('Head', cap, [0, 16.5, 1.2], [-0.15, 0, 0]);
    const shades = new THREE.Group();
    const lensM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.9 });
    for (const sx of [-3.3, 3.3]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.0, 0.5), lensM);
      l.position.x = sx;
      shades.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.5, 0.5), lensM);
    bridge.position.y = 1.2;
    shades.add(bridge);
    dj.attach('Head', shades, [0, 9.5, 9.8]);
    const watch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.9, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.15, metalness: 1 }));
    dj.attach('LeftForeArm', watch, [0, 24, 0], [Math.PI / 2, 0, 0]);
    const phones = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(9, 0.9, 6, 20, Math.PI), black);
    band.rotation.z = Math.PI;
    band.position.y = 2;
    const cupL = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 2.4, 14), black);
    cupL.rotation.z = Math.PI / 2;
    cupL.position.set(-9, 0, 0);
    const cupR = cupL.clone();
    cupR.position.x = 9;
    phones.add(band, cupL, cupR);
    dj.attach('Neck', phones, [0, 4, 2], [Math.PI * 0.55, 0, 0]);
    this.dj = dj;
    dj.x0 = 0;
    this.djHands = { left: { w: 0, target: new THREE.Vector3(), until: 0, start: 0 }, right: { w: 0, target: new THREE.Vector3(), until: 0, start: 0 } };
    this.djMode = { handUpUntil: 0, nextHandUp: 0, jumpUntil: 0, jumpStart: 0, targetX: 0 };
    // the owner (player) starts by the entrance
    const owner = this.add('owner', { x: -12.6, z: 6.6, yaw: Math.PI / 2, role: 'player', outfit: { top: 0x0b0b0b, bottom: 0x111318, solidTop: true, shoes: 0x0b0b0b }, height: 1.84 });
    owner.state = 'player';
    owner.play('idle', 0);
    this.player = owner;
  }

  // ---------------- events ----------------
  gesture(e, controlPos) {
    const left = e.deck === 0 || e.deck === 1;
    const h = e.control === 'rmx' || e.deck < 0 ? this.djHands.right : left ? this.djHands.left : this.djHands.right;
    h.target.copy(controlPos);
    h.target.y += 0.03;
    h.start = e.when;
    h.until = e.when + Math.max(0.7, e.dur);
    this.djMode.targetX = Math.max(-0.5, Math.min(0.5, controlPos.x * 0.6));
  }
  onDrop(ev, ctxNow, barSec) {
    const strength = ev.drop.strength;
    for (const p of this.crowd) p.pendingDrop = { at: ctxNow + p.p.delay, strength, kickIn: !!ev.drop.kickIn };
    const before = this.avg('hype');
    this.dropLog.unshift({ track: ev.track.name, time: ev.drop.time, strength, before, score: null, at: ctxNow });
    this.dropLog.length = Math.min(12, this.dropLog.length);
    if (strength > 0.55 && !ev.drop.kickIn) {
      this.djMode.jumpStart = ctxNow + 0.12;
      this.djMode.jumpUntil = ctxNow + 0.12 + barSec * 2;
    }
  }
  avg(k) {
    let s = 0;
    let n = 0;
    for (const p of this.crowd) {
      s += p.b[k];
      n++;
    }
    return n ? s / n : 0;
  }

  // ---------------- per-frame ----------------
  update(dt, m, now, camera, engine, input) {
    const camPos = camera.position;
    this.now = now;
    this.frame++;
    _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_proj);
    const sec = m.playing ? m.section : 'idle';
    const beatPos = m.playing ? m.beat + m.beatFrac : now * 2;
    for (const d of this.dropLog)
      if (d.score === null && now - d.at > 3) {
        const after = this.avg('hype');
        const eu = this.avg('euphoria');
        d.score = Math.round(clamp01(eu * 0.8 + (after - d.before) * 0.8 + d.strength * 0.25) * 100);
      }
    // spatial hash
    const G = this.grid;
    G.clear();
    for (const p of this.people) {
      if (p.state === 'sit' || p.hidden) continue;
      const k = Math.floor(p.pos.x) * 1000 + Math.floor(p.pos.z) + p.level * 1e7;
      let c = G.get(k);
      if (!c) G.set(k, (c = []));
      c.push(p);
    }
    for (const p of this.people) {
      const dist = camPos.distanceTo(p.root.position);
      _sphere.center.copy(p.root.position);
      _sphere.center.y += 1;
      _sphere.radius = 1.3;
      const vis = !p.hidden && _frustum.intersectsSphere(_sphere);
      const rate = p.role === 'dj' || p.role === 'player' || p.forceAnim ? 1 : !vis ? 8 : dist < 8 ? 1 : dist < 15 ? 2 : 3;
      p.acc += dt;
      p.vis = vis;
      if (p.role === 'crowd') this.updateCrowd(p, dt, m, sec, now);
      else if (p.role === 'staff') this.updateBartender(p, dt);
      else if (p.role === 'guard') this.updateGuard(p, dt);
      else if (p.role === 'dancer') this.updateDancer(p, m);
      else if (p.role === 'player') this.updatePlayer(p, dt, input);
      else if (p.role === 'dj') this.updateDJBody(p, dt, m, now);
      const doAnim = (this.frame + p.id) % rate === 0;
      p.root.matrixWorldAutoUpdate = doAnim;
      if (!doAnim) continue;
      p.place();
      p.dirty = true;
      p.mixer.update(p.acc);
      p.acc = 0;
      this.procedural(p, m, sec, beatPos, now);
      if (p.role === 'dj') this.updateDJHands(p, dt, m, now);
      if (p.hand) {
        p.hand.visible = dist < 22;
        if (p.hand.userData.flash) p.hand.userData.flash.visible = p.filming && m.playing && (sec === 'drop' || sec === 'build');
      }
    }
    this.separate(dt);
  }

  // beat-locked body motion layered on top of the clip
  procedural(p, m, sec, beatPos, now) {
    if (!m.playing || p.role === 'player' || p.state === 'walk' || p.state === 'sit' || p.hidden) return;
    const st = STYLES[p.style] || STYLES.twostep;
    const frac = beatPos - Math.floor(beatPos);
    const u = p.unit || 1;
    const b = p.b;
    let secK = sec === 'drop' ? 1 : sec === 'groove' ? 0.8 : sec === 'build' ? Math.max(0.25, 1 - b.anticipation * 0.7) : sec === 'breakdown' ? 0.3 : 0.5;
    if (p.role === 'dj') secK *= 0.55;
    if (p.role === 'guard' || p.role === 'staff') secK *= 0.12;
    const A = (1.2 + 3.2 * b.groove + 2.2 * b.hype) * p.p.amp * secK * (p.state === 'rail' ? 0.6 : 1);
    const hips = p.bones.Hips;
    if (hips) {
      hips.position.y -= A * u * (0.5 + 0.5 * Math.cos(2 * Math.PI * (frac - 0.1)));
      // crouch on the last beat before a drop, ready to jump
      if (sec === 'build' && m.toDrop < m.barSec / 4 && st.hop > 0.3) hips.position.y -= 7 * u * b.anticipation;
    }
    const spine = p.bones.Spine1 || p.bones.Spine;
    if (spine) spine.rotation.z += Math.sin(Math.PI * beatPos * 0.5 + p.p.phase) * p.p.sway * (0.5 + b.groove) * secK;
    const neck = p.bones.Neck;
    if (neck) neck.rotation.x += Math.max(0, Math.sin(Math.PI * 2 * (frac - 0.05))) * (p.role === 'dj' ? 0.2 : st.bob) * p.p.amp * (0.4 + b.groove) * Math.min(1, secK + 0.2);
    // hops on the beat after a big drop
    if (p.role !== 'dj') {
      p.yOff = 0;
      if (p.hopUntil && now < p.hopUntil) p.yOff = p.hopH * Math.sin(Math.PI * frac);
    }
    // filming: right hand up in front of the face, phone pointed at the stage
    if (p.filming && p.holding === 'phone') {
      p.root.updateMatrixWorld(true);
      p.head(_v);
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      _v.x += fx * 0.32 - fz * 0.06;
      _v.z += fz * 0.32 + fx * 0.06;
      _v.y += 0.08;
      ik([p.bones.RightArm, p.bones.RightForeArm, p.bones.RightHand], _v, 0.95);
    }
  }

  updateCrowd(p, dt, m, sec, now) {
    const b = p.b;
    const P = p.p;
    // --- brain ---
    const energy = m.playing ? m.energy : 0;
    const building = sec === 'build';
    b.groove += (energy * (0.5 + P.bass * 0.5) * (0.6 + P.energy * 0.6) - b.groove) * dt * 0.8;
    if (building) b.anticipation = Math.min(1, b.anticipation + dt * 0.14 * (0.5 + P.build) * (m.toDrop < 4 * m.barSec ? 1.6 : 1));
    else b.anticipation = Math.max(0, b.anticipation - dt * 0.3);
    b.euphoria = Math.max(0, b.euphoria - dt * (0.05 + b.fatigue * 0.05));
    b.chills = Math.max(0, b.chills - dt * 0.6);
    const resting = p.state === 'sit' || p.state === 'wc' || p.state === 'barWait';
    b.fatigue = clamp01(b.fatigue + dt * 0.002 * b.groove * (1.2 - P.stamina) * (p.state === 'dance' ? 1 : 0) - (resting || sec === 'breakdown' ? dt * 0.008 : 0));
    b.hype = clamp01(0.45 * b.groove + 0.4 * b.euphoria + 0.2 * b.anticipation - 0.25 * b.fatigue);
    b.thirst = Math.min(1.3, b.thirst + dt * 0.0035 * (0.5 + b.groove));
    if (FEATURES.restrooms) b.bladder = Math.min(1.3, b.bladder + dt * 0.0022 * (0.5 + b.thirst * 0.5));
    // --- drop reaction ---
    if (p.pendingDrop && now >= p.pendingDrop.at) {
      const d = p.pendingDrop;
      p.pendingDrop = null;
      const impact = d.strength * (0.35 + b.anticipation * 0.8) * (1 - b.fatigue * 0.6) * (0.55 + P.bass * 0.45) * (d.kickIn ? 0.6 : 1);
      b.euphoria = Math.min(1, b.euphoria + impact);
      b.chills = Math.min(1, impact * 1.3);
      b.anticipation = 0;
      const st = STYLES[p.style];
      if (p.state === 'dance' || p.state === 'rail') {
        if (impact > 0.45 && Math.random() < st.hop) {
          p.hopUntil = now + m.barSec * (1.5 + 2.5 * impact * P.energy);
          p.hopH = 0.1 + 0.16 * P.energy;
          p.react = p.hopUntil - now;
          p.play(pick(st.drop), 0.12, 1);
        } else if (impact > 0.25) {
          p.react = m.barSec * rand(2, 4);
          p.play(pick(st.dance), 0.2, this.danceTS(p, 'house', m.bpm));
        }
        if (p.style === 'filmer') {
          p.hold('phone');
          p.filming = true;
          p.filmUntil = now + m.barSec * rand(4, 10);
        }
      }
    }
    if (p.filming && now > (p.filmUntil || 0)) p.filming = false;
    switch (p.state) {
      case 'dance':
        this.danceBehaviour(p, dt, m, sec, now);
        break;
      case 'rail':
        if (m.playing && p.curName !== 'house' && sec !== 'breakdown' && Math.random() < dt * 0.3) p.play('house', 0.6, this.danceTS(p, 'house', m.bpm) * 0.8);
        if (Math.random() < dt * 0.004) this.leave(p);
        break;
      case 'walk':
        if (this.walkStep(p, dt)) {
          const t = p.then;
          p.then = null;
          if (t) t(p);
          else this.backToDance(p);
        }
        break;
      case 'barWait':
        p.yaw += wrapPi(0 - p.yaw) * dt * 4;
        if (p.served) {
          p.served = false;
          p.hold(pick(['beer', 'beer', 'cup', 'cocktail']));
          b.thirst = 0;
          if (p.slot) p.slot.taken = null;
          p.slot = null;
          if (Math.random() < 0.3 && this.freeSeat()) this.goSit(p);
          else this.backToDance(p);
        }
        break;
      case 'sit':
        b.fatigue = Math.max(0, b.fatigue - dt * 0.01);
        if (now > p.sitUntil && (!m.playing || sec !== 'breakdown')) {
          p.seatSpot.taken = null;
          p.seatSpot = null;
          this.backToDance(p);
        }
        break;
      case 'wc':
        this.wcStep(p, dt, now);
        break;
    }
  }

  danceBehaviour(p, dt, m, sec, now) {
    const b = p.b;
    const P = p.p;
    const st = STYLES[p.style];
    if (p.react > 0) {
      p.react -= dt;
      if (p.react <= 0) p.play(pick(st.dance), 0.6, this.danceTS(p, 'house', m.bpm));
    } else if (m.playing) {
      const quiet = sec === 'breakdown' || sec === 'intro' || sec === 'outro';
      const lastBars = sec === 'build' && m.toDrop < m.barSec * 2;
      if (quiet) {
        if (p.partner && p.partner.state === 'dance' && P.social > 0.4) {
          if (p.curName !== 'talk') p.play('talk', 0.6, 1);
          p.facing = Math.atan2(p.partner.pos.x - p.pos.x, p.partner.pos.z - p.pos.z);
        } else if (p.curName !== 'idle' && p.curName !== 'drink' && Math.random() < dt * 0.6) p.play(p.holding && p.holding !== 'phone' && Math.random() < 0.4 ? 'drink' : 'idle', 0.8, 1);
        if (p.style === 'filmer' && sec === 'breakdown' && Math.random() < dt * 0.05) {
          p.hold('phone');
          p.filming = true;
          p.filmUntil = now + rand(4, 9);
        }
      } else if (sec === 'build' && this.events.clapAlong && P.social > 0.35 && !lastBars) {
        if (p.curName !== 'clap') p.play('clap', 0.3, this.danceTS(p, 'clap', m.bpm));
      } else if (lastBars && (p.style === 'raver' || p.style === 'jumper') && b.anticipation > 0.4) {
        if (p.curName !== 'rally') p.play('rally', 0.3, this.danceTS(p, 'rally', m.bpm));
      } else if (['idle', 'clap', 'drink', 'talk'].includes(p.curName)) {
        if (Math.random() < dt * (0.8 + b.groove)) p.play(pick(st.dance), 0.6, this.danceTS(p, pick(st.dance), m.bpm));
      } else if (p.cur && DANCE_CLIPS.has(p.curName)) p.cur.timeScale = this.danceTS(p, p.curName, m.bpm);
      if (!quiet) p.facing = null;
    } else if (p.curName !== 'idle' && p.curName !== 'talk') p.play(Math.random() < 0.4 ? 'talk' : 'idle', 0.8);
    // stay near the home slot; step aside for people walking through
    p.yieldV.multiplyScalar(Math.max(0, 1 - dt * 1.5));
    const hx = p.home.x + p.yieldV.x;
    const hz = p.home.z + p.yieldV.y;
    p.pos.x += (hx - p.pos.x) * Math.min(1, dt * 1.5);
    p.pos.z += (hz - p.pos.z) * Math.min(1, dt * 1.5);
    const face = p.facing ?? Math.PI + Math.sin(now * 0.3 + P.phase) * 0.22;
    p.yaw += wrapPi(face - p.yaw) * Math.min(1, dt * 2);
    // needs: drinks, restroom, a seat
    const calm = sec !== 'drop' && sec !== 'build' && p.react <= 0;
    if (!calm) return;
    if (b.bladder > 1 && FEATURES.restrooms && Math.random() < dt * 0.25) return this.goWC(p);
    if (b.thirst > 1 && Math.random() < dt * 0.25) return this.goBar(p);
    if (b.fatigue > 0.55 && Math.random() < dt * 0.1 && this.freeSeat()) return this.goSit(p);
    if (FEATURES.balcony && Math.random() < dt * 0.0015) return this.goRail(p);
  }

  // ---- errands ----
  freeSeat() {
    return [...POI.lounge, ...POI.balconySeats].find((s) => !s.taken);
  }
  goBar(p) {
    const slot = POI.bar.filter((s) => !s.taken).sort((a, c) => Math.abs(a.x - p.pos.x) - Math.abs(c.x - p.pos.x))[0];
    if (!slot) return;
    slot.taken = p;
    p.slot = slot;
    if (p.holding !== 'phone') p.hold(null);
    p.goTo(slot.x, slot.z, 0, null, (q) => {
      q.state = 'barWait';
      q.play('idle', 0.4);
      this.barQueue.push(q);
    });
  }
  goSit(p) {
    const seats = [...POI.lounge, ...POI.balconySeats].filter((s) => !s.taken);
    if (!seats.length) return;
    const s = pick(seats);
    s.taken = p;
    p.goTo(s.x + Math.sin(s.yaw) * 0.65, s.z + Math.cos(s.yaw) * 0.65, s.level || 0, null, (q) => this.seat(q, s));
  }
  goRail(p) {
    const r = POI.balconyRail.filter((s) => !s.taken);
    if (!r.length) return;
    const s = pick(r);
    s.taken = p;
    p.goTo(s.x, s.z, 1, null, (q) => {
      q.state = 'rail';
      q.spot = s;
      q.yaw = s.yaw;
      q.play('idle', 0.5);
    });
  }
  leave(p) {
    if (p.spot) p.spot.taken = null;
    p.spot = null;
    this.backToDance(p);
  }
  backToDance(p) {
    // find a free spot on the floor near the old home
    p.goTo(p.home.x, p.home.z, 0, null, (q) => {
      q.state = 'dance';
      q.play(pick(STYLES[q.style].dance), 0.5, q.p.tempo);
    });
  }
  goWC(p) {
    const w = POI.wc[p.female ? 'w' : 'm'];
    if (!w) return;
    p.wc = { w, step: 'door' };
    p.goTo(w.inside.x, w.inside.z, 0, null, (q) => {
      q.state = 'wc';
      q.wc.step = 'choose';
    });
  }
  wcStep(p, dt, now) {
    const s = p.wc;
    const w = s.w;
    if (s.step === 'choose') {
      const useUrinal = !p.female && w.urinals.length && Math.random() < 0.6;
      const spot = (useUrinal ? w.urinals : w.stalls).find((x) => !x.taken);
      if (!spot) {
        s.wait = (s.wait || 0) + dt;
        if (p.curName !== 'idle') p.play('idle', 0.4);
        if (s.wait > 20) this.finishWC(p);
        return;
      }
      spot.taken = p;
      s.spot = spot;
      s.urinal = useUrinal;
      s.step = 'go';
      const tgt = useUrinal ? spot : spot.front;
      p.path = findPath(p.pos.x, p.pos.z, 0, tgt.x, tgt.z, 0);
      p.walkSpeed = 0.9;
      p.play(p.walkClip(), 0.3, p.walkTS(0.9));
      return;
    }
    if (s.step === 'go') {
      if (!this.walkStep(p, dt)) return;
      if (s.urinal) {
        s.step = 'use';
        s.until = now + rand(12, 22);
        p.yaw = s.spot.yaw;
        p.play('idle', 0.4);
      } else {
        this.onStallDoor && this.onStallDoor(s.spot, true);
        p.path = [{ x: s.spot.x, z: s.spot.z }];
        s.step = 'enter';
      }
      return;
    }
    if (s.step === 'enter') {
      if (!this.walkStep(p, dt)) return;
      this.onStallDoor && this.onStallDoor(s.spot, false);
      p.hidden = true;
      p.root.visible = false;
      s.step = 'use';
      s.until = now + rand(20, 45);
      return;
    }
    if (s.step === 'use') {
      if (now < s.until) return;
      if (p.hidden) {
        p.hidden = false;
        p.root.visible = true;
        this.onStallDoor && this.onStallDoor(s.spot, true);
        setTimeout(() => this.onStallDoor && this.onStallDoor(s.spot, false), 2500);
      }
      s.spot.taken = null;
      const sink = w.sinks.find((x) => !x.taken) || w.sinks[0];
      sink.taken = p;
      s.sink = sink;
      p.path = findPath(p.pos.x, p.pos.z, 0, sink.x, sink.z, 0);
      p.play(p.walkClip(), 0.3, p.walkTS(0.9));
      s.step = 'toSink';
      return;
    }
    if (s.step === 'toSink') {
      if (!this.walkStep(p, dt)) return;
      p.yaw = s.sink.yaw;
      p.play('talk', 0.3, 1.4); // hands moving at the basin
      s.step = 'wash';
      s.until = now + rand(6, 10);
      return;
    }
    if (s.step === 'wash' && now > s.until) {
      s.sink.taken = null;
      this.finishWC(p);
    }
  }
  finishWC(p) {
    p.b.bladder = 0;
    p.wc = null;
    p.hidden = false;
    p.root.visible = true;
    this.backToDance(p);
  }

  // follow the current path with local avoidance; returns true on arrival
  walkStep(p, dt) {
    if (!p.path || !p.path.length) return true;
    const tgt = p.path[0];
    const dx = tgt.x - p.pos.x;
    const dz = tgt.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < (p.path.length > 1 ? 0.45 : 0.18)) {
      p.path.shift();
      if (!p.path.length) {
        if (p.curName === p.walkClip()) p.play('idle', 0.35);
        return true;
      }
      return false;
    }
    let ux = dx / d;
    let uz = dz / d;
    // look ahead for people: steer around them, slow down if blocked
    let slow = 1;
    let sx = 0;
    let sz = 0;
    this.neighbours(p, 1.3, (o, ox, oz, od) => {
      const ahead = ox * ux + oz * uz;
      if (ahead <= 0) return;
      const lat = ox * -uz + oz * ux;
      if (Math.abs(lat) < 0.55) {
        const push = (1.3 - od) / 1.3;
        const side = lat >= 0 ? -1 : 1;
        sx += -uz * side * push * 1.4;
        sz += ux * side * push * 1.4;
        if (od < 0.5) slow = Math.min(slow, o.state === 'dance' ? 0.55 : 0.3);
        if (o.state === 'dance' && od < 1.0) {
          // ask the dancer to step aside
          o.yieldV.x += uz * -side * dt * 2.6;
          o.yieldV.y += -ux * -side * dt * 2.6;
          o.yieldV.clampLength(0, 0.8);
        }
      }
    });
    ux += sx;
    uz += sz;
    const l = Math.hypot(ux, uz) || 1;
    ux /= l;
    uz /= l;
    const sp = p.walkSpeed * slow;
    let moved = false;
    const isCrowd = p.role === 'crowd';
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
      const c = Math.cos(off);
      const s = Math.sin(off);
      const vx = ux * c - uz * s;
      const vz = ux * s + uz * c;
      const nx = p.pos.x + vx * sp * dt;
      const nz = p.pos.z + vz * sp * dt;
      if (collides(nx, nz, 0.2, p.level)) continue;
      if (isCrowd && PRIVATE[zoneAt(nx, nz, p.level)]) continue;
      p.pos.x = nx;
      p.pos.z = nz;
      p.level = levelAfterMove(nx, nz, p.level);
      p.yaw += wrapPi(Math.atan2(vx, vz) - p.yaw) * Math.min(1, dt * 7);
      moved = true;
      break;
    }
    if (!moved && p.path.length === 1 && d < 1.2) {
      // the exact spot is inside furniture (seat, counter): close enough
      p.path.length = 0;
      if (p.curName === p.walkClip()) p.play('idle', 0.35);
      return true;
    }
    if (!moved) {
      p.stuck = (p.stuck || 0) + dt;
      if (p.stuck > 3) {
        // re-plan from here
        const last = p.path[p.path.length - 1];
        p.path = findPath(p.pos.x, p.pos.z, p.level, last.x, last.z, p.level);
        p.stuck = 0;
      }
    } else p.stuck = 0;
    if (p.cur && p.curName === p.walkClip()) p.cur.timeScale = p.walkTS(sp);
    return false;
  }

  neighbours(p, r, fn) {
    const cx = Math.floor(p.pos.x);
    const cz = Math.floor(p.pos.z);
    for (let ix = cx - 1; ix <= cx + 1; ix++)
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const c = this.grid.get(ix * 1000 + iz + p.level * 1e7);
        if (!c) continue;
        for (const o of c) {
          if (o === p) continue;
          const ox = o.pos.x - p.pos.x;
          const oz = o.pos.z - p.pos.z;
          const od = Math.hypot(ox, oz);
          if (od < r) fn(o, ox, oz, od);
        }
      }
  }

  // nobody overlaps: positional separation with priorities (walkers > dancers, staff fixed)
  separate() {
    const MIN = 0.5;
    const weight = (q) => (q.role === 'guard' || q.role === 'staff' || q.role === 'dj' || q.role === 'player' || q.role === 'dancer' ? 0 : q.state === 'walk' ? 0.25 : 1);
    for (const p of this.people) {
      if (p.state === 'sit' || p.hidden) continue;
      this.neighbours(p, MIN, (o, ox, oz, od) => {
        if (o.id < p.id || o.state === 'sit' || o.hidden) return;
        if (od < 1e-4) {
          ox = 0.01;
          oz = 0;
          od = 0.01;
        }
        const wp = weight(p);
        const wo = weight(o);
        if (wp + wo === 0) return;
        const corr = MIN - od;
        const nx = ox / od;
        const nz = oz / od;
        const kp = wp / (wp + wo);
        const ko = wo / (wp + wo);
        const px = p.pos.x - nx * corr * kp;
        const pz = p.pos.z - nz * corr * kp;
        if (kp > 0 && !collides(px, pz, 0.18, p.level)) {
          p.pos.x = px;
          p.pos.z = pz;
        }
        const qx = o.pos.x + nx * corr * ko;
        const qz = o.pos.z + nz * corr * ko;
        if (ko > 0 && !collides(qx, qz, 0.18, o.level)) {
          o.pos.x = qx;
          o.pos.z = qz;
        }
      });
    }
  }

  updateBartender(p, dt) {
    if (p.job) {
      const j = p.job;
      j.t += dt;
      if (j.phase === 'go') {
        if (this.walkStep(p, dt)) {
          j.phase = 'take';
          j.t = 0;
          p.yaw = Math.PI;
          p.play('talk', 0.3);
        }
      } else if (j.phase === 'take' && j.t > 1.6) {
        j.phase = 'make';
        j.t = 0;
        p.yaw = 0;
        p.play('drink', 0.3, 1.6);
        p.hold(pick(['cup', 'beer', 'cocktail']));
      } else if (j.phase === 'make' && j.t > 2.8) {
        j.phase = 'serve';
        j.t = 0;
        p.yaw = Math.PI;
        p.play('talk', 0.3);
      } else if (j.phase === 'serve' && j.t > 1.0) {
        p.hold(null);
        j.customer.served = true;
        p.job = null;
        p.play('idle', 0.4);
      }
      return;
    }
    const waiting = this.barQueue.find((c) => c.state === 'barWait' && !c.claimed);
    if (waiting) {
      waiting.claimed = true;
      this.barQueue = this.barQueue.filter((c) => c !== waiting);
      p.job = { customer: waiting, phase: 'go', t: 0 };
      p.path = [{ x: Math.max(-6.6, Math.min(6.6, waiting.pos.x)), z: 9.12 }];
      p.walkSpeed = 1.3;
      p.play(p.walkClip(), 0.3, p.walkTS(1.3));
      setTimeout(() => (waiting.claimed = false), 30000);
    } else if (p.curName === p.walkClip()) p.play('idle', 0.4);
  }

  updateGuard(p, dt) {
    const pl = this.player;
    const d = pl ? Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z) : 99;
    let target = p.homeYaw;
    if (d < 3.5 && pl.level === p.level) target = Math.atan2(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z);
    p.yaw += wrapPi(target - p.yaw) * Math.min(1, dt * 3);
    if (p.scanning) {
      p.scanning -= dt;
      if (p.curName !== 'talk') p.play('talk', 0.25);
      if (p.scanning <= 0) {
        p.scanning = 0;
        p.play('idle', 0.5, 0.8);
      }
    }
  }

  updateDancer(p, m) {
    if (!m.playing && p.curName !== 'idle') p.play('idle', 0.8);
    else if (m.playing && p.curName === 'idle') p.play(p.danceClip, 0.8, this.danceTS(p, p.danceClip, m.bpm));
  }

  // DJ: steps toward the deck being used, jumps on big drops
  updateDJBody(p, dt, m, now) {
    const M = this.djMode;
    const busy = now <= Math.max(this.djHands.left.until, this.djHands.right.until);
    const tx = busy ? M.targetX : M.targetX * 0.6;
    if (!busy) M.targetX *= Math.max(0, 1 - dt * 0.3);
    const dx = tx - p.pos.x;
    p.pos.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.7);
    p.pos.z = -8.72;
    p.yaw += wrapPi(0 - p.yaw) * dt * 3;
    p.yOff = 0;
    if (now > M.jumpStart && now < M.jumpUntil && m.playing) {
      const frac = m.beatFrac;
      p.yOff = 0.17 * Math.sin(Math.PI * frac);
    }
  }

  updateDJHands(p, dt, m, now) {
    const B = this.booth;
    const M = this.djMode;
    p.root.updateMatrixWorld(true);
    p.head(_v2);
    const restL = _tmpL.set(p.pos.x + 0.16, B.topY + 0.17, -8.18);
    const restR = _tmpR.set(p.pos.x - 0.16, B.topY + 0.17, -8.18);
    const jumping = now > M.jumpStart && now < M.jumpUntil && m.playing;
    // hand up, swinging side to side with the beat (drops + grooves)
    if (m.playing && !jumping && now > M.nextHandUp && (m.section === 'drop' || m.section === 'groove') && now > this.djHands.right.until + 0.5) {
      M.handUpUntil = now + m.barSec * rand(1.5, 3);
      M.nextHandUp = now + m.barSec * rand(6, 14);
    }
    const cueing = this.cueUntil && now < this.cueUntil;
    for (const side of ['left', 'right']) {
      const h = this.djHands[side];
      const active = now >= (h.start || 0) - 0.3 && now <= h.until;
      let goal = side === 'left' ? restL : restR;
      let w = m.playing ? 0.9 : 0.55;
      if (active) goal = h.target;
      else if (jumping) {
        goal = _tmpU.set(p.pos.x + (side === 'left' ? 0.28 : -0.28), _v2.y + 0.45, -8.55);
      } else if (side === 'right' && now < M.handUpUntil) {
        const sw = m.playing ? Math.sin(Math.PI * (m.beat + m.beatFrac) * 0.5) : Math.sin(now * 2);
        goal = _tmpU.set(p.pos.x - 0.15 + sw * 0.28, _v2.y + 0.42, -8.45);
      } else if (side === 'left' && cueing) {
        goal = _tmpU.set(_v2.x + 0.12, _v2.y + 0.02, _v2.z + 0.04);
      }
      if (!h.cur || !Number.isFinite(h.cur.x + h.cur.y + h.cur.z)) h.cur = goal.clone();
      const dist = h.cur.distanceTo(goal);
      h.cur.lerp(goal, Math.min(1, dt * (active ? 8 : 4)));
      // a little arc while travelling across the gear
      const arc = Math.min(0.1, dist * 0.35);
      _tmpA.copy(h.cur);
      _tmpA.y += arc;
      h.w += (w - h.w) * Math.min(1, dt * 3);
      const chain = side === 'left' ? ['LeftArm', 'LeftForeArm', 'LeftHand'] : ['RightArm', 'RightForeArm', 'RightHand'];
      ik(chain.map((n) => p.bones[n]), _tmpA, h.w);
    }
    // lean toward the hand that's working
    const spine = p.bones.Spine1;
    if (spine) {
      const lx = (this.djHands.left.cur ? this.djHands.left.cur.x : 0) + (this.djHands.right.cur ? this.djHands.right.cur.x : 0);
      const lean = (lx / 2 - p.pos.x) * 0.5;
      if (Number.isFinite(lean)) spine.rotation.y += Math.max(-0.25, Math.min(0.25, lean));
      spine.rotation.x += 0.12;
    }
  }

  updatePlayer(p, dt, input) {
    if (!input || !input.active) {
      if (p.curName !== 'idle') p.play('idle', 0.4);
      return;
    }
    if (p.frozen > 0) {
      p.frozen -= dt;
      if (p.curName !== 'idle') p.play('idle', 0.3);
      return;
    }
    let mx = (input.keys.KeyD ? 1 : 0) - (input.keys.KeyA ? 1 : 0);
    let mz = (input.keys.KeyS ? 1 : 0) - (input.keys.KeyW ? 1 : 0);
    const run = input.keys.ShiftLeft || input.keys.ShiftRight;
    if (mx || mz) {
      const yaw = input.camYaw;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const wx = -mz * Math.sin(yaw) - mx * Math.cos(yaw);
      const wz = -mz * Math.cos(yaw) + mx * Math.sin(yaw);
      const speed = run ? 2.4 : 1.35;
      const nx = p.pos.x + wx * speed * dt;
      const nz = p.pos.z + wz * speed * dt;
      const from = zoneAt(p.pos.x, p.pos.z, p.level);
      const to = zoneAt(nx, nz, levelAfterMove(nx, nz, p.level));
      const needs = (PRIVATE[to] || to === 'lounge') && to !== from && !this.cleared[to] && !(from === 'stage' && (to === 'booth' || to === 'backstage') && this.cleared.stage);
      if (needs) {
        this.requestAccess(p, to);
      } else {
        if (!collides(nx, p.pos.z, 0.25, p.level)) p.pos.x = nx;
        if (!collides(p.pos.x, nz, 0.25, p.level)) p.pos.z = nz;
        p.level = levelAfterMove(p.pos.x, p.pos.z, p.level);
        const target = Math.atan2(wx, wz);
        p.yaw += wrapPi(target - p.yaw) * Math.min(1, dt * 10);
        p.play(p.walkClip(), 0.25, p.walkTS(speed));
      }
    } else if (p.curName !== 'idle') p.play('idle', 0.3);
  }

  requestAccess(p, zone) {
    let best = null;
    let bd = 1e9;
    for (const g of this.guards) {
      const d = Math.hypot(g.pos.x - p.pos.x, g.pos.z - p.pos.z);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    p.frozen = 1.8;
    if (best) best.scanning = 1.8;
    this.cleared[zone] = true;
    if (zone === 'stage') this.cleared.booth = this.cleared.backstage = true;
    const label = PRIVATE[zone] || 'VIP Lounge';
    this.onToast && this.onToast(`Security: scanning wristband for ${label}…`, `Owner verified. Welcome back, boss. Access: ${label}.`, 1.8);
  }

  pick(screenX, screenY, camera, w, h) {
    let best = null;
    let bd = 60;
    for (const p of this.crowd) {
      if (p.hidden) continue;
      p.head(_v);
      _v.project(camera);
      if (_v.z > 1) continue;
      const sx = ((_v.x + 1) / 2) * w;
      const sy = ((1 - _v.y) / 2) * h;
      const d = Math.hypot(sx - screenX, sy - screenY);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    this.selected = best;
    return best;
  }
}
const _tmpL = new THREE.Vector3();
const _tmpR = new THREE.Vector3();
const _tmpU = new THREE.Vector3();
const _tmpA = new THREE.Vector3();

// lightweight CCD IK for a 3-bone arm chain, blended over the animated pose
const _e = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _sa = new THREE.Quaternion();
const _sf = new THREE.Quaternion();
const finiteQ = (q) => Number.isFinite(q.x + q.y + q.z + q.w);
export function ik(chain, target, weight) {
  const [arm, fore, hand] = chain;
  if (!arm || !fore || !hand || weight <= 0.01 || !Number.isFinite(target.x + target.y + target.z)) return;
  _qa.copy(arm.quaternion);
  _qf.copy(fore.quaternion);
  _sa.copy(arm.quaternion);
  _sf.copy(fore.quaternion);
  arm.updateMatrixWorld(true);
  for (let it = 0; it < 5; it++) {
    for (const bone of [fore, arm]) {
      bone.updateMatrixWorld(true);
      hand.getWorldPosition(_e);
      bone.getWorldPosition(_b);
      _v1.subVectors(_e, _b).normalize();
      _w2.subVectors(target, _b).normalize();
      const dot = Math.max(-1, Math.min(1, _v1.dot(_w2)));
      const ang = Math.acos(dot);
      if (ang < 1e-3) continue;
      _ax.crossVectors(_v1, _w2);
      if (_ax.lengthSq() < 1e-10) continue;
      _ax.normalize();
      bone.getWorldQuaternion(_wq);
      _ax.applyQuaternion(_wq.invert());
      _q.setFromAxisAngle(_ax, Math.min(ang, 0.5));
      bone.quaternion.multiply(_q);
    }
  }
  arm.quaternion.copy(_qa.slerp(arm.quaternion, weight));
  fore.quaternion.copy(_qf.slerp(fore.quaternion, weight));
  if (!finiteQ(arm.quaternion) || !finiteQ(fore.quaternion)) {
    // never let a degenerate solve corrupt the pose
    arm.quaternion.copy(_sa);
    fore.quaternion.copy(_sf);
  }
  arm.updateMatrixWorld(true);
}
