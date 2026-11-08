// Navigation for the club: walkable areas per level (0 = ground, 1 = balcony), obstacles,
// floor heights (stage, stairs, lounge, balcony ramp), zones, points of interest and a
// waypoint graph (line-of-sight edges + explicit stair edge) with Dijkstra path finding.
export const FEATURES = { balcony: true, restrooms: true };

export const ROOM = { x0: -15, x1: 15, z0: -10, z1: 10, h: 8 };
export const STAGE = { x0: -7, x1: 7, z0: -10, z1: -6, y: 1.0 };
export const BAR = { x0: -7, x1: 7, zc: 8.4 };
export const LOUNGE = { x0: 10.5, x1: 14.6, z0: -3, z1: 8.5, y: 0.35 };
export const BALCONY = { x0: -15, x1: -11.6, z0: -3.8, z1: 9.4, y: 4.0 };
export const STAIR = { x0: -11.6, x1: -10.4, z0: -6.8, z1: -1.6 }; // ramp, bottom at z0
export const LANDING = { x0: -11.6, x1: -10.4, z0: -1.6, z1: -0.8 };
export const WC = {
  m: { x0: -19, x1: -15, z0: -0.4, z1: 2.6, door: [0.6, 1.6] },
  w: { x0: -19, x1: -15, z0: 2.8, z1: 5.8, door: [3.8, 4.8] },
};
export const DANCE = { x0: -8.6, x1: 8.6, z0: -5.1, z1: 5.3 };
export const PRIVATE = { backstage: 'Backstage', stage: 'Stage', booth: 'DJ booth', barstaff: 'Behind the bar' };

