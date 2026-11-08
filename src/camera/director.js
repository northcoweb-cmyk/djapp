// Camera director: cinematic shots (each with its own slow move), quick cuts on number keys,
// and an auto-director that cuts on the music — long shots in breakdowns, faster cuts through
// a build, a cut on every beat in the last bar, a hard cut on the drop, then rapid cuts.
import * as THREE from 'three';
import { zoneAt } from '../scene/nav.js';
import { STAGE } from '../scene/nav.js';

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ease = (x) => x * x * (3 - 2 * x);
const noise = (t, s) => Math.sin(t * 1.3 + s) * 0.5 + Math.sin(t * 2.7 + s * 3.1) * 0.3 + Math.sin(t * 5.3 + s * 7.7) * 0.2;

export const SHOTS = [
  { id: 'wide', key: '1', label: 'Wide', fov: 55 },
  { id: 'djclose', key: '2', label: 'DJ close', fov: 42 },
  { id: 'fisheye', key: '3', label: 'Deck cam', fov: 115 },
  { id: 'behind', key: '4', label: 'Behind DJ', fov: 62 },
  { id: 'side', key: '5', label: 'Side stage', fov: 50 },
  { id: 'crowd', key: '6', label: 'In the crowd', fov: 62 },
  { id: 'phone', key: '7', label: 'Phone', fov: 66 },
  { id: 'balcony', key: '8', label: 'Balcony', fov: 52 },
  { id: 'drone', key: '9', label: 'Drone', fov: 74 },
  { id: 'topdown', key: '0', label: 'Overhead', fov: 70 },
  { id: 'crane', key: '', label: 'Crane', fov: 58 },
  { id: 'bar', key: '', label: 'Bar', fov: 54 },
  { id: 'djpov', key: '', label: 'DJ POV', fov: 64 },
  { id: 'orbit', key: 'O', label: 'Free orbit', fov: 60 },
  { id: 'play', key: 'P', label: 'Owner (WASD)', fov: 62 },
];
const POOLS = {
  drop: ['behind', 'wide', 'crowd', 'djclose', 'side', 'crane', 'topdown', 'fisheye', 'drone', 'phone'],
  groove: ['wide', 'djclose', 'side', 'crowd', 'behind', 'balcony', 'bar', 'crane', 'drone', 'djpov'],
  build: ['djclose', 'fisheye', 'side', 'crowd', 'behind', 'djpov'],
  calm: ['wide', 'balcony', 'drone', 'crane', 'bar', 'topdown', 'side'],
  dropHit: ['behind', 'wide', 'crane', 'crowd'],
};

