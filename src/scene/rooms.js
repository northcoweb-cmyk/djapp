// Environment build-out: premium bar, walkable balcony lounge with visible stairs, restrooms
// in the left wall (stalls with doors, sinks, urinals), a lit backstage green room, stage-stair
// LED edges, CO2 cannons that fire on big drops and gobo light patterns on the floor.
// Static pieces use shared materials so club.js can merge them into a handful of draw calls.
import * as THREE from 'three';
import { STAGE, BALCONY, STAIR, LANDING, BAR, WC } from './nav.js';

const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...o });

export function buildRooms(g, H) {
  const { box, mats, canvasTex, neonSign } = H;
  const R = { stallDoors: new Map(), glass: [] };
  const led = { blue: basic(0x2a5cff), purple: basic(0x7a2cff), warm: basic(0xffb46a), white: basic(0xe8f0ff), pink: basic(0xff3cc8) };
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9ab4ff, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const m4 = new THREE.Matrix4();

  // ================= BAR =================
  const onyxTex = canvasTex(1024, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#5a2a0a');
    gr.addColorStop(0.5, '#c8742a');
    gr.addColorStop(1, '#5a2a0a');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      c.strokeStyle = `rgba(255,${200 + Math.random() * 55},${150 + Math.random() * 60},${0.08 + Math.random() * 0.25})`;
      c.lineWidth = 0.5 + Math.random() * 2.5;
      c.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (Math.random() - 0.3) * 80;
        y += (Math.random() - 0.5) * 30;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  const onyx = basic(0xffffff, { map: onyxTex });
  onyx.color.setScalar(0.75);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 1.0), onyx);
  front.position.set(0, 0.55, BAR.zc - 0.37);
  front.rotation.y = Math.PI;
  g.add(front);
  box(14.4, 1.08, 0.7, mats.dark, 0, 0.54, BAR.zc);
  const granite = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.18, metalness: 0.35 });
  box(14.8, 0.07, 1.0, granite, 0, 1.12, BAR.zc);
  box(14.4, 0.015, 0.02, led.warm, 0, 1.075, BAR.zc - 0.49);
  // foot rail
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 14.2, 10), mats.chrome);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.22, BAR.zc - 0.55);
  g.add(rail);
  for (let x = -6.8; x <= 6.81; x += 1.7) box(0.03, 0.03, 0.2, mats.chrome, x, 0.22, BAR.zc - 0.45);
  // back bar: mirror wall, lit glass shelves, backlit bottles, fridges
  const mirrorTex = canvasTex(256, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#1a1c24');
    gr.addColorStop(0.5, '#3a3e4c');
    gr.addColorStop(1, '#14161c');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), basic(0xffffff, { map: mirrorTex }));
  mirror.position.set(0, 2.3, 9.97);
  mirror.rotation.y = Math.PI;
  g.add(mirror);
  box(14, 1.0, 0.55, mats.wood, 0, 0.5, 9.72);
  const fridgeTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#cfe2ff';
    c.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 18; i++) {
        c.fillStyle = ['#3a6a2a', '#8a4a10', '#c8c8c8', '#2a3a8a', '#aa2a2a'][(i + r) % 5];
        c.fillRect(6 + i * 14, 10 + r * 58, 9, 44);
      }
  });
  const fridge = basic(0xffffff, { map: fridgeTex });
  fridge.color.setScalar(0.55);
  for (const x of [-5.2, -1.7, 1.7, 5.2]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.75), fridge);
    f.position.set(x, 0.48, 9.44);
    f.rotation.y = Math.PI;
    g.add(f);
  }
  const shelfGlass = basic(0x8a9ab0);
  shelfGlass.color.setScalar(0.35);
  for (let s = 0; s < 3; s++) {
    const y = 1.45 + s * 0.5;
    box(13.6, 0.03, 0.32, shelfGlass, 0, y, 9.82);
    box(13.6, 0.012, 0.015, led.warm, 0, y - 0.02, 9.67);
  }
  const bottleGeo = new THREE.CylinderGeometry(0.035, 0.042, 0.28, 8);
  bottleGeo.translate(0, 0.14, 0);
  const neck = new THREE.CylinderGeometry(0.012, 0.03, 0.08, 6);
  neck.translate(0, 0.32, 0);
  const bGeo = mergeGeo([bottleGeo, neck]);
  const nB = 150;
  const bottles = new THREE.InstancedMesh(bGeo, basic(0xffffff), nB);
  const bcol = [0x2b8a3b, 0xb05a12, 0xd8d8d8, 0x2a4aaa, 0xaa2020, 0xe8c050, 0x6a2a8a, 0x1a6a6a];
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (let i = 0; i < nB; i++) {
    const shelf = i % 3;
    pos.set(-6.6 + (Math.floor(i / 3) / (nB / 3)) * 13.2 + Math.random() * 0.05, 1.47 + shelf * 0.5, 9.82);
    const s = 0.8 + Math.random() * 0.5;
    sc.set(1, s, 1);
    m4.compose(pos, q, sc);
    bottles.setMatrixAt(i, m4);
    bottles.setColorAt(i, new THREE.Color(bcol[(i * 7) % bcol.length]).multiplyScalar(0.55 + Math.random() * 0.3));
  }
  g.add(bottles);
  R.bottles = bottles;
  // beer taps
  for (const x of [-3, 3]) {
    box(0.9, 0.45, 0.1, mats.chrome, x, 1.38, BAR.zc + 0.15);
    const cols = [0xd8a020, 0x202020, 0xaa2020, 0x2a6a2a];
    cols.forEach((c, i) => {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 8), new THREE.MeshLambertMaterial({ color: c }));
      h.position.set(x - 0.33 + i * 0.22, 1.66, BAR.zc + 0.08);
      g.add(h);
    });
  }
  // POS screens + menu boards
  for (const x of [-6.4, 6.4]) box(0.35, 0.24, 0.03, basic(0x2a60ff), x, 1.32, BAR.zc + 0.3);
  const menuTex = canvasTex(512, 320, (c, w, h) => {
    c.fillStyle = '#0c0a10';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffb46a';
    c.lineWidth = 3;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#ffb46a';
    c.font = 'bold 40px Helvetica, Arial';
    c.fillText('COCKTAILS', 32, 64);
    c.font = '26px Helvetica, Arial';
    c.fillStyle = '#f0e6da';
    ['Sublevel Sour ........ 14', 'Midnight Mule ....... 13', 'Espresso Martini .... 15', 'Neon Spritz ......... 12', 'Draft beer ........... 8'].forEach((s, i) => c.fillText(s, 32, 116 + i * 40));
  });
  for (const x of [-4.6, 4.6]) {
    const mb = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.12), basic(0xffffff, { map: menuTex }));
    mb.material.color.setScalar(0.8);
    mb.position.set(x, 3.55, 9.96);
    mb.rotation.y = Math.PI;
    g.add(mb);
  }
  // pendant lights over the bar
  const shadeM = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
  for (let x = -6; x <= 6.01; x += 2.4) {
    box(0.01, 4.8, 0.01, mats.black, x, 5.6, BAR.zc);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.26, 16, 1, true), shadeM);
    shade.position.set(x, 3.1, BAR.zc);
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.19, 16), led.warm);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(x, 2.98, BAR.zc);
    g.add(bulb);
  }
  for (let x = -6.3; x <= 6.3; x += 1.05) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.07, 16), mats.leather);
    st.position.set(x, 0.78, BAR.zc - 0.82);
    g.add(st);
    box(0.04, 0.74, 0.04, mats.chrome, x, 0.38, BAR.zc - 0.82);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 16), mats.chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.3, BAR.zc - 0.82);
    g.add(ring);
  }
  const barSign = neonSign('SUBLEVEL BAR', '#ff9a4a', 4.2, 0.8);
  barSign.position.set(0, 4.45, 9.95);
  barSign.rotation.y = Math.PI;
  g.add(barSign);

  // ================= BALCONY + STAIRS =================
  const deck = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.7 });
  const bz0 = BALCONY.z0;
  const bz1 = BALCONY.z1;
  box(BALCONY.x1 - BALCONY.x0, 0.3, bz1 - bz0, deck, (BALCONY.x0 + BALCONY.x1) / 2, BALCONY.y - 0.15, (bz0 + bz1) / 2);
  for (let z = -3.5; z <= 8.5; z += 3) box(0.2, BALCONY.y - 0.3, 0.2, mats.steel, -11.75, (BALCONY.y - 0.3) / 2, z);
  // downlights under the balcony
  for (let z = -2.8; z <= 8.8; z += 1.6) for (const x of [-14.2, -12.6]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), led.warm);
    d.rotation.x = Math.PI / 2;
    d.position.set(x, BALCONY.y - 0.31, z);
    g.add(d);
  }
  // edge LED + glass balustrade + top rail
  box(0.02, 0.03, bz1 - bz0, led.purple, BALCONY.x1 + 0.01, BALCONY.y - 0.2, (bz0 + bz1) / 2);
  const glassRun = (x0, z0, x1, z1, y0, y1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), glassMat);
    p.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.5, (z0 + z1) / 2);
    p.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    g.add(p);
    R.glass.push(p);
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.06), mats.chrome);
    r.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 1.03, (z0 + z1) / 2);
    r.rotation.y = p.rotation.y;
    g.add(r);
  };
  glassRun(-11.6, bz0, -11.6, LANDING.z0, BALCONY.y, BALCONY.y);
  glassRun(-11.6, LANDING.z1, -11.6, bz1, BALCONY.y, BALCONY.y);
  glassRun(-15, bz0, -11.6, bz0, BALCONY.y, BALCONY.y);
  glassRun(-11.6, LANDING.z1, -10.4, LANDING.z1, BALCONY.y, BALCONY.y);
  glassRun(-10.4, LANDING.z0, -10.4, LANDING.z1, BALCONY.y, BALCONY.y);
  // couches facing the floor, low tables, candles
  const sofa = new THREE.MeshLambertMaterial({ color: 0x4a1a5a, emissive: 0x1a0626 });
  const washTex = canvasTex(128, 256, (c, w, h) => {
    const gr2 = c.createRadialGradient(w / 2, h, 4, w / 2, h, h);
    gr2.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr2.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr2;
    c.fillRect(0, 0, w, h);
  });
  const warmWash = new THREE.MeshBasicMaterial({ map: washTex, color: 0xff9a50, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const zc of [-2.2, 1.6, 5.2, 8.2]) {
    box(0.85, 0.42, 2.4, sofa, -14.55, BALCONY.y + 0.21, zc);
    box(0.22, 0.9, 2.4, sofa, -14.93, BALCONY.y + 0.45, zc);
    box(0.85, 0.6, 0.18, sofa, -14.55, BALCONY.y + 0.3, zc - 1.2);
    box(0.85, 0.6, 0.18, sofa, -14.55, BALCONY.y + 0.3, zc + 1.2);
    const wsh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), warmWash);
    wsh.position.set(-14.96, BALCONY.y + 1.2, zc);
    wsh.rotation.y = Math.PI / 2;
    g.add(wsh);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), led.warm);
    lamp.position.set(-13.4, BALCONY.y + 0.62, zc);
    g.add(lamp);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 20), granite);
    tb.position.set(-13.4, BALCONY.y + 0.42, zc);
    g.add(tb);
    box(0.06, 0.4, 0.06, mats.chrome, -13.4, BALCONY.y + 0.2, zc);
    const cdl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 8), led.warm);
    cdl.position.set(-13.4, BALCONY.y + 0.48, zc);
    g.add(cdl);
  }
  box(0.02, 0.03, bz1 - bz0, led.pink, -14.98, BALCONY.y + 1.6, (bz0 + bz1) / 2);
  // stairs: open treads with LED nosing, stringers, handrails, glass
  const steps = 22;
  const run = (STAIR.z1 - STAIR.z0) / steps;
  const rise = BALCONY.y / steps;
  const tread = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6, metalness: 0.3 });
  const sx = (STAIR.x0 + STAIR.x1) / 2;
  const sw = STAIR.x1 - STAIR.x0;
  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * rise;
    const z = STAIR.z0 + (i + 0.5) * run;
    box(sw - 0.04, 0.05, run + 0.03, tread, sx, y - 0.025, z);
    box(sw - 0.1, 0.022, 0.03, led.blue, sx, y - 0.004, STAIR.z0 + i * run + 0.016);
  }
  const slen = Math.hypot(STAIR.z1 - STAIR.z0, BALCONY.y);
  const ang = Math.atan2(BALCONY.y, STAIR.z1 - STAIR.z0);
  for (const x of [STAIR.x0 + 0.04, STAIR.x1 - 0.04]) {
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, slen), mats.steel);
    str.position.set(x, BALCONY.y / 2 - 0.1, (STAIR.z0 + STAIR.z1) / 2);
    str.rotation.x = -ang;
    g.add(str);
    const hr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, slen), mats.chrome);
    hr.position.set(x, BALCONY.y / 2 + 0.95, (STAIR.z0 + STAIR.z1) / 2);
    hr.rotation.x = -ang;
    g.add(hr);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, slen), led.blue);
    hl.position.set(x, BALCONY.y / 2 + 0.92, (STAIR.z0 + STAIR.z1) / 2);
    hl.rotation.x = -ang;
    g.add(hl);
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(slen, 0.85), glassMat);
    gp.position.set(x, BALCONY.y / 2 + 0.5, (STAIR.z0 + STAIR.z1) / 2);
    gp.rotation.set(0, Math.PI / 2, 0);
    gp.rotateZ(-ang);
    g.add(gp);
    R.glass.push(gp);
  }
  box(sw, 0.3, LANDING.z1 - LANDING.z0, deck, sx, BALCONY.y - 0.15, (LANDING.z0 + LANDING.z1) / 2);
  // closed storage under the high end of the stairs, with a door
  box(sw, BALCONY.y - 0.6, 2.4, mats.wall, sx, (BALCONY.y - 0.6) / 2, -2.6);
  box(0.02, 2.0, 0.8, new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), STAIR.x1 + 0.005, 1.0, -2.6);
  const balSign = neonSign('BALCONY', '#7b8cff', 1.8, 0.45, 'bold 120px Arial');
  balSign.position.set(-10.38, 2.9, -6.2);
  balSign.rotation.y = Math.PI / 2;
  g.add(balSign);

  // ================= RESTROOMS =================
  const tileTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#9aa0a8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8dce2';
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) c.fillRect(x + 1, y + 1, 30, 30);
  }, [3, 2]);
  const floorTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#22242a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a3e46';
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) c.fillRect(x + 2, y + 2, 60, 60);
  }, [4, 6]);
  const tileM = basic(0xffffff, { map: tileTex });
  tileM.color.setScalar(0.5);
  const floorM = basic(0xffffff, { map: floorTex });
  floorM.color.setScalar(0.9);
  const porcelain = basic(0xe6e8ec);
  porcelain.color.setScalar(0.7);
  const stallM = basic(0x34343e);
  const counterM = basic(0x15161a);
  const mirrorM = basic(0x5a6676);
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(4, 6.2), floorM);
  wf.rotation.x = -Math.PI / 2;
  wf.position.set(-17, 0.005, 2.7);
  g.add(wf);
  box(4.2, 0.1, 6.6, basic(0x1c1c22), -17, 3.1, 2.7);
  box(0.2, 3.1, 6.6, tileM, -19.1, 1.55, 2.7);
  box(4.2, 3.1, 0.2, tileM, -17, 1.55, -0.5);
  box(4.2, 3.1, 0.2, tileM, -17, 1.55, 5.9);
  box(4.0, 3.1, 0.2, tileM, -17, 1.55, 2.7);
  for (const [room, zc, zs] of [
    ['m', 1.1, [0.1, 1.05, 2.0]],
    ['w', 4.3, [3.35, 4.3, 5.25]],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), led.white);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(-16.5, 3.04, zc);
    g.add(panel);
    // stalls
    const z0 = room === 'm' ? -0.4 : 2.8;
    const z1 = room === 'm' ? 2.6 : 5.8;
    box(1.3, 2.05, 0.04, stallM, -18.35, 1.1, (zs[0] + zs[1]) / 2);
    box(1.3, 2.05, 0.04, stallM, -18.35, 1.1, (zs[1] + zs[2]) / 2);
    let prev = z0;
    for (const z of zs) {
      box(0.04, 2.05, z - 0.3 - prev, stallM, -17.7, 1.1, (prev + z - 0.3) / 2);
      prev = z + 0.3;
      // toilet
      box(0.42, 0.42, 0.38, porcelain, -18.7, 0.21, z);
      box(0.18, 0.42, 0.44, porcelain, -18.98, 0.62, z);
      // hinged door
      const pivot = new THREE.Group();
      pivot.position.set(-17.7, 0, z - 0.29);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.95, 0.57), basic(0x40404c));
      door.position.set(0, 1.08, 0.285);
      pivot.add(door);
      g.add(pivot);
      pivot.userData.target = 0;
      R.stallDoors.set(z.toFixed(2), pivot);
    }
    box(0.04, 2.05, z1 - prev, stallM, -17.7, 1.1, (prev + z1) / 2);
    // sinks + mirror + light strip
    const sz = room === 'm' ? -0.2 : 5.6;
    const face = room === 'm' ? 1 : -1;
    box(1.9, 0.08, 0.42, counterM, -16.45, 0.86, sz);
    for (const x of [-17.0, -16.2]) {
      box(0.36, 0.06, 0.28, porcelain, x, 0.92, sz);
      box(0.03, 0.18, 0.03, mats.chrome, x, 1.0, sz - face * 0.14);
    }
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.8), mirrorM);
    mir.position.set(-16.45, 1.6, sz - face * 0.2);
    mir.rotation.y = face > 0 ? 0 : Math.PI;
    g.add(mir);
    box(1.8, 0.03, 0.03, led.white, -16.45, 2.05, sz - face * 0.18);
    box(0.28, 0.3, 0.16, mats.chrome, -15.45, 1.3, sz - face * 0.02);
    if (room === 'm') {
      for (const x of [-17.0, -16.3]) {
        box(0.38, 0.6, 0.3, porcelain, x, 0.75, 2.46);
        box(0.03, 0.9, 0.35, stallM, x + 0.34, 1.1, 2.4);
      }
    }
    // doorway frame (lit) + sign on the club side
    const dz0 = WC[room].door[0];
    const dz1 = WC[room].door[1];
    box(0.04, 0.04, dz1 - dz0 + 0.1, led.white, -14.84, 2.42, (dz0 + dz1) / 2);
    for (const z of [dz0 - 0.03, dz1 + 0.03]) box(0.04, 2.4, 0.04, led.white, -14.84, 1.2, z);
    const sign = neonSign(room === 'm' ? 'MEN' : 'WOMEN', room === 'm' ? '#6ab0ff' : '#ff7ad8', 1.1, 0.32, 'bold 120px Arial');
    sign.position.set(-14.83, 2.8, (dz0 + dz1) / 2);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }
  const wcSign = neonSign('WC', '#e8f0ff', 0.7, 0.35, 'bold 150px Arial');
  wcSign.position.set(-14.83, 3.3, 2.7);
  wcSign.rotation.y = Math.PI / 2;
  g.add(wcSign);

  // ================= STAGE STAIRS + BACKSTAGE =================
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) box(0.035, 0.035, 2.4, led.blue, s * (8.3 - i * 0.325 - 0.02), (STAGE.y * (i + 1)) / 4 - 0.01, -7.3);
    for (const z of [-8.58, -6.02]) box(1.3, 0.012, 0.02, led.blue, s * 7.65, STAGE.y + 0.52, z);
  }
  // stage door frame + backstage sign + guide line
  for (const x of [6.2, 7.6]) box(0.05, 2.4, 0.05, led.white, x, STAGE.y + 1.2, -10.0);
  box(1.45, 0.05, 0.05, led.white, 6.9, STAGE.y + 2.42, -10.0);
  const bs = neonSign('BACKSTAGE', '#ffffff', 1.4, 0.32, 'bold 110px Arial');
  bs.position.set(6.9, STAGE.y + 2.75, -9.94);
  g.add(bs);
  box(0.04, 0.01, 2.3, led.blue, 6.9, STAGE.y + 0.005, -8.9);
  // green room shell (lit warm interior, own ceiling)
  const roomWall = basic(0x5a4a3c);
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.0), roomWall);
  bw.position.set(0.1, STAGE.y + 1.5, -13.97);
  g.add(bw);
  for (const [x, ry] of [
    [-7.83, Math.PI / 2],
    [8.03, -Math.PI / 2],
  ]) {
    const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.0), roomWall);
    sw2.position.set(x, STAGE.y + 1.5, -12.05);
    sw2.rotation.y = ry;
    g.add(sw2);
  }
  const fw = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.0), roomWall);
  fw.position.set(0.1, STAGE.y + 1.5, -10.27);
  fw.rotation.y = Math.PI;
  g.add(fw);
  box(16.2, 0.08, 4.0, basic(0x1a1612), 0.1, STAGE.y + 3.0, -12.1);
  for (const x of [-4.5, 0, 4.5]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), led.white);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, STAGE.y + 2.95, -12.1);
    g.add(p);
  }
  const floorB = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.8), basic(0x2e2924));
  floorB.rotation.x = -Math.PI / 2;
  floorB.position.set(0.1, STAGE.y + 0.004, -12.1);
  g.add(floorB);
  // coffee table + fruit + drinks, rider table, coat rack, desk with laptop, posters, TV
  box(1.2, 0.05, 0.6, granite, -4, STAGE.y + 0.42, -12.4);
  box(0.06, 0.4, 0.06, mats.chrome, -4, STAGE.y + 0.2, -12.4);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: [0xff6a20, 0xffd020, 0x40a020, 0xaa2020, 0xffd020][i] }));
    f.position.set(-4.15 + i * 0.06, STAGE.y + 0.49, -12.4 + (i % 2) * 0.05);
    g.add(f);
  }
  box(2.4, 0.06, 0.6, mats.wood, 0.6, STAGE.y + 0.85, -13.6);
  for (const x of [-0.5, 1.7]) box(0.05, 0.85, 0.5, mats.steel, x, STAGE.y + 0.42, -13.6);
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8), new THREE.MeshLambertMaterial({ color: [0x2b8a3b, 0xb05a12, 0xd8d8d8, 0x2a4aaa][i % 4] }));
    b.position.set(-0.4 + i * 0.22, STAGE.y + 1.03, -13.62);
    g.add(b);
  }
  box(0.04, 1.8, 0.04, mats.steel, -6.8, STAGE.y + 0.9, -11.0);
  for (let i = 0; i < 3; i++) box(0.3, 0.7, 0.12, new THREE.MeshLambertMaterial({ color: [0x1a1a1a, 0x5a1a1a, 0x1a2a4a][i] }), -6.8 + (i - 1) * 0.12, STAGE.y + 1.35, -11.0 + (i - 1) * 0.12);
  box(1.4, 0.05, 0.6, mats.wood, 5.2, STAGE.y + 0.75, -13.55);
  box(0.4, 0.02, 0.3, basic(0x2a2a2a), 5.2, STAGE.y + 0.785, -13.5);
  box(0.4, 0.26, 0.01, basic(0x6aa0ff), 5.2, STAGE.y + 0.92, -13.66);
  const posterTex = canvasTex(256, 360, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a0f5a');
    gr.addColorStop(1, '#ff3cc8');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = 'bold 34px Helvetica, Arial';
    c.fillText('SUBLEVEL', 24, 70);
    c.font = '22px Helvetica, Arial';
    c.fillText('presents', 24, 104);
    c.font = 'bold 30px Helvetica, Arial';
    c.fillText('HOUSE', 24, 280);
    c.fillText('ALL NIGHT', 24, 316);
  });
  for (const x of [-6.6, 2.8]) {
    const po = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), basic(0xffffff, { map: posterTex }));
    po.material.color.setScalar(0.85);
    po.position.set(x, STAGE.y + 1.8, -13.95);
    g.add(po);
  }
  const tvCanvas = document.createElement('canvas');
  tvCanvas.width = 512;
  tvCanvas.height = 288;
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  tvTex.colorSpace = THREE.SRGBColorSpace;
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), basic(0xffffff, { map: tvTex }));
  tv.position.set(-2.0, STAGE.y + 2.0, -13.94);
  g.add(tv);
  box(1.66, 0.96, 0.04, mats.black, -2.0, STAGE.y + 2.0, -13.97);
  R.tv = { canvas: tvCanvas, tex: tvTex, mesh: tv };
  const gr = neonSign('GREEN ROOM', '#7dff9a', 1.6, 0.36, 'bold 110px Arial');
  gr.position.set(-5.5, STAGE.y + 2.65, -13.94);
  g.add(gr);
  const ex = neonSign('EXIT', '#22ff66', 0.7, 0.22, 'bold 150px Arial');
  ex.position.set(8.02, STAGE.y + 2.3, -12.6);
  ex.rotation.y = -Math.PI / 2;
  g.add(ex);
  box(0.05, 2.1, 1.0, new THREE.MeshLambertMaterial({ color: 0x3a3a40 }), 8.03, STAGE.y + 1.05, -12.6);

  // ================= CO2 CANNONS + GOBOS =================
  const cannons = [-6, -2.5, 2.5, 6].map((x) => {
    box(0.22, 0.24, 0.22, mats.black, x, STAGE.y + 0.12, -6.4);
    box(0.08, 0.1, 0.08, mats.chrome, x, STAGE.y + 0.29, -6.4);
    return new THREE.Vector3(x, STAGE.y + 0.34, -6.4);
  });
  R.co2 = makeCO2(g, cannons, canvasTex);
  const goboTex = canvasTex(128, 128, (c, w, h) => {
    const cx = w / 2;
    const gr2 = c.createRadialGradient(cx, cx, 4, cx, cx, cx);
    gr2.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr2.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    gr2.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr2;
    c.beginPath();
    c.arc(cx, cx, cx, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.ellipse(cx + Math.cos(a) * 34, cx + Math.sin(a) * 34, 9, 18, a, 0, Math.PI * 2);
      c.fill();
    }
  });
  R.gobos = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: goboTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: 0x4433ff }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.035;
    m.visible = false;
    g.add(m);
    R.gobos.push(m);
  }
  return R;
}