const R = (x0, z0, x1, z1) => [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
export const walkable = [[], []];
export const blocked = [[], []];
const inR = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
const rectOf = (o) => [o.x0, o.z0, o.x1, o.z1];

export const POI = { bar: [], lounge: [], balconySeats: [], balconyRail: [], wc: { m: null, w: null }, entrance: { x: -14.0, z: 7.4 } };

export function rebuildNav() {
  for (const l of [0, 1]) {
    walkable[l].length = 0;
    blocked[l].length = 0;
  }
  const W0 = walkable[0];
  const B0 = blocked[0];
  const W1 = walkable[1];
  const B1 = blocked[1];
  // ---- ground ----
  W0.push(R(-15, -10, 15, 10), R(-8, -14, 8.2, -10), R(6.2, -10.3, 7.6, -9.9));
  // perimeter walls
  B0.push(R(15, -10.3, 15.3, 10.3), R(-15.3, 10, 15.3, 10.3), R(-15.2, -10.25, 6.2, -9.95), R(7.6, -10.25, 15.2, -9.95));
  B0.push(R(-8.15, -14.2, -7.85, -10), R(8.05, -14.2, 8.35, -10), R(-8.2, -14.3, 8.4, -14.0));
  if (FEATURES.restrooms) {
    W0.push(rectOf(WC.m), rectOf(WC.w), R(-15.3, WC.m.door[0], -14.9, WC.m.door[1]), R(-15.3, WC.w.door[0], -14.9, WC.w.door[1]));
    B0.push(R(-15.3, -10, -15, WC.m.door[0]), R(-15.3, WC.m.door[1], -15, WC.w.door[0]), R(-15.3, WC.w.door[1], -15, 10.3));
    B0.push(R(-19.3, -0.7, -19, 6.1), R(-19.3, -0.7, -15, -0.4), R(-19.3, 5.8, -15, 6.1), R(-19, 2.6, -15, 2.8));
    // stalls (partitions + front panels with door gaps), sinks, urinals
    for (const [z0, z1, zs] of [
      [-0.4, 2.6, [0.1, 1.05, 2.0]],
      [2.8, 5.8, [3.35, 4.3, 5.25]],
    ]) {
      B0.push(R(-19, (zs[0] + zs[1]) / 2 - 0.03, -17.7, (zs[0] + zs[1]) / 2 + 0.03), R(-19, (zs[1] + zs[2]) / 2 - 0.03, -17.7, (zs[1] + zs[2]) / 2 + 0.03));
      let prev = z0;
      for (const z of zs) {
        B0.push(R(-17.75, prev, -17.65, z - 0.3));
        prev = z + 0.3;
      }
      B0.push(R(-17.75, prev, -17.65, z1));
    }
    B0.push(R(-17.4, -0.4, -15.5, 0.0), R(-17.4, 5.4, -15.5, 5.8), R(-17.4, 2.25, -15.8, 2.6));
  } else B0.push(R(-15.3, -10, -15, 10.3));
  // columns
  for (const [x, z] of [
    [-9.5, -3],
    [9.5, -3],
    [-9.5, 4],
    [9.5, 4],
  ])
    B0.push(R(x - 0.25, z - 0.25, x + 0.25, z + 0.25));
  // stage edge, booth, monitors, subs, barrier
  B0.push(R(-7, -6.3, 7, -6.0), R(-1.2, -8.45, 1.2, -7.55), R(-2.4, -7.85, -1.8, -7.35), R(1.8, -7.85, 2.4, -7.35));
  B0.push(R(-6.2, -5.45, -5.0, -4.55), R(5.0, -5.45, 6.2, -4.55), R(-7, -5.7, 7, -5.5));
  // bar: counter + back bar
  B0.push(R(-7.2, 8.0, 7.2, 8.8), R(-7.2, 9.4, 7.2, 10));
  // lounge rope (gap at z 2.2..3.0), couches, tables
  B0.push(R(10.45, -3, 10.55, 2.2), R(10.45, 3.0, 10.55, 8.5));
  for (const zc of [-1.6, 2.4, 6.4]) B0.push(R(13.45, zc - 1.4, 14.7, zc + 1.4), R(12.1, zc - 0.5, 13.1, zc + 0.5));
  // entrance: coat check counter, ID podium, ATM, vending machine
  B0.push(R(-14.1, 8.9, -12.3, 9.5), R(-13.2, 5.55, -12.6, 6.05), R(-11.45, 9.45, -10.75, 10), R(-10.1, 9.3, -9.1, 10));
  // backstage furniture
  B0.push(R(-5.2, -14, -2.8, -12.9), R(2.5, -13.8, 4.5, -13.0), R(6.2, -13.95, 7.0, -13.25));
  // balcony support pillars + stairs (rails, under-stair storage)
  if (FEATURES.balcony) {
    for (const z of [-3.5, -0.5, 2.5, 5.5, 8.5]) B0.push(R(-11.85, z - 0.1, -11.65, z + 0.1));
    W0.push(rectOf(STAIR));
    B0.push(R(-11.65, STAIR.z0, -11.55, STAIR.z1), R(-10.45, STAIR.z0, -10.35, LANDING.z1), R(-11.6, -3.8, -10.4, LANDING.z1));
    // ---- balcony level ----
    W1.push(rectOf(BALCONY), rectOf(LANDING), rectOf(STAIR));
    B1.push(R(-15.3, -4.1, -15, 9.7), R(-15, 9.4, -11.6, 9.7), R(-15, -4.1, -11.6, -3.8));
    B1.push(R(-11.65, -3.8, -11.55, LANDING.z0), R(-11.65, LANDING.z1, -11.55, 9.4));
    B1.push(R(-10.45, STAIR.z0, -10.35, LANDING.z1), R(-11.6, LANDING.z1 - 0.05, -10.4, LANDING.z1 + 0.05), R(-11.65, STAIR.z0, -11.55, STAIR.z1));
    for (const zc of [-2.2, 1.6, 5.2, 8.2]) B1.push(R(-15, zc - 1.2, -14.1, zc + 1.2), R(-13.7, zc - 0.35, -13.1, zc + 0.35));
  }
  // ---- points of interest ----
  POI.bar.length = 0;
  for (let x = -6; x <= 6.01; x += 1.2) POI.bar.push({ x, z: BAR.zc - 0.85, yaw: 0, taken: null });
  POI.lounge.length = 0;
  for (const zc of [-1.6, 2.4, 6.4]) for (let k = -1; k <= 1; k++) POI.lounge.push({ x: 13.75, z: zc + k * 0.8, level: 0, yaw: -Math.PI / 2, taken: null, seat: true });
  POI.balconySeats.length = 0;
  POI.balconyRail.length = 0;
  if (FEATURES.balcony) {
    for (const zc of [-2.2, 1.6, 5.2, 8.2]) for (let k = -1; k <= 1; k++) POI.balconySeats.push({ x: -14.35, z: zc + k * 0.75, level: 1, yaw: Math.PI / 2, taken: null, seat: true });
    for (let z = -3.2; z <= 9.0; z += 0.85) if (z < -1.8 || z > -0.6) POI.balconyRail.push({ x: -11.98, z, level: 1, yaw: Math.PI / 2, taken: null });
  }
  if (FEATURES.restrooms) {
    POI.wc.m = {
      door: { x: -14.4, z: 1.1 },
      inside: { x: -15.7, z: 1.1 },
      stalls: [0.1, 1.05, 2.0].map((z) => ({ x: -18.35, z, front: { x: -17.2, z }, yaw: Math.PI / 2, taken: null })),
      sinks: [-17.0, -16.2].map((x) => ({ x, z: 0.32, yaw: Math.PI, taken: null })),
      urinals: [-17.0, -16.3].map((x) => ({ x, z: 2.0, yaw: 0, taken: null })),
    };
    POI.wc.w = {
      door: { x: -14.4, z: 4.3 },
      inside: { x: -15.7, z: 4.3 },
      stalls: [3.35, 4.3, 5.25].map((z) => ({ x: -18.35, z, front: { x: -17.2, z }, yaw: Math.PI / 2, taken: null })),
      sinks: [-17.0, -16.2].map((x) => ({ x, z: 5.0, yaw: 0, taken: null })),
      urinals: [],
    };
  }
  buildGraph();
}

export function collides(x, z, r = 0.22, level = 0) {
  const W = walkable[level];
  let ok = false;
  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    if (x >= w[0] && x <= w[2] && z >= w[1] && z <= w[3]) {
      ok = true;
      break;
    }
  }
  if (!ok) return true;
  const B = blocked[level];
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return true;
  }
  return false;
}