export class Director {
  constructor(camera, controls, ctx) {
    this.camera = camera;
    this.controls = controls;
    this.ctx = ctx; // { people(), booth, input, fisheye, onChange }
    this.mode = 'wide';
    this.auto = false;
    this.t = 0;
    this.lastCut = 0;
    this.recent = [];
    this.barsInShot = 0;
    this.lastBar = -1;
    this.lastBeat = -1;
    this.dropRun = 0;
    this.dropCue = false;
    this.seed = Math.random() * 100;
    this.drone = { pos: new THREE.Vector3(-10, 5, 8), vel: new THREE.Vector3(), i: 0, roll: 0, look: new THREE.Vector3(0, 2, -6) };
    this.droneWP = [
      [-10, 5, 8],
      [-6, 3.2, 2],
      [0, 2.8, -2],
      [5, 3.4, -4.5],
      [8, 5.5, -1],
      [6, 6.6, 5],
      [0, 6.8, 3],
      [-6, 4.2, 6],
      [0, 3.5, 7.6],
      [8, 2.8, 6.5],
      [12, 3.2, 2],
      [3, 4.5, -3],
    ].map((a) => new THREE.Vector3(...a));
    this.phoneHolder = null;
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
  }
  shot(id) {
    return SHOTS.find((s) => s.id === id) || SHOTS[0];
  }
  setShot(id, fromAuto = false) {
    if (!fromAuto) this.auto = false;
    const prev = this.mode;
    this.mode = id;
    this.t = 0;
    this.seed = Math.random() * 100;
    this.barsInShot = 0;
    this.lastCut = performance.now() / 1000;
    this.recent.unshift(id);
    this.recent.length = Math.min(4, this.recent.length);
    const s = this.shot(id);
    this.camera.fov = s.fov;
    this.camera.up.copy(UP);
    this.camera.updateProjectionMatrix();
    this.controls.enabled = id === 'orbit';
    this.ctx.input.active = id === 'play';
    this.ctx.fisheye.enabled = id === 'fisheye';
    if (id === 'phone') this.pickPhone();
    else if (this.phoneHolder) {
      this.phoneHolder.forceAnim = false;
    }
    if (id === 'orbit' && prev !== 'orbit') {
      this.controls.target.set(0, 1.6, -2.5);
    }
    this.ctx.onChange && this.ctx.onChange(id);
  }
  toggleAuto() {
    this.auto = !this.auto;
    if (this.auto && (this.mode === 'orbit' || this.mode === 'play')) this.cutTo(POOLS.groove);
    this.ctx.onChange && this.ctx.onChange(this.mode);
  }
  cycle(dir) {
    const list = SHOTS.filter((s) => s.id !== 'play');
    const i = list.findIndex((s) => s.id === this.mode);
    this.setShot(list[(i + dir + list.length) % list.length].id);
  }
  pickPhone() {
    const people = this.ctx.people();
    if (!people) return;
    if (this.phoneHolder) this.phoneHolder.forceAnim = false;
    const c = people.crowd.filter((p) => p.state === 'dance').sort((a, b) => a.home.z - b.home.z);
    const mid = c.slice(Math.floor(c.length * 0.3), Math.floor(c.length * 0.8));
    const f = mid.filter((p) => p.style === 'filmer');
    const pool = f.length ? f : mid.length ? mid : c;
    this.phoneHolder = pool[Math.floor(Math.random() * pool.length)] || null;
    if (this.phoneHolder) this.phoneHolder.forceAnim = true;
  }
  cutTo(pool) {
    const avoid = new Set(this.recent.slice(0, 2));
    let options = pool.filter((id) => !avoid.has(id));
    if (this.recent.includes('phone')) options = options.filter((id) => id !== 'phone' || Math.random() < 0.3);
    if (!options.length) options = pool;
    this.setShot(options[Math.floor(Math.random() * options.length)], true);
  }
  onDrop() {
    this.dropCue = true;
  }
  autoDirect(m, now) {
    if (!m.playing) {
      if (now - this.lastCut > 9) this.cutTo(POOLS.calm);
      return;
    }
    const barChanged = m.bar !== this.lastBar;
    const beatChanged = m.beat !== this.lastBeat;
    this.lastBar = m.bar;
    this.lastBeat = m.beat;
    if (this.dropCue) {
      this.dropCue = false;
      this.dropRun = 8;
      return this.cutTo(POOLS.dropHit);
    }
    const sec = m.section;
    if (sec === 'build' && m.toDrop < m.barSec * 1.02 && beatChanged) return this.cutTo(POOLS.build);
    if (!barChanged) return;
    this.barsInShot++;
    let hold;
    if (sec === 'drop') hold = this.dropRun > 0 ? 1 + (Math.random() < 0.4 ? 1 : 0) : 2;
    else if (sec === 'build') hold = m.toDrop < 4 * m.barSec ? 1 : 2;
    else if (sec === 'groove') hold = 4;
    else hold = 8;
    if (this.dropRun > 0) this.dropRun--;
    if (this.barsInShot >= hold) {
      const pool = sec === 'drop' ? POOLS.drop : sec === 'build' ? POOLS.build : sec === 'groove' ? POOLS.groove : POOLS.calm;
      this.cutTo(pool);
    }
  }