function mergeGeo(list) {
  let pos = [];
  let nor = [];
  let idx = [];
  let off = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// CO2 jets: one Points draw call, bursts of particles that shoot up and billow out
function makeCO2(g, cannons, canvasTex) {
  const N = 480;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const tex = canvasTex(64, 64, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; varying float vA;
      void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 600.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.92), t.a * vA * 0.55); }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  g.add(pts);
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let cursor = 0;
  let active = 0;
  return {
    fire(power = 1) {
      for (const c of cannons)
        for (let k = 0; k < 60; k++) {
          const p = P[cursor];
          cursor = (cursor + 1) % N;
          p.life = 0;
          p.max = 1.1 + Math.random() * 0.8;
          p.x = c.x + (Math.random() - 0.5) * 0.08;
          p.y = c.y;
          p.z = c.z + (Math.random() - 0.5) * 0.08;
          p.vx = (Math.random() - 0.5) * 0.9;
          p.vz = (Math.random() - 0.5) * 0.9 + 0.3;
          p.vy = (6 + Math.random() * 4) * power;
          p.delay = (k / 60) * 0.45;
        }
      active = 2.5;
    },
    update(dt) {
      if (active <= 0) return;
      active -= dt;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.delay > 0) {
          p.delay -= dt;
          alpha[i] = 0;
          continue;
        }
        if (p.life >= p.max) {
          alpha[i] = 0;
          continue;
        }
        p.life += dt;
        p.vy *= 1 - dt * 2.2;
        p.vx *= 1 - dt * 0.8;
        p.vz *= 1 - dt * 0.8;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = p.life / p.max;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        size[i] = 0.25 + k * 1.6;
        alpha[i] = (1 - k) * Math.min(1, p.life * 8);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
  };
}