export function onStair(x, z) {
  return FEATURES.balcony && x >= STAIR.x0 && x <= STAIR.x1 && z >= STAIR.z0 && z <= STAIR.z1;
}
export function stairY(z) {
  return BALCONY.y * Math.max(0, Math.min(1, (z - STAIR.z0) / (STAIR.z1 - STAIR.z0)));
}
// keep an agent's level in sync while it walks the stairs
export function levelAfterMove(x, z, level) {
  if (onStair(x, z)) return stairY(z) > 2 ? 1 : 0;
  return level;
}

export function floorY(x, z, level = 0) {
  if (onStair(x, z)) return stairY(z);
  if (level === 1) return BALCONY.y;
  if (z < -6 && z > -10 && Math.abs(x) < 7) return STAGE.y;
  if (z < -6 && z > -8.6 && Math.abs(x) >= 7 && Math.abs(x) < 8.3) return STAGE.y * Math.max(0, Math.min(1, (8.3 - Math.abs(x)) / 1.3));
  if (z < -10.05 && z > -14) return STAGE.y;
  if (x > LOUNGE.x0 && z > LOUNGE.z0 && z < LOUNGE.z1) return LOUNGE.y;
  return 0;
}

export function zoneAt(x, z, level = 0) {
  if (level === 1) return onStair(x, z) || inR(rectOf(LANDING), x, z) ? 'stairs' : 'balcony';
  if (onStair(x, z)) return 'stairs';
  if (x < -15) return z < 2.7 ? 'wc_m' : 'wc_w';
  if (z < -10.05) return 'backstage';
  if (z < -6 && x > -7.6 && x < 7.6) return z < -7.4 && Math.abs(x) < 1.9 ? 'booth' : 'stage';
  if (z > 8.85 && Math.abs(x) < 7.6) return 'barstaff';
  if (x > LOUNGE.x0 && z > -3.2 && z < 8.8) return 'lounge';
  return 'floor';
}