  update(dt, T, m) {
    const now = performance.now() / 1000;
    if (this.auto) this.autoDirect(m, now);
    this.t += dt;
    const cam = this.camera;
    const t = this.t;
    const S = this.seed;
    const people = this.ctx.people();
    const B = this.ctx.booth;
    const kick = m.playing ? Math.pow(1 - m.beatFrac, 4) : 0;
    const energy = m.playing ? m.energy : 0.2;
    switch (this.mode) {
      case 'orbit':
        this.controls.update();
        return;
      case 'wide': {
        const z = 9.4 - Math.min(1, t / 24) * 1.6;
        cam.position.set(Math.sin(T * 0.05 + S) * 2.6, 4.7 + Math.sin(t * 0.2) * 0.15, z);
        cam.lookAt(0, 2.3, -6);
        break;
      }
      case 'djclose': {
        let hx = 0;
        let hy = 2.75;
        if (people) {
          people.dj.head(v1);
          hx = v1.x;
          hy = v1.y;
        }
        const ang = Math.sin(t * 0.18 + S) * 0.45;
        const r = 2.6 - Math.min(1, t / 14) * 0.7;
        cam.position.set(hx + Math.sin(ang) * r, hy - 0.15 + Math.sin(t * 0.3) * 0.05, -8.72 + Math.cos(ang) * r);
        this.look(hx, hy - 0.25, -8.6, dt, 6);
        break;
      }
      case 'fisheye':
        cam.position.set(0, STAGE.y + 1.22, -7.28);
        cam.lookAt(0, STAGE.y + 1.55, -8.8);
        break;
      case 'behind': {
        const sway = Math.sin(t * 0.12 + S) * 0.9;
        cam.position.set(sway, 3.65 + Math.sin(t * 0.25) * 0.1, -9.8);
        cam.lookAt(sway * 0.4, 1.0, -1);
        break;
      }
      case 'side': {
        const s = Math.sin(S) > 0 ? 1 : -1;
        cam.position.set(s * (6.2 - Math.min(1, t / 20) * 1.2), 2.45, -8.3 + Math.sin(t * 0.15) * 0.3);
        cam.lookAt(-s * 1.5, 2.1, -4.2);
        break;
      }
      case 'crowd': {
        const h = 0.025 + energy * 0.02;
        cam.position.set(-2.2 + Math.sin(S) * 2 + noise(T * 0.7, S) * h * 4, 1.3 + noise(T * 1.3, S + 1) * h + kick * 0.03, 0.8 + noise(T * 0.9, S + 2) * h * 3);
        cam.lookAt(Math.sin(t * 0.3) * 1.2, 3.4, -9);
        break;
      }
      case 'phone': {
        const p = this.phoneHolder;
        if (!p) {
          this.pickPhone();
          break;
        }
        p.head(v1);
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        const shake = (m.playing ? 0.008 + energy * 0.01 : 0.004) * (p.yOff > 0.02 ? 3 : 1);
        cam.position.set(v1.x + fx * 0.32 + noise(T * 6, S) * shake, v1.y + 0.08 + noise(T * 7, S + 3) * shake, v1.z + fz * 0.32 + noise(T * 5, S + 5) * shake);
        cam.lookAt(Math.sin(T * 0.4) * 0.8, 2.6, -9);
        cam.rotateZ(noise(T * 1.5, S + 7) * 0.04);
        break;
      }
      case 'balcony':
        cam.position.set(-12.9, 5.75 + Math.sin(t * 0.2) * 0.05, 1.5 + Math.sin(t * 0.07 + S) * 2.2);
        cam.lookAt(0, 2.0, -5.5);
        break;
      case 'drone':
        this.updateDrone(dt, T);
        break;
      case 'topdown': {
        cam.position.set(Math.sin(t * 0.05) * 1.5, 7.25, -0.8);
        cam.up.set(Math.sin(t * 0.06 + S), 0, -Math.cos(t * 0.06 + S));
        cam.lookAt(0, 0, -0.8);
        break;
      }
      case 'crane': {
        const k = ease(Math.min(1, t / 14));
        const a = -1.0 + 2.0 * k;
        cam.position.set(Math.sin(a) * 7.5, 2.6 + Math.sin(k * Math.PI) * 3.2, Math.cos(a) * 6.5 - 1.5);
        cam.lookAt(0, 2.2, -7.5);
        break;
      }
      case 'bar':
        cam.position.set(3.2 + Math.sin(t * 0.1 + S) * 1.5, 1.95, 9.25);
        cam.lookAt(0, 1.8, 1.5);
        break;
      case 'djpov': {
        if (!people) break;
        people.dj.head(v1);
        cam.position.set(v1.x, v1.y + 0.06, v1.z + 0.1);
        this.look(people.dj.pos.x * 0.5, 1.15, -3.5, dt, 5);
        break;
      }
      case 'play':
        this.updatePlay(dt);
        break;
    }
  }
  look(x, y, z, dt, k) {
    v2.set(x, y, z);
    if (this.t < 0.05) this.smoothLook.copy(v2);
    this.smoothLook.lerp(v2, Math.min(1, dt * k));
    this.camera.lookAt(this.smoothLook);
  }
  updateDrone(dt, T) {
    const d = this.drone;
    const wp = this.droneWP[d.i];
    v1.subVectors(wp, d.pos);
    const dist = v1.length();
    if (dist < 1.2) d.i = (d.i + 1) % this.droneWP.length;
    const desired = v1.normalize().multiplyScalar(Math.min(3.0, dist * 1.2));
    const acc = desired.sub(d.vel).clampLength(0, 2.3);
    d.vel.addScaledVector(acc, dt);
    d.vel.multiplyScalar(1 - dt * 0.15);
    d.pos.addScaledVector(d.vel, dt);
    d.pos.y += Math.sin(T * 1.7) * 0.003;
    const fwd = v2.copy(d.vel).normalize();
    const lateral = acc.x * -fwd.z + acc.z * fwd.x;
    d.roll += (-lateral * 0.09 - d.roll) * dt * 2;
    v2.copy(d.pos).addScaledVector(d.vel, 2.5).lerp(new THREE.Vector3(0, 2.2, -7), 0.55);
    d.look.lerp(v2, dt * 1.5);
    this.camera.position.copy(d.pos);
    this.camera.lookAt(d.look);
    this.camera.rotateZ(d.roll);
  }
  updatePlay(dt) {
    const people = this.ctx.people();
    if (!people) return;
    const p = people.player;
    const input = this.ctx.input;
    const py = p.root.position.y;
    const cam = this.camera;
    if (zoneAt(p.pos.x, p.pos.z, p.level) === 'booth') {
      const side = p.pos.x >= 0 ? 1 : -1;
      v2.set(p.pos.x + side * 0.25, py + 2.0, Math.min(p.pos.z, -8.55) - 0.25);
      cam.position.lerp(v2, Math.min(1, dt * 7));
      cam.lookAt(side * 0.2, this.ctx.booth.topY + 0.05, -7.95);
      if (!this.boothHint) {
        this.boothHint = true;
        this.ctx.toast && this.ctx.toast('You are in the DJ booth', 'Watching the decks. Walk out to leave.', 1.2);
      }
      return;
    }
    const back = v1.set(Math.sin(input.camYaw), 0, Math.cos(input.camYaw));
    const dist = 3.2;
    const target = new THREE.Vector3(p.pos.x, py + 1.65, p.pos.z);
    const want = v2.copy(target).addScaledVector(back, -dist * Math.cos(input.camPitch));
    want.y += dist * Math.sin(input.camPitch);
    const xmin = p.pos.x < -15 ? -18.8 : -14.6;
    want.x = Math.max(xmin, Math.min(14.6, want.x));
    want.z = Math.max(-13.6, Math.min(9.6, want.z));
    want.y = Math.max(py + 0.6, Math.min(p.level === 1 ? 7.4 : py < 0.5 && p.pos.x < -11.6 ? 3.5 : 7.2, want.y));
    cam.position.lerp(want, Math.min(1, dt * 8));
    cam.lookAt(target);
  }
}