// per-frame: stall doors, CO2, gobos following the moving heads, backstage TV
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
export function updateRooms(R, club, dt, m, now) {
  for (const pivot of R.stallDoors.values()) {
    const tgt = pivot.userData.target || 0;
    pivot.rotation.y += (tgt - pivot.rotation.y) * Math.min(1, dt * 6);
  }
  R.co2.update(dt);
  // gobos where the beams hit the floor
  const on = m.playing && m.section !== 'breakdown';
  club.heads.forEach((h, i) => {
    const gobo = R.gobos[i];
    if (!gobo) return;
    if (!on) {
      gobo.visible = false;
      return;
    }
    h.beam.getWorldPosition(_p);
    _d.set(0, -1, 0).applyQuaternion(h.beam.getWorldQuaternion(new THREE.Quaternion()));
    if (_d.y > -0.15) {
      gobo.visible = false;
      return;
    }
    const t = (_p.y - 0.035) / -_d.y;
    gobo.position.set(_p.x + _d.x * t, 0.035, _p.z + _d.z * t);
    gobo.visible = Math.abs(gobo.position.x) < 14 && gobo.position.z > -9.5 && gobo.position.z < 9.5;
    gobo.material.color.copy(h.beam.material.uniforms.color.value).multiplyScalar(0.6 * h.beam.material.uniforms.intensity.value);
    gobo.rotation.z += dt * 0.6;
    const s = 0.8 + t * 0.12;
    gobo.scale.setScalar(s);
  });
  // backstage TV: now playing
  R.tvAcc = (R.tvAcc || 0) + dt;
  if (R.tvAcc > 0.5) {
    R.tvAcc = 0;
    const c = R.tv.canvas.getContext('2d');
    c.fillStyle = '#05040c';
    c.fillRect(0, 0, 512, 288);
    c.fillStyle = '#ff3040';
    c.beginPath();
    c.arc(28, 28, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 22px Arial';
    c.fillText('LIVE · MAIN STAGE', 46, 36);
    c.font = 'bold 30px Arial';
    c.fillText(m.playing ? m.track.name.slice(0, 26) : 'Doors open', 24, 130);
    c.font = '22px Arial';
    c.fillStyle = '#b8a6ff';
    c.fillText(m.playing ? `${m.section.toUpperCase()} · ${m.bpm.toFixed(0)} BPM` : 'Set starts soon', 24, 172);
    if (m.playing) {
      for (let i = 0; i < 48; i++) {
        const v = Math.abs(Math.sin(now * 3 + i * 0.7)) * (0.3 + m.energy * 0.7);
        c.fillStyle = i % 2 ? '#7b4dff' : '#2a6aff';
        c.fillRect(24 + i * 9.6, 260 - v * 50, 6, v * 50);
      }
    }
    R.tv.tex.needsUpdate = true;
  }
}