// ---------------- waypoint graph ----------------
let nodes = [];
let adj = [];
function N(x, z, level = 0) {
  nodes.push({ x, z, level, id: nodes.length });
}
// straight-line walkability (used to straighten paths while walking)
export function canWalk(ax, az, bx, bz, level) {
  return losClear(ax, az, bx, bz, level, 0.2);
}
function losClear(ax, az, bx, bz, level, r = 0.2) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (collides(x, z, r, level)) return false;
    if (FEATURES.balcony && (onStair(x, z) || inR(rectOf(LANDING), x, z))) return false;
    if (level === 0 && PRIVATE[zoneAt(x, z, 0)]) return false;
  }
  return true;
}
function buildGraph() {
  nodes = [];
  // back aisle + side aisles + front corners
  for (const x of [-9.6, -6, -2, 2, 6, 9.6]) N(x, 6.6);
  for (const z of [-6.0, -3.0, 0, 3, 6]) N(-10.0, z);
  for (const z of [-5.5, -2, 1, 4, 6.5]) N(10.0, z);
  N(-12.5, -7.5);
  N(-9.2, -7.2);
  N(12.5, -7.5);
  N(9.2, -7.2);
  N(-8.3, -5.0);
  N(8.3, -5.0);
  N(-13.3, 0.5);
  N(-13.3, 3.4);
  N(-13.3, 6.4);
  N(POI.entrance.x, POI.entrance.z);
  N(11.0, 2.6); // lounge entry
  N(12.0, -1.6);
  N(12.0, 2.4);
  N(12.0, 6.4);
  // dance-floor interior points (walkers weave through)
  for (const x of [-6, -2, 2, 6]) for (const z of [-3.5, 0, 3.5]) N(x, z);
  if (FEATURES.restrooms) {
    for (const k of ['m', 'w']) {
      const w = POI.wc[k];
      N(w.door.x, w.door.z);
      N(w.inside.x, w.inside.z);
      N(-16.8, w.inside.z);
      for (const s of w.stalls) N(s.front.x, s.front.z);
    }
  }
  let stairBottom = -1;
  let stairTop = -1;
  if (FEATURES.balcony) {
    stairBottom = nodes.length;
    N(-11.0, -7.3, 0);
    stairTop = nodes.length;
    N(-11.0, -1.2, 1);
    N(-12.3, -1.2, 1);
    for (const z of [-3.3, 0.6, 3.4, 6.6, 9.0]) N(-12.5, z, 1);
  }
  adj = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.level !== b.level) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 9) continue;
      if (losClear(a.x, a.z, b.x, b.z, a.level)) {
        adj[i].push([j, d]);
        adj[j].push([i, d]);
      }
    }
  if (stairBottom >= 0) {
    const d = 6.4;
    adj[stairBottom].push([stairTop, d]);
    adj[stairTop].push([stairBottom, d]);
    // landing -> balcony walkway (through the railing gap)
    adj[stairTop].push([stairTop + 1, 1.3]);
    adj[stairTop + 1].push([stairTop, 1.3]);
  }
}

function nearestNode(x, z, level) {
  let best = -1;
  let bd = 1e9;
  for (const n of nodes) {
    if (n.level !== level) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd && (d < 1.2 || losClear(x, z, n.x, n.z, level, 0.15))) {
      bd = d;
      best = n.id;
    }
  }
  if (best < 0)
    for (const n of nodes)
      if (n.level === level) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) {
          bd = d;
          best = n.id;
        }
      }
  return best;
}

// returns [{x, z}] ending at the target
export function findPath(fx, fz, flevel, tx, tz, tlevel) {
  if (flevel === tlevel && losClear(fx, fz, tx, tz, flevel, 0.15)) return [{ x: tx, z: tz }];
  const a = nearestNode(fx, fz, flevel);
  const b = nearestNode(tx, tz, tlevel);
  if (a < 0 || b < 0) return [{ x: tx, z: tz }];
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i++)
      if (!done[i] && dist[i] < bd) {
        bd = dist[i];
        u = i;
      }
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const [v, w] of adj[u])
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
  }
  const out = [];
  if (dist[b] === Infinity) return [{ x: tx, z: tz }];
  for (let v = b; v >= 0; v = prev[v]) out.unshift({ x: nodes[v].x, z: nodes[v].z });
  out.push({ x: tx, z: tz });
  return out;
}

rebuildNav();
