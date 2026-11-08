// People: crowd (personality + "brain"), staff (bartenders, security), the DJ (hands on the
// gear via IK), dancers behind the decks, and the playable club owner. Uses the converted
// Mixamo characters; every animation is retargeted onto every character by bone name.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { collides, zoneAt, floorY, PRIVATE, STAGE, BAR } from './club.js';

const FEMALE = ['f02', 'f22', 'f37', 'twerk'];
const MALE = ['m42', 'owner', 'dj', 'bartender'];
const NAMES_F = ['Mia', 'Ava', 'Zoe', 'Lena', 'Nina', 'Chloe', 'Sofia', 'Maya', 'Ella', 'Aria', 'Jade', 'Luna', 'Ivy', 'Sara', 'Noa'];
const NAMES_M = ['Leo', 'Max', 'Kai', 'Noah', 'Eli', 'Omar', 'Luca', 'Jay', 'Ben', 'Sam', 'Theo', 'Ivan', 'Marco', 'Dev', 'Alex'];
const STYLES = {
  raver: { dance: ['rally', 'house'], drop: ['jump', 'cheer'], energy: [0.75, 1], bob: 0.22 },
  jumper: { dance: ['house', 'hiphop'], drop: ['jump', 'jump', 'cheer2'], energy: [0.6, 0.95], bob: 0.18 },
  twostep: { dance: ['house', 'hiphop'], drop: ['cheer', 'house'], energy: [0.45, 0.8], bob: 0.15 },
  bobber: { dance: ['idle'], drop: ['cheer2', 'idle'], energy: [0.3, 0.6], bob: 0.32 },
  swayer: { dance: ['idle', 'house'], drop: ['cheer', 'idle'], energy: [0.2, 0.5], bob: 0.12 },
  filmer: { dance: ['idle', 'house'], drop: ['cheer2'], energy: [0.35, 0.7], bob: 0.15 },
  twerker: { dance: ['twerk', 'house'], drop: ['cheer2', 'twerk'], energy: [0.6, 0.9], bob: 0.1 },
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const TOPS = [0x111111, 0x0d0d0d, 0xf2f2f2, 0x5a0f1a, 0x101a3a, 0x3a3f2a, 0x6a6a72, 0x2a0f3a, 0xb81f4a, 0x1c1c1c];
const BOTTOMS = [0x0c0c0c, 0x161a2a, 0x2a2a2e, 0x1a1410, 0x3a3a3a];
const HAIR = [0x2a1a10, 0x0c0806, 0x6a4a2a, 0x9a7a4a, 0x1a1210];

export async function loadAssets(base, onProgress = () => {}) {
  const man = await (await fetch(base + 'models/manifest.json')).json();
  const loader = new GLTFLoader();
  const total = Object.keys(man.chars).length + Object.keys(man.clips).length + 1;
  let done = 0;
  const tick = () => onProgress(++done / total);
  const chars = {};
  const clips = {};
  await Promise.all([
    ...Object.entries(man.chars).map(async ([id, c]) => {
      const gltf = await loader.loadAsync(base + 'models/' + c.file);
      chars[id] = { scene: gltf.scene, height: c.height, unit: c.height / 176 };
      tick();
    }),
    ...Object.entries(man.clips).map(async ([id, c]) => {
      const j = await (await fetch(base + 'models/' + c.file)).json();
      const clip = THREE.AnimationClip.parse(j);
      clip.name = id;
      clip.userData = { speed: c.speed };
      clips[id] = clip;
      tick();
    }),
  ]);
  let phone = null;
  try {
    phone = (await loader.loadAsync(base + 'models/phone/scene.gltf')).scene;
  } catch (e) {
    console.warn('phone model failed', e);
  }
  tick();
  return { chars, clips, phone };
}

// ---------- props ----------
function makeProps(phoneScene) {
  const P = {};
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 });
  // beer bottle (cm units because props live under the character's bones)
  const beer = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 15, 12), new THREE.MeshStandardMaterial({ color: 0x4a2a08, roughness: 0.15, transparent: true, opacity: 0.9 }));
  const bn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.0, 8, 12), bb.material);
  bn.position.y = 11;
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 6, 12), new THREE.MeshStandardMaterial({ color: 0xd8c070, roughness: 0.6 }));
  beer.add(bb, bn, lab);
  P.beer = beer;
  // clear plastic cup with drink
  const cup = new THREE.Group();
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 3.4, 11, 14, 1, true), glass);
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 3.4, 7, 14), new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.2, transparent: true, opacity: 0.85 }));
  liq.position.y = -2;
  cup.add(c1, liq);
  P.cup = cup;
  // cocktail
  const ck = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 14, 1, true), glass);
  bowl.rotation.x = Math.PI;
  bowl.position.y = 7;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 7, 6), glass);
  const fill = new THREE.Mesh(new THREE.ConeGeometry(4.2, 4.6, 14), new THREE.MeshStandardMaterial({ color: 0xc0105a, roughness: 0.2, emissive: 0x300010 }));
  fill.rotation.x = Math.PI;
  fill.position.y = 7.6;
  ck.add(bowl, stem, fill);
  P.cocktail = ck;
  // phone (user's model): long axis Z, ~2.15 units long -> ~15 cm
  if (phoneScene) {
    const ph = phoneScene.clone(true);
    const box = new THREE.Box3().setFromObject(ph);
    const len = box.getSize(new THREE.Vector3()).z || 2.15;
    const s = 15 / len;
    ph.scale.setScalar(s);
    ph.rotation.x = -Math.PI / 2;
    P.phone = ph;
  } else {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(7, 15, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    P.phone = ph;
  }
  return P;
}

function makePhone(P, brightness, flash) {
  const ph = P.phone.clone(true);
  ph.traverse((o) => {
    if (o.isMesh) {
      const n = (o.material && o.material.name) || '';
      if (/screen/i.test(n)) o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.65, 1).multiplyScalar(brightness), toneMapped: false });
    }
  });
  const g = new THREE.Group();
  g.add(ph);
  if (flash) {
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.scale.setScalar(14);
    fl.position.set(0, 5, -1.5);
    g.add(fl);
    g.userData.flash = fl;
  }
  return g;
}

// ---------- Person ----------
let uid = 0;
export class Person {
  constructor(sim, type, o = {}) {
    this.id = uid++;
    this.sim = sim;
    this.type = type;
    this.female = FEMALE.includes(type);
    this.name = o.name || pick(this.female ? NAMES_F : NAMES_M);
    const tpl = sim.assets.chars[type];
    this.obj = SkeletonUtils.clone(tpl.scene);
    this.root = new THREE.Group();
    this.root.add(this.obj);
    this.height = o.height || (this.female ? rand(1.62, 1.76) : rand(1.72, 1.88));
    this.obj.scale.setScalar(this.height / tpl.height);
    this.bones = {};
    this.obj.traverse((b) => {
      if (b.isBone) this.bones[b.name.replace('mixamorig', '')] = b;
      if (b.isMesh) b.castShadow = false;
    });
    if (o.outfit !== false) this.dress(o.outfit || {});
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.actions = {};
    this.cur = null;
    this.curName = '';
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.yaw = o.yaw ?? Math.PI;
    this.role = o.role || 'crowd';
    this.style = o.style || 'twostep';
    const st = STYLES[this.style] || STYLES.twostep;
    // personality
    this.p = {
      energy: rand(st.energy[0], st.energy[1]),
      bass: rand(0.3, 1),
      vocal: rand(0.2, 1),
      build: rand(0.3, 1),
      delay: rand(0.04, 0.45),
      stamina: rand(0.3, 1),
      social: rand(0, 1),
      tempo: rand(0.94, 1.06),
      phase: rand(0, Math.PI * 2),
      amp: rand(0.6, 1.3),
    };
    // brain
    this.b = { groove: 0.3, anticipation: 0, euphoria: 0, fatigue: rand(0, 0.15), hype: 0.2, thirst: rand(0, 0.8) };
    this.state = 'dance';
    this.react = 0;
    this.home = this.pos.clone();
    this.path = [];
    this.hand = null;
    this.lod = 0;
    this.skip = 0;
    sim.scene.add(this.root);
    this.place();
  }
  dress(o) {
    const top = o.top ?? pick(TOPS);
    const bottom = o.bottom ?? pick(BOTTOMS);
    const hair = o.hair ?? pick(HAIR);
    const solid = o.solid ?? Math.random() < 0.55;
    this.obj.traverse((m) => {
      if (!m.isMesh) return;
      const n = m.name.toLowerCase();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mt) => {
        let c = null;
        if (/shirt|cloth|top|sweater|zipper|suit|tie|collar/.test(n)) c = top;
        else if (/pant|short|bottom|jean/.test(n)) c = bottom;
        else if (/hair/.test(n)) c = hair;
        else if (/sock/.test(n)) c = o.socks ?? null;
        if (c === null) return mt;
        const nm = mt.clone();
        if (solid && !/hair/.test(n)) nm.map = null;
        nm.color = new THREE.Color(c);
        if (nm.map && /hair/.test(n)) nm.color.lerp(new THREE.Color(0xffffff), 0.35);
        return nm;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
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
    const obj = kind === 'phone' ? makePhone(P, this.phoneBright || 1, this.phoneFlash) : P[kind].clone(true);
    this.hand = this.attach('RightHand', obj, kind === 'phone' ? [0, 9, 3] : [0, 8, 4], kind === 'phone' ? [0, 0, 0] : [0, 0, 0]);
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
  place() {
    this.pos.y = floorY(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
  head(out) {
    const h = this.bones.Head;
    if (h) return h.getWorldPosition(out);
    return out.copy(this.pos).setY(this.pos.y + this.height);
  }
  // steering toward the next waypoint with obstacle sidestep
  walk(dt, speed) {
    if (!this.path.length) return true;
    const tgt = this.path[0];
    const dx = tgt.x - this.pos.x;
    const dz = tgt.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      this.path.shift();
      return !this.path.length;
    }
    let ang = Math.atan2(dx, dz);
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      const a = ang + off;
      const nx = this.pos.x + Math.sin(a) * speed * dt;
      const nz = this.pos.z + Math.cos(a) * speed * dt;
      if (!collides(nx, nz, 0.22) && !(this.role !== 'player' && this.role !== 'staff' && this.role !== 'guard' && PRIVATE[zoneAt(nx, nz)])) {
        this.pos.x = nx;
        this.pos.z = nz;
        ang = a;
        break;
      }
    }
    this.yaw += (((ang - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
    return false;
  }
}

// ---------- the simulation ----------
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
    this.barSlots = [];
    for (let x = -6; x <= 6.01; x += 1.3) this.barSlots.push({ x, z: BAR.zc - 0.85, taken: null });
    this.loungeSeats = [];
  }
  clipFor(type, name) {
    const unit = this.assets.chars[type].unit;
    if (Math.abs(unit - 1) < 0.03) return this.assets.clips[name];
    const key = type + ':' + name;
    if (!this.clipCache[key]) {
      const c = this.assets.clips[name].clone();
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
  populate(count = 160, loungeSeats = []) {
    this.loungeSeats = loungeSeats;
    // dance floor slots, denser at the front
    const slots = [];
    for (let z = -5.0; z < 5.6; ) {
      const sp = z < -3 ? 0.62 : z < 1.5 ? 0.72 : 0.9;
      for (let x = -8.4; x <= 8.4; x += sp) slots.push([x + rand(-0.15, 0.15), z + rand(-0.12, 0.12)]);
      z += sp;
    }
    // weighted sample: the front fills up first, but the middle and back always have people
    const w = (z) => (z < -3 ? 1.0 : z < 1.5 ? 0.75 : 0.5);
    slots.forEach((sl) => (sl.k = -Math.log(Math.random()) / w(sl[1])));
    slots.sort((a, b) => a.k - b.k);
    const nFloor = Math.min(count - 10, slots.length);
    for (let i = 0; i < nFloor; i++) {
      const [x, z] = slots[i];
      const front = z < -3;
      const back = z > 1.8;
      let style;
      const r = Math.random();
      if (front) style = r < 0.45 ? 'raver' : r < 0.8 ? 'jumper' : 'filmer';
      else if (back) style = r < 0.35 ? 'bobber' : r < 0.6 ? 'swayer' : r < 0.75 ? 'filmer' : r < 0.88 ? 'jumper' : 'twostep';
      else style = r < 0.4 ? 'jumper' : r < 0.7 ? 'twostep' : r < 0.85 ? 'filmer' : 'bobber';
      const female = Math.random() < 0.48;
      let type = female ? pick(FEMALE) : pick(MALE);
      if (female && style === 'jumper' && Math.random() < 0.25 && type === 'twerk') style = 'twerker';
      const height = front ? (female ? rand(1.7, 1.8) : rand(1.82, 1.94)) : female ? rand(1.6, 1.74) : rand(1.7, 1.86);
      const p = this.add(type, { x, z, yaw: Math.PI + rand(-0.35, 0.35), style, height });
      p.home.set(x, 0, z);
      p.pusher = front ? false : Math.random() < 0.06;
      if (style === 'filmer') {
        p.phoneBright = rand(0.4, 1.6);
        p.phoneFlash = Math.random() < 0.35;
      }
      if (Math.random() < 0.3) p.hold(pick(['beer', 'cup', 'cup', 'cocktail']));
      p.play(pick(STYLES[style].dance), 0, p.p.tempo);
      this.crowd.push(p);
    }
    // lounge: seated guests
    const nL = Math.min(loungeSeats.length, Math.max(4, count - nFloor - 2));
    for (let i = 0; i < nL; i++) {
      const s = loungeSeats[i];
      const female = Math.random() < 0.55;
      const p = this.add(female ? pick(FEMALE) : pick(MALE), { x: s.x, z: s.z, yaw: s.ry, style: 'swayer' });
      p.state = 'lounge';
      p.seat = s;
      s.taken = p;
      p.play('sit', 0);
      p.hold(pick(['cocktail', 'beer', 'cup']));
      this.crowd.push(p);
    }
    // staff
    const bartenders = [-4, 0, 4].map((x, i) =>
      this.add('bartender', { x, z: 9.15, yaw: Math.PI, role: 'staff', outfit: { top: 0x0b0b0b, bottom: 0x0b0b0b, solid: true }, height: rand(1.72, 1.86) })
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
      { x: 9.7, z: 2.6, yaw: -Math.PI / 2, post: 'lounge' },
      { x: -13.8, z: 6.2, yaw: Math.PI / 2, post: 'entrance' },
      { x: 7.6, z: 8.6, yaw: Math.PI, post: 'barstaff' },
    ];
    for (const g of guardSpots) {
      const p = this.add('guard', { x: g.x, z: g.z, yaw: g.yaw, role: 'guard', outfit: { top: pick([0x0a0a0c, 0x10131c]), bottom: 0x0a0a0c, solid: false }, height: rand(1.84, 1.96) });
      p.post = g.post;
      p.homeYaw = g.yaw;
      p.state = 'guard';
      p.play('idle', 0, 0.8);
      // earpiece
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      p.attach('Head', ear, [7.5, 6, 1]);
      this.guards.push(p);
    }
    // dancers behind the decks
    [
      ['twerk', -4.6, 'twerk'],
      ['f22', 4.4, 'house'],
      ['f37', 5.4, 'hiphop'],
    ].forEach(([t, x, clip]) => {
      const p = this.add(t, { x, z: -9.2, yaw: 0.0 + rand(-0.3, 0.3), role: 'dancer', outfit: { top: pick([0x0a0a0a, 0xb81f4a, 0xe8e8e8, 0x2a0f3a]), bottom: 0x0a0a0a, solid: Math.random() < 0.5 }, height: rand(1.66, 1.76) });
      p.state = 'stage';
      p.play(clip, 0);
      p.danceClip = clip;
      p.hold(Math.random() < 0.5 ? 'cocktail' : null);
    });
    // the DJ (Ch38): white shirt, black bottoms, black cap, sunglasses, silver watch
    const dj = this.add('dj', { x: 0, z: -8.72, yaw: 0, role: 'dj', outfit: { top: 0xffffff, bottom: 0x0b0b0b, socks: 0x0b0b0b, hair: 0x15100c, solid: false }, height: 1.83 });
    dj.state = 'dj';
    dj.play('idle', 0, 0.9);
    const cap = new THREE.Group();
    const capM = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(17, 0.8, 9), capM);
    brim.position.set(0, 0.5, 9);
    cap.add(dome, brim);
    dj.attach('Head', cap, [0, 13.5, 1.0], [-0.12, 0, 0]);
    const shades = new THREE.Group();
    const lensM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.8 });
    for (const sx of [-3.4, 3.4]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 0.6), lensM);
      l.position.x = sx;
      shades.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 0.6), lensM);
    bridge.position.y = 1.2;
    shades.add(bridge);
    dj.attach('Head', shades, [0, 8.2, 9.3]);
    const watch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.9, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.15, metalness: 1 }));
    dj.attach('LeftForeArm', watch, [0, 24, 0], [Math.PI / 2, 0, 0]);
    this.dj = dj;
    this.djHands = { left: { w: 0, target: new THREE.Vector3(), until: 0 }, right: { w: 0, target: new THREE.Vector3(), until: 0 } };
    // the owner (player) starts at the entrance
    const owner = this.add('owner', { x: -11.2, z: 6.4, yaw: Math.PI / 2, role: 'player', outfit: { top: 0x0b0b0b, bottom: 0x111318, solid: false }, height: 1.84 });
    owner.state = 'player';
    owner.play('idle', 0);
    this.player = owner;
    this.cleared = {};
  }

  // a DJ gesture: move the correct hand to the control
  gesture(e, controlPos, now) {
    const left = e.deck === 0 || e.deck === 1;
    const h = e.control === 'rmx' || e.deck < 0 ? this.djHands.right : left ? this.djHands.left : this.djHands.right;
    h.target.copy(controlPos);
    h.target.y += 0.03;
    h.start = e.when;
    h.until = e.when + Math.max(0.5, e.dur);
  }

  onDrop(ev, ctxNow) {
    const strength = ev.drop.strength;
    for (const p of this.crowd) p.pendingDrop = { at: ctxNow + p.p.delay, strength, kickIn: !!ev.drop.kickIn };
    const before = this.avg('hype');
    this.dropLog.unshift({ track: ev.track.name, time: ev.drop.time, strength, before, score: null, at: ctxNow });
    this.dropLog.length = Math.min(12, this.dropLog.length);
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
  update(dt, m, ctxNow, camPos, engine, input) {
    const beatPhase = m.playing ? (m.beat + m.beatFrac) * Math.PI : ctxNow * 2;
    const sec = m.section || 'idle';
    // score drops ~3 s after they land
    for (const d of this.dropLog)
      if (d.score === null && ctxNow - d.at > 3) {
        const after = this.avg('hype');
        const eu = this.avg('euphoria');
        d.score = Math.round(clamp01(eu * 0.8 + (after - d.before) * 0.8 + d.strength * 0.25) * 100);
      }
    for (const p of this.people) {
      // LOD: far people animate at half rate
      const dist = camPos.distanceTo(p.root.position);
      const far = dist > 16 ? 2 : 1;
      p.skip = (p.skip + 1) % far;
      const adt = dt * far;
      if (p.role === 'crowd') this.updateCrowd(p, dt, m, sec, ctxNow, beatPhase, engine);
      else if (p.role === 'staff') this.updateBartender(p, dt);
      else if (p.role === 'guard') this.updateGuard(p, dt);
      else if (p.role === 'dancer') this.updateDancer(p, dt, m);
      else if (p.role === 'player') this.updatePlayer(p, dt, input);
      p.place();
      if (p.skip === 0) p.mixer.update(adt);
      // procedural head bob on the beat (after the clip pose)
      const neck = p.bones.Neck;
      if (neck && m.playing && p.state !== 'walk' && p.role !== 'player') {
        const st = STYLES[p.style] || STYLES.twostep;
        const amt = (p.role === 'dj' ? 0.16 : st.bob) * p.p.amp * (0.4 + p.b.groove);
        neck.rotation.x += Math.max(0, Math.sin(beatPhase * 2 + p.p.phase * 0.2)) * amt;
      }
      if (p.role === 'dj') this.updateDJ(p, dt, m, ctxNow);
      if (p.hand && p.hand.userData.flash) p.hand.userData.flash.visible = p.curName === 'cheer2' || p.curName === 'cheer' || (p.react > 0 && Math.random() < 0.97);
    }
    // crowd separation (keeps people from overlapping)
    const C = this.crowd;
    for (let i = 0; i < C.length; i++) {
      const a = C[i];
      if (a.state === 'lounge') continue;
      for (let j = i + 1; j < C.length; j++) {
        const b = C[j];
        if (b.state === 'lounge') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.2 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (0.45 - d) * 0.5;
          const ux = dx / d;
          const uz = dz / d;
          if (a.state === 'dance') {
            a.pos.x -= ux * push * 0.5;
            a.pos.z -= uz * push * 0.5;
          }
          if (b.state === 'dance') {
            b.pos.x += ux * push * 0.5;
            b.pos.z += uz * push * 0.5;
          }
        }
      }
    }
  }

  updateCrowd(p, dt, m, sec, now, beatPhase, engine) {
    const b = p.b;
    const P = p.p;
    // --- brain ---
    const energy = m.playing ? m.energy : 0;
    const building = sec === 'build';
    b.groove += ((energy * (0.5 + P.bass * 0.5) * (0.6 + P.energy * 0.6)) - b.groove) * dt * 0.8;
    if (building) b.anticipation = Math.min(1, b.anticipation + dt * 0.12 * (0.5 + P.build));
    else b.anticipation = Math.max(0, b.anticipation - dt * 0.25);
    b.euphoria = Math.max(0, b.euphoria - dt * (0.06 + b.fatigue * 0.05));
    b.fatigue = clamp01(b.fatigue + dt * 0.0025 * b.groove * (1.2 - P.stamina) - (sec === 'breakdown' || p.state !== 'dance' ? dt * 0.01 : 0));
    b.hype = clamp01(0.45 * b.groove + 0.4 * b.euphoria + 0.2 * b.anticipation - 0.25 * b.fatigue);
    b.thirst = Math.min(1.2, b.thirst + dt * 0.004 * (0.5 + b.groove));
    // --- drop reaction ---
    if (p.pendingDrop && now >= p.pendingDrop.at) {
      const d = p.pendingDrop;
      p.pendingDrop = null;
      const impact = d.strength * (0.35 + b.anticipation * 0.8) * (1 - b.fatigue * 0.6) * (0.55 + P.bass * 0.45) * (d.kickIn ? 0.6 : 1);
      b.euphoria = Math.min(1, b.euphoria + impact);
      b.anticipation = 0;
      if (p.state === 'dance' && impact > 0.28) {
        const st = STYLES[p.style];
        p.react = rand(2.5, 5) * (0.5 + impact);
        p.play(impact > 0.55 ? pick(st.drop) : pick(st.dance), 0.15, p.curName === 'jump' ? 1 : P.tempo);
        if (p.holding === 'phone' || p.style === 'filmer') p.hold('phone');
      }
    }
    if (p.state === 'dance') {
      if (p.react > 0) {
        p.react -= dt;
        if (p.react <= 0) p.play(pick(STYLES[p.style].dance), 0.6, P.tempo);
      } else if (m.playing) {
        // energy-driven clip choice: chill in breakdowns, clap on clap-along builds
        const st = STYLES[p.style];
        if (sec === 'breakdown' || sec === 'intro' || sec === 'outro') {
          if (p.curName !== 'idle' && p.curName !== 'drink' && Math.random() < dt * 0.5) p.play(p.holding && p.holding !== 'phone' && Math.random() < 0.4 ? 'drink' : 'idle', 0.8, 1);
        } else if (building && this.events.clapAlong && P.social > 0.35) {
          if (p.curName !== 'clap') p.play('clap', 0.3, (m.bpm || 124) / 124 * 0.98);
        } else if (p.curName === 'idle' || p.curName === 'clap' || p.curName === 'drink') {
          if (Math.random() < dt * (0.6 + b.groove)) p.play(pick(st.dance), 0.6, P.tempo * ((m.bpm || 124) / 124));
        }
        if (p.style === 'filmer' && building && b.anticipation > 0.5 && p.holding !== 'phone') p.hold('phone');
      } else if (p.curName !== 'idle' && p.curName !== 'talk') p.play(Math.random() < 0.4 ? 'talk' : 'idle', 0.8);
      // drift back home, pushers creep toward the front
      if (p.pusher && m.playing && Math.random() < dt * 0.05) p.home.z = Math.max(-5.0, p.home.z - 0.5);
      p.pos.x += (p.home.x - p.pos.x) * dt * 0.6;
      p.pos.z += (p.home.z - p.pos.z) * dt * 0.6;
      p.yaw += (Math.PI + Math.sin(now * 0.3 + P.phase) * 0.25 - p.yaw) * dt * 1.5; // face the DJ
      // go to the bar when thirsty and the music isn't peaking
      if (b.thirst > 1 && sec !== 'drop' && sec !== 'build' && p.react <= 0 && Math.random() < dt * 0.3) {
        const slot = this.barSlots.filter((s) => !s.taken).sort((a, c) => Math.abs(a.x - p.pos.x) - Math.abs(c.x - p.pos.x))[0];
        if (slot) {
          slot.taken = p;
          p.slot = slot;
          p.state = 'toBar';
          p.hold(null);
          p.path = [new THREE.Vector3(p.pos.x * 0.8, 0, Math.max(p.pos.z, 5.8)), new THREE.Vector3(slot.x, 0, slot.z)];
          p.play('walk', 0.4, 1);
        }
      }
    } else if (p.state === 'toBar') {
      if (p.walk(dt, 1.0)) {
        p.state = 'waitBar';
        p.yaw = 0;
        p.play('idle', 0.4);
        p.waitT = 0;
        this.barQueue.push(p);
      }
    } else if (p.state === 'waitBar') {
      p.yaw += (0 - p.yaw) * dt * 4;
      p.waitT += dt;
      if (p.served) {
        p.served = false;
        p.hold(pick(['beer', 'beer', 'cup', 'cocktail']));
        b.thirst = 0;
        p.slot.taken = null;
        p.slot = null;
        p.state = 'fromBar';
        p.path = [new THREE.Vector3(p.home.x * 0.8, 0, Math.max(p.home.z, 5.8)), p.home.clone()];
        p.play('walk', 0.4, 1);
      }
    } else if (p.state === 'fromBar') {
      if (p.walk(dt, 1.0)) {
        p.state = 'dance';
        p.play(Math.random() < 0.5 ? 'drink' : pick(STYLES[p.style].dance), 0.5, P.tempo);
        p.react = 2;
      }
    } else if (p.state === 'lounge') {
      b.fatigue = Math.max(0, b.fatigue - dt * 0.01);
      p.yaw = p.seat.ry;
      p.pos.set(p.seat.x, 0, p.seat.z);
    }
  }

  updateBartender(p, dt) {
    if (p.job) {
      const j = p.job;
      j.t += dt;
      if (j.phase === 'go') {
        if (p.walk(dt, 1.3)) {
          j.phase = 'take';
          j.t = 0;
          p.yaw = Math.PI;
          p.play('talk', 0.3);
        }
      } else if (j.phase === 'take' && j.t > 1.8) {
        j.phase = 'make';
        j.t = 0;
        p.yaw = 0;
        p.play('drink', 0.3, 1.6); // shaking / pouring at the back bar
        p.hold(pick(['cup', 'beer', 'cocktail']));
      } else if (j.phase === 'make' && j.t > 3) {
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
      if (p.job && p.job.phase !== 'go') p.root.rotation.y = p.yaw;
      return;
    }
    const waiting = this.barQueue.find((c) => c.state === 'waitBar' && !c.claimed);
    if (waiting) {
      waiting.claimed = true;
      this.barQueue = this.barQueue.filter((c) => c !== waiting);
      p.job = { customer: waiting, phase: 'go', t: 0 };
      p.path = [new THREE.Vector3(waiting.pos.x, 0, 9.15)];
      p.play('walk', 0.3, 1.1);
      setTimeout(() => (waiting.claimed = false), 30000);
    } else if (p.curName === 'walk') p.play('idle', 0.4);
  }

  updateGuard(p, dt) {
    const pl = this.player;
    const d = pl ? Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z) : 99;
    let target = p.homeYaw;
    if (d < 3.5) target = Math.atan2(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z);
    let diff = ((target - p.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    p.yaw += diff * Math.min(1, dt * 3);
    if (p.scanning) {
      p.scanning -= dt;
      if (p.curName !== 'talk') p.play('talk', 0.25);
      if (p.scanning <= 0) {
        p.scanning = 0;
        p.play('idle', 0.5, 0.8);
      }
    }
  }

  updateDancer(p, dt, m) {
    if (!m.playing && p.curName !== 'idle') p.play('idle', 0.8);
    else if (m.playing && p.curName === 'idle') p.play(p.danceClip, 0.8, (m.bpm || 124) / 124);
  }

  updateDJ(p, dt, m, now) {
    // hands: rest over the mixer, reach for the exact control on each gesture
    const B = this.booth;
    const restL = new THREE.Vector3(0.12, B.topY + 0.16, -8.15);
    const restR = new THREE.Vector3(-0.12, B.topY + 0.16, -8.15);
    for (const [side, rest] of [
      ['left', restL],
      ['right', restR],
    ]) {
      const h = this.djHands[side];
      const active = now >= (h.start || 0) - 0.25 && now <= h.until;
      const goal = active ? h.target : rest;
      if (!h.cur) h.cur = rest.clone();
      h.cur.lerp(goal, Math.min(1, dt * (active ? 7 : 3)));
      h.w += ((m.playing ? 0.85 : 0.5) - h.w) * dt * 2;
      const chain = side === 'left' ? ['LeftArm', 'LeftForeArm', 'LeftHand'] : ['RightArm', 'RightForeArm', 'RightHand'];
      ik(chain.map((n) => p.bones[n]), h.cur, h.w);
    }
    // the big drops: hand up
    if (m.playing && m.section === 'drop' && m.bar !== this.djHandUpBar && m.beatInBar === 0 && Math.random() < 0.004) {
      this.djHandUpBar = m.bar;
      this.djHands.right.target.set(-0.35, B.topY + 0.95, -8.4);
      this.djHands.right.start = now;
      this.djHands.right.until = now + 1.6;
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
      // camera look dir L=(sin yaw, cos yaw), right R=(-cos yaw, sin yaw)
      const wx = -mz * Math.sin(yaw) - mx * Math.cos(yaw);
      const wz = -mz * Math.cos(yaw) + mx * Math.sin(yaw);
      const speed = run ? 2.6 : 1.4;
      const nx = p.pos.x + wx * speed * dt;
      const nz = p.pos.z + wz * speed * dt;
      const from = zoneAt(p.pos.x, p.pos.z);
      const to = zoneAt(nx, nz);
      const needs = (PRIVATE[to] || to === 'lounge') && to !== from && !this.cleared[to] && !(from === 'stage' && to === 'booth') && !(from === 'stage' && to === 'backstage' && this.cleared.stage);
      if (needs) {
        this.requestAccess(p, to);
      } else {
        if (!collides(nx, p.pos.z, 0.25)) p.pos.x = nx;
        if (!collides(p.pos.x, nz, 0.25)) p.pos.z = nz;
        const target = Math.atan2(wx, wz);
        let diff = ((target - p.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        p.yaw += diff * Math.min(1, dt * 10);
        p.play('walk', 0.25, run ? 1.75 : 1.0);
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
    const v = new THREE.Vector3();
    let best = null;
    let bd = 60;
    for (const p of this.crowd) {
      p.head(v);
      v.project(camera);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * w;
      const sy = ((1 - v.y) / 2) * h;
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

// lightweight CCD IK for a 3-bone arm chain, blended over the animated pose
const _e = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
function ik(chain, target, weight) {
  const [arm, fore, hand] = chain;
  if (!arm || !fore || !hand || weight <= 0.01) return;
  const q0a = arm.quaternion.clone();
  const q0f = fore.quaternion.clone();
  for (let it = 0; it < 5; it++) {
    for (const bone of [fore, arm]) {
      bone.updateMatrixWorld(true);
      hand.getWorldPosition(_e);
      bone.getWorldPosition(_b);
      _v1.subVectors(_e, _b).normalize();
      _v2.subVectors(target, _b).normalize();
      const dot = Math.max(-1, Math.min(1, _v1.dot(_v2)));
      const ang = Math.acos(dot);
      if (ang < 1e-3) continue;
      _ax.crossVectors(_v1, _v2);
      if (_ax.lengthSq() < 1e-10) continue;
      _ax.normalize();
      bone.getWorldQuaternion(_wq);
      _ax.applyQuaternion(_wq.invert());
      _q.setFromAxisAngle(_ax, Math.min(ang, 0.5));
      bone.quaternion.multiply(_q);
    }
  }
  arm.quaternion.copy(q0a.slerp(arm.quaternion, weight));
  fore.quaternion.copy(q0f.slerp(fore.quaternion, weight));
  arm.updateMatrixWorld(true);
}
