// The club: a dark warehouse room (30 x 20 x 8 m) with stage, LED ceiling grid,
// moving heads, lasers, strobes, LED wall, dance floor, bar, lounge, backstage,
// speakers, signage, haze. Also exports colliders + zones for navigation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStatic } from './merge.js';

export const ROOM = { x0: -15, x1: 15, z0: -10, z1: 10, h: 8 };
export const STAGE = { x0: -7, x1: 7, z0: -10, z1: -6, y: 1.0 };
export const BAR = { x0: -7, x1: 7, zc: 8.4 };
export const LOUNGE = { x0: 10.2, x1: 14.6, z0: -3, z1: 8.5, y: 0.35 };

// colliders: [x0, z0, x1, z1]
export const colliders = [];
const wall = (x0, z0, x1, z1) => colliders.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

export function zoneAt(x, z) {
  if (z < -10.05) return 'backstage';
  if (z < -6 && x > -7.6 && x < 7.6) return z < -7.4 && Math.abs(x) < 1.9 ? 'booth' : 'stage';
  if (z > 8.85 && Math.abs(x) < 7.6) return 'barstaff';
  if (x > 10 && z > -3.2 && z < 8.8) return 'lounge';
  return 'floor';
}
export const PRIVATE = { backstage: 'Backstage', stage: 'Stage', booth: 'DJ booth', barstaff: 'Behind the bar' };

export function floorY(x, z) {
  if (z < -6 && z > -10 && Math.abs(x) < 7) return STAGE.y;
  // stage stairs at both sides (x 7..8.2, z -8..-6)
  if (z < -6 && z > -8.6 && Math.abs(x) >= 7 && Math.abs(x) < 8.3) return STAGE.y * Math.max(0, Math.min(1, (8.3 - Math.abs(x)) / 1.3));
  if (z < -10.05 && z > -14) return STAGE.y; // backstage is at stage level
  if (x > LOUNGE.x0 && z > LOUNGE.z0 && z < LOUNGE.z1) return LOUNGE.y;
  return 0;
}

export function collides(x, z, r = 0.25) {
  if (x < ROOM.x0 + r || x > ROOM.x1 - r || z > ROOM.z1 - r || z < -13.8 + r) return true;
  for (const c of colliders) if (x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r) return true;
  return false;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function concreteTex() {
  return canvasTex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#2a2a2e';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = 30 + Math.random() * 30;
        g.fillStyle = `rgba(${v},${v},${v + 4},${Math.random() * 0.35})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, w, h); // slab joints
    },
    [8, 6]
  );
}
function brickTex() {
  return canvasTex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#141215';
      g.fillRect(0, 0, w, h);
      const bh = 32;
      const bw = 96;
      for (let y = 0; y < h; y += bh) {
        const off = (y / bh) % 2 ? bw / 2 : 0;
        for (let x = -bw; x < w + bw; x += bw) {
          const v = 34 + Math.random() * 22;
          g.fillStyle = `rgb(${v + 8},${v},${v - 2})`;
          g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        }
      }
    },
    [6, 3]
  );
}

function neonSign(text, color, w = 4, h = 1, font = 'bold 120px Helvetica, Arial') {
  const tex = canvasTex(1024, 256, (g, cw, ch) => {
    g.clearRect(0, 0, cw, ch);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 40;
    g.fillStyle = color;
    g.fillText(text, cw / 2, ch / 2);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.85;
    g.fillText(text, cw / 2, ch / 2);
  });
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

const beamVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv=uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const beamFS = `uniform vec3 color; uniform float intensity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float along = pow(1.0 - vUv.y, 1.4); float edge = pow(abs(dot(vN, vV)), 1.6);
 gl_FragColor = vec4(color * intensity * along * edge * 0.55, 1.0); }`;

export function buildClub(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const mats = {};
  mats.floor = new THREE.MeshStandardMaterial({ map: concreteTex(), color: 0x8a8a92, roughness: 0.38, metalness: 0.1 });
  mats.wall = new THREE.MeshStandardMaterial({ map: brickTex(), color: 0x6a6070, roughness: 0.92 });
  mats.black = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.7 });
  mats.steel = new THREE.MeshStandardMaterial({ color: 0x55575e, roughness: 0.35, metalness: 0.85 });
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.5, metalness: 0.3 });
  mats.wood = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.55 });
  mats.velvet = new THREE.MeshStandardMaterial({ color: 0x2a0f3a, roughness: 0.95 });
  mats.leather = new THREE.MeshStandardMaterial({ color: 0x141016, roughness: 0.45 });
  mats.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 });

  const box = (w, h, d, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ---------- shell ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 24), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  g.add(floor);
  const ceil = box(30, 0.2, 24, mats.black, 0, ROOM.h + 0.1, -2);
  ceil.material = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
  box(30, ROOM.h, 0.3, mats.wall, 0, ROOM.h / 2, ROOM.z1 + 0.15); // back (bar) wall
  box(0.3, ROOM.h, 24, mats.wall, ROOM.x0 - 0.15, ROOM.h / 2, -2); // left
  box(0.3, ROOM.h, 24, mats.wall, ROOM.x1 + 0.15, ROOM.h / 2, -2); // right
  box(30, ROOM.h, 0.3, mats.wall, 0, ROOM.h / 2, -14.15); // backstage back wall
  // stage back wall (LED wall sits on it) with backstage door gap at x 6.2..7.6
  box(21.2, ROOM.h, 0.25, mats.black, -4.6 - 0.0, ROOM.h / 2, -10.1).scale.x = 1; // x -15.2..6
  g.children[g.children.length - 1].position.x = -4.6;
  box(7.4, ROOM.h, 0.25, mats.black, 11.3, ROOM.h / 2, -10.1); // x 7.6..15
  box(1.4, ROOM.h - 2.4, 0.25, mats.black, 6.9, 2.4 + (ROOM.h - 2.4) / 2, -10.1); // above door
  wall(-15.2, -10.25, 6.2, -9.95);
  wall(7.6, -10.25, 15.2, -9.95);
  wall(-15.2, -14.3, 15.2, -14.0);
  // backstage side walls (room narrower behind the stage)
  box(0.25, ROOM.h, 4, mats.black, -8, ROOM.h / 2, -12.1);
  box(0.25, ROOM.h, 4, mats.black, 8.2, ROOM.h / 2, -12.1);
  wall(-8.15, -14.2, -7.85, -10);
  wall(8.05, -14.2, 8.35, -10);
  wall(-15.2, -14.2, -8.1, -10.1);
  wall(8.3, -14.2, 15.2, -10.1);

  // columns
  for (const [x, z] of [
    [-9.5, -3],
    [9.5, -3],
    [-9.5, 4],
    [9.5, 4],
  ]) {
    box(0.45, ROOM.h, 0.45, mats.steel, x, ROOM.h / 2, z);
    wall(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
  }
  // trusses (box truss: 4 chords + diagonals simplified as lattice texture)
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.4, metalness: 0.9 });
  const trussZ = [-8.6, -4.5, -0.5, 3.5];
  for (const z of trussZ) {
    for (const [dy, dz] of [
      [0, -0.2],
      [0, 0.2],
      [-0.4, -0.2],
      [-0.4, 0.2],
    ])
      box(22, 0.05, 0.05, trussMat, 0, 7.2 + dy, z + dz);
    for (let x = -11; x < 11; x += 0.4) {
      const d = box(0.03, 0.56, 0.03, trussMat, x, 7.0, z - 0.2);
      d.rotation.z = 0.78;
      const d2 = box(0.03, 0.56, 0.03, trussMat, x, 7.0, z + 0.2);
      d2.rotation.z = -0.78;
    }
  }

  // ---------- stage ----------
  box(14, STAGE.y, 4, mats.dark, 0, STAGE.y / 2, -8);
  const lip = box(14, 0.06, 0.06, new THREE.MeshBasicMaterial({ color: 0x5522ff, toneMapped: false }), 0, STAGE.y + 0.03, -5.97);
  lip.userData.led = true;
  wall(-7, -6.3, 7, -6.0); // stage front edge (use the side stairs)
  wall(-1.2, -8.45, 1.2, -7.55); // DJ booth table
  // stairs (both sides)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const h = (STAGE.y * (i + 1)) / 4;
      box(0.33, h, 2.5, mats.dark, s * (8.3 - 0.165 - i * 0.325), h / 2, -7.3);
      box(0.33, 0.02, 2.5, mats.steel, s * (8.3 - 0.165 - i * 0.325), h + 0.01, -7.3); // step nosing
    }
    for (const z of [-8.58, -6.02]) {
      box(1.3, 0.04, 0.04, mats.steel, s * 7.65, STAGE.y + 0.55, z);
      for (const x of [7.05, 8.25]) box(0.04, 1.0, 0.04, mats.steel, s * x, 0.6, z);
    }
  }
  // barrier (crowd control)
  for (let x = -6.8; x <= 6.8; x += 1.0) {
    box(0.96, 0.04, 0.04, mats.steel, x, 1.1, -5.6);
    box(0.96, 0.04, 0.04, mats.steel, x, 0.15, -5.6);
    for (let k = -0.4; k <= 0.41; k += 0.1) box(0.015, 0.95, 0.015, mats.steel, x + k, 0.62, -5.6);
    box(0.04, 0.04, 0.5, mats.steel, x - 0.48, 0.03, -5.4);
  }
  wall(-7, -5.7, 7, -5.5);

  // LED wall behind the DJ (shader)
  const ledWallMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, bass: { value: 0 }, high: { value: 0 }, hype: { value: 0 }, flash: { value: 0 }, colA: { value: new THREE.Color(0x2a1bff) }, colB: { value: new THREE.Color(0x9b2cff) }, build: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float time,bass,high,hype,flash,build; uniform vec3 colA,colB; varying vec2 vUv;
      void main(){ vec2 g = vec2(160.0, 56.0); vec2 cell = floor(vUv*g); vec2 f = fract(vUv*g);
        float px = smoothstep(0.5,0.35,max(abs(f.x-0.5),abs(f.y-0.5)));
        vec2 uv = cell/g; float cx = abs(uv.x-0.5)*2.0;
        float bars = step(uv.y, 0.12 + bass*0.75*(1.0-cx*0.6) + 0.08*sin(uv.x*40.0+time*3.0)*high);
        float wave = 0.5+0.5*sin(uv.x*12.0 - time*2.0 + uv.y*6.0);
        vec3 c = mix(colA, colB, wave) * (0.25 + 0.75*bars) * (0.35 + hype*0.9);
        float sweep = step(abs(uv.y - fract(time*0.5*(1.0+build*4.0))), 0.02*(1.0+build*2.0)) * build;
        c += vec3(sweep) + vec3(flash*0.5);
        gl_FragColor = vec4(c*px*1.15, 1.0); }`,
    toneMapped: false,
  });
  const ledWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), ledWallMat);
  ledWall.position.set(0, STAGE.y + 2.6, -9.95);
  g.add(ledWall);

  // ---------- LED pixel ceiling (ref image 2): grid + canopy curving down over the stage ----------
  const pixGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const pixMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const pts = [];
  const sp = 0.45;
  for (let x = -9; x <= 9.001; x += sp) for (let z = -5.8; z <= 6.4; z += sp) pts.push([x, 7.55, z, 0]);
  // canopy: from z=-5.8 curving down to y=5.2 at z=-9.6 (rows follow a quarter curve)
  const rows = 12;
  for (let r = 1; r <= rows; r++) {
    const a = (r / rows) * (Math.PI / 2);
    const z = -5.8 - Math.sin(a) * 3.8;
    const y = 7.55 - (1 - Math.cos(a)) * 2.4;
    for (let x = -9; x <= 9.001; x += sp) pts.push([x, y, z, 1]);
  }
  // pillar wraps on the columns (vertical pixel strips)
  for (const [cx, cz] of [
    [-9.5, -3],
    [9.5, -3],
    [-9.5, 4],
    [9.5, 4],
  ])
    for (let y = 0.6; y < 7.4; y += sp) for (const [dx, dz] of [[0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]]) pts.push([cx + dx, y, cz + dz, 2]);
  const pix = new THREE.InstancedMesh(pixGeo, pixMat, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => {
    m4.makeTranslation(p[0], p[1], p[2]);
    pix.setMatrixAt(i, m4);
    pix.setColorAt(i, new THREE.Color(0x2233ff));
  });
  g.add(pix);
  // dark frame around the ceiling grid
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0d0d10, metalness: 0.6, roughness: 0.4 });
  box(18.8, 0.18, 0.2, frameMat, 0, 7.62, 6.65);
  box(0.2, 0.18, 12.6, frameMat, -9.35, 7.62, 0.3);
  box(0.2, 0.18, 12.6, frameMat, 9.35, 7.62, 0.3);

  // ---------- dance floor LED tiles ----------
  const tileMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, bass: { value: 0 }, hype: { value: 0 }, flash: { value: 0 }, colA: { value: new THREE.Color(0x1a10ff) }, colB: { value: new THREE.Color(0x8a1cff) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float time,bass,hype,flash; uniform vec3 colA,colB; varying vec2 vUv;
      void main(){ vec2 g = vec2(18.0, 10.0); vec2 c = floor(vUv*g); vec2 f = fract(vUv*g);
        float edge = smoothstep(0.0,0.06,f.x)*smoothstep(1.0,0.94,f.x)*smoothstep(0.0,0.06,f.y)*smoothstep(1.0,0.94,f.y);
        float d = length((c+0.5)/g - 0.5);
        float ring = smoothstep(0.12, 0.0, abs(fract(d*2.0 - time*0.6) - 0.5));
        float chk = mod(c.x + c.y, 2.0);
        vec3 col = mix(colA, colB, chk) * (0.05 + 0.25*bass*hype + 0.3*ring*hype) + vec3(flash*0.25);
        gl_FragColor = vec4(col*edge, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(18, 10.5), tileMat);
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.set(0, 0.012, -0.3);
  g.add(tiles);

  // ---------- moving heads + beams ----------
  const heads = [];
  const beamGeo = new THREE.CylinderGeometry(0.06, 1.1, 9, 14, 1, true);
  beamGeo.translate(0, -4.5, 0);
  for (let i = 0; i < 10; i++) {
    const z = trussZ[i % 2 ? 1 : 2];
    const x = -9 + (i / 9) * 18;
    const fix = new THREE.Group();
    fix.position.set(x, 6.75, z);
    const yoke = box(0.36, 0.05, 0.2, mats.dark, 0, 0.2, 0, fix);
    yoke.position.y = 0.25;
    const head = new THREE.Group();
    fix.add(head);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.36, 16), mats.dark);
    head.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.185;
    head.add(lens);
    const bm = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0x4433ff) }, intensity: { value: 1 } }, vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(beamGeo, bm);
    beam.position.y = -0.18;
    head.add(beam);
    g.add(fix);
    heads.push({ fix, head, beam, lens, i, phase: i * 0.7 });
  }
  // lasers from the stage top
  const lasers = [];
  const laserGeo = new THREE.CylinderGeometry(0.008, 0.008, 22, 6, 1, true);
  laserGeo.translate(0, 11, 0);
  for (let i = 0; i < 14; i++) {
    const lm = new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const l = new THREE.Mesh(laserGeo, lm);
    l.position.set(-1.2 + (i % 2) * 2.4, 6.2, -9.5);
    g.add(l);
    lasers.push(l);
  }
  // strobes
  const strobes = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.12), new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false }));
    s.position.set(-7.5 + i * 3, 6.55, trussZ[0] + 0.3);
    g.add(s);
    strobes.push(s);
  }

  // real lights (few, for character shading)
  const hemi = new THREE.HemisphereLight(0x3a2a66, 0x0a0a10, 0.55);
  g.add(hemi);
  const spotA = new THREE.SpotLight(0x5533ff, 60, 22, 0.55, 0.6, 1.2);
  spotA.position.set(-5, 7.3, 2);
  spotA.target.position.set(-2, 0, -1);
  g.add(spotA, spotA.target);
  const spotB = new THREE.SpotLight(0xa040ff, 60, 22, 0.55, 0.6, 1.2);
  spotB.position.set(5, 7.3, 2);
  spotB.target.position.set(2, 0, -1);
  g.add(spotB, spotB.target);
  const djKey = new THREE.SpotLight(0xffe2cc, 12, 12, 0.45, 0.6, 1.2);
  djKey.position.set(0, 6.8, -4.5);
  djKey.target.position.set(0, 2, -8.3);
  g.add(djKey, djKey.target);
  const barLight = new THREE.PointLight(0xffa860, 14, 9, 1.6);
  barLight.position.set(0, 3.2, 8.4);
  g.add(barLight);
  const loungeLight = new THREE.PointLight(0xff7a5a, 10, 8, 1.6);
  loungeLight.position.set(12.4, 2.6, 2.5);
  const backLight = new THREE.PointLight(0xfff0dd, 8, 8, 1.6);
  backLight.position.set(0, 3.4, -12);
  const strobeLight = new THREE.PointLight(0xffffff, 0, 30, 1.2);
  strobeLight.position.set(0, 6.5, -4); // not added: strobes are emissive + hemi pump (cheaper)

  // ---------- speakers ----------
  const spkMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
  const grill = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const cab = box(1.0, 0.28, 0.6, spkMat, s * 8.6, 6.6 - i * 0.3, -6.6);
      cab.rotation.x = 0.03 * i;
      box(0.92, 0.2, 0.02, grill, s * 8.6, 6.6 - i * 0.3, -6.29).rotation.x = 0.03 * i;
    }
    box(0.04, 1.2, 0.04, mats.steel, s * 8.6, 7.4, -6.6);
    for (let i = 0; i < 2; i++) {
      box(1.2, 0.7, 0.9, spkMat, s * 5.6, 0.35 + i * 0.7, -5.0);
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), grill);
      cone.position.set(s * 5.6, 0.35 + i * 0.7, -4.54);
      g.add(cone);
    }
    wall(s * 5.6 - 0.6, -5.45, s * 5.6 + 0.6, -4.55);
    // booth monitors
    const mon = box(0.5, 0.7, 0.45, spkMat, s * 2.1, STAGE.y + 0.35, -7.6);
    mon.rotation.y = -s * 0.5;
    wall(s * 2.1 - 0.3, -7.85, s * 2.1 + 0.3, -7.35);
  }

  // ---------- bar ----------
  const counterTop = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.15, metalness: 0.4 });
  box(14.4, 1.1, 0.7, mats.dark, 0, 0.55, BAR.zc);
  box(14.6, 0.06, 0.9, counterTop, 0, 1.13, BAR.zc);
  const barLed = box(14.4, 0.03, 0.03, new THREE.MeshBasicMaterial({ color: 0x6a2cff, toneMapped: false }), 0, 0.1, BAR.zc - 0.36);
  barLed.userData.led = true;
  wall(-7.2, BAR.zc - 0.4, 7.2, BAR.zc + 0.4);
  // back bar: shelves, backlit panel, bottles
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ color: 0x40220f, toneMapped: false }));
  back.position.set(0, 2.2, 9.98);
  back.rotation.y = Math.PI;
  g.add(back);
  for (let s = 0; s < 3; s++) box(14, 0.04, 0.3, mats.wood, 0, 1.3 + s * 0.6, 9.82);
  box(14, 1.0, 0.5, mats.wood, 0, 0.5, 9.7);
  wall(-7.2, 9.4, 7.2, 10);
  const bottleGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8);
  bottleGeo.translate(0, 0.15, 0);
  const bottleMat = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
  const nB = 120;
  const bottles = new THREE.InstancedMesh(bottleGeo, bottleMat, nB);
  const bcol = [0x2b6b2b, 0x6b3b12, 0xc9c9c9, 0x1a3a8a, 0x8a1a1a, 0xd8b04a];
  for (let i = 0; i < nB; i++) {
    const shelf = i % 3;
    m4.makeTranslation(-6.6 + (Math.floor(i / 3) / (nB / 3)) * 13.2 + Math.random() * 0.05, 1.32 + shelf * 0.6, 9.82);
    bottles.setMatrixAt(i, m4);
    bottles.setColorAt(i, new THREE.Color(bcol[i % bcol.length]));
  }
  g.add(bottles);
  // taps + stools
  for (let x = -5; x <= 5; x += 2.5) {
    box(0.05, 0.35, 0.05, mats.chrome, x, 1.33, BAR.zc + 0.2);
    box(0.12, 0.06, 0.12, mats.chrome, x, 1.5, BAR.zc + 0.2);
  }
  for (let x = -6.3; x <= 6.3; x += 1.05) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), mats.leather);
    st.position.set(x, 0.78, BAR.zc - 0.75);
    g.add(st);
    box(0.04, 0.76, 0.04, mats.chrome, x, 0.38, BAR.zc - 0.75);
  }
  const barSign = neonSign('BAR', '#ff8a3c', 2.4, 0.7);
  barSign.position.set(0, 4.0, 9.95);
  barSign.rotation.y = Math.PI;
  g.add(barSign);

  // ---------- lounge (raised, couches, tables, rope) ----------
  box(LOUNGE.x1 - LOUNGE.x0, LOUNGE.y, LOUNGE.z1 - LOUNGE.z0, new THREE.MeshStandardMaterial({ color: 0x1a1216, roughness: 0.8 }), (LOUNGE.x0 + LOUNGE.x1) / 2, LOUNGE.y / 2, (LOUNGE.z0 + LOUNGE.z1) / 2);
  const loungeSeats = [];
  for (const zc of [-1.6, 2.4, 6.4]) {
    // L-shaped couch against the wall
    const base = box(1.0, 0.42, 2.6, mats.velvet, 14.0, LOUNGE.y + 0.21, zc);
    box(0.25, 0.85, 2.6, mats.velvet, 14.48, LOUNGE.y + 0.42, zc);
    box(1.0, 0.65, 0.25, mats.velvet, 14.0, LOUNGE.y + 0.32, zc - 1.3);
    wall(13.45, zc - 1.4, 14.7, zc + 1.4);
    for (let k = -1; k <= 1; k++) loungeSeats.push({ x: 13.75, z: zc + k * 0.8, y: LOUNGE.y + 0.05, ry: -Math.PI / 2, taken: null });
    // table with drinks + candle
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), counterTop);
    tb.position.set(12.6, LOUNGE.y + 0.45, zc);
    g.add(tb);
    box(0.08, 0.42, 0.08, mats.chrome, 12.6, LOUNGE.y + 0.21, zc);
    wall(12.1, zc - 0.5, 13.1, zc + 0.5);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }));
    candle.position.set(12.6, LOUNGE.y + 0.52, zc);
    g.add(candle);
    base.userData.seat = true;
  }
  // velvet rope + stanchions
  for (let z = -3; z <= 8.5; z += 1.6) {
    box(0.05, 0.95, 0.05, mats.chrome, 10.1, 0.47, z);
    if (z + 1.6 <= 8.6 && Math.abs(z - 2.6) > 0.7) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x6a0f2a, roughness: 0.9 }));
      rope.rotation.x = Math.PI / 2;
      rope.position.set(10.1, 0.82, z + 0.8);
      g.add(rope);
    }
  }
  const vip = neonSign('VIP LOUNGE', '#ff3cc8', 3.6, 0.8);
  vip.position.set(14.97, 4.2, 2.5);
  vip.rotation.y = -Math.PI / 2;
  g.add(vip);

  // ---------- balcony / mezzanine (left wall) ----------
  box(3.4, 0.25, 13, mats.dark, -13.3, 4.0, 2.5);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 13), new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.12, roughness: 0.05 }));
  glass.position.set(-11.6, 4.6, 2.5);
  g.add(glass);
  box(0.06, 0.06, 13, mats.chrome, -11.6, 5.12, 2.5);
  for (let z = -3.5; z <= 8.5; z += 3) box(0.2, 4.0, 0.2, mats.steel, -11.75, 2.0, z);
  for (let z = -3.5; z <= 8.5; z += 3) wall(-11.85, z - 0.1, -11.65, z + 0.1);

  // ---------- backstage / green room ----------
  box(2.4, 0.45, 0.9, mats.leather, -4, STAGE.y + 0.22, -13.4);
  box(2.4, 0.6, 0.2, mats.leather, -4, STAGE.y + 0.55, -13.8);
  wall(-5.2, -14, -2.8, -12.9);
  for (let i = 0; i < 4; i++) {
    const fc = box(0.9, 0.6, 0.6, mats.black, 3 + (i % 2) * 1.0, STAGE.y + 0.3 + Math.floor(i / 2) * 0.6, -13.4);
    box(0.92, 0.03, 0.62, mats.chrome, fc.position.x, fc.position.y + 0.3, -13.4);
  }
  wall(2.5, -13.8, 4.5, -13.0);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0x99aabb, roughness: 0.05, metalness: 1 }));
  mirror.position.set(0, STAGE.y + 1.6, -13.97);
  g.add(mirror);
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false }));
    const a = (i / 10) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.9, STAGE.y + 1.6 + Math.sin(a) * 0.6, -13.95);
    g.add(b);
  }
  box(0.7, 1.4, 0.6, mats.steel, 6.6, STAGE.y + 0.7, -13.6); // fridge
  const staff = neonSign('STAFF ONLY', '#ff3030', 1.6, 0.4, 'bold 110px Arial');
  staff.position.set(6.9, 2.9, -9.96);
  g.add(staff);

  // ---------- entrance, exits, branding ----------
  const door = box(0.1, 2.4, 2.0, new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.4 }), -14.92, 1.2, 7.4);
  door.userData.door = true;
  for (const [x, z, ry] of [
    [-14.9, 7.4, Math.PI / 2],
    [14.9, -8.5, -Math.PI / 2],
  ]) {
    const ex = neonSign('EXIT', '#22ff66', 0.8, 0.25, 'bold 150px Arial');
    ex.position.set(x, 2.8, z);
    ex.rotation.y = ry;
    g.add(ex);
  }
  const logo = neonSign('SUBLEVEL', '#7b4dff', 7, 1.6, 'bold 180px Helvetica, Arial');
  logo.position.set(-14.95, 6.0, -2.5);
  logo.rotation.y = Math.PI / 2;
  g.add(logo);
  // wall uplight washes (fake light pools)
  const washTex = canvasTex(128, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(w * 0.42, h);
    c.lineTo(w * 0.58, h);
    c.lineTo(w, 0);
    c.lineTo(0, 0);
    c.fill();
  });
  const washes = [];
  const washSpots = [];
  for (let z = -8; z <= 8; z += 3.2) washSpots.push([-14.97, z, Math.PI / 2], [14.97, z, -Math.PI / 2]);
  for (let x = -12; x <= 12; x += 4) if (Math.abs(x) > 7.5) washSpots.push([x, 9.97, Math.PI]);
  for (const [x, z, ry] of washSpots) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6), new THREE.MeshBasicMaterial({ map: washTex, color: 0x5a2cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.6 }));
    w.position.set(x, 3.0, z);
    w.rotation.y = ry;
    g.add(w);
    washes.push(w);
  }

  // ---------- haze ----------
  scene.fog = new THREE.FogExp2(0x07060d, 0.022);
  const smokeTex = canvasTex(128, 128, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
  const smoke = [];
  for (let i = 0; i < 14; i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x4a3a8a, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    sm.position.set((Math.random() - 0.5) * 22, 0.8 + Math.random() * 5.5, -8 + Math.random() * 15);
    sm.scale.setScalar(5 + Math.random() * 5);
    sm.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.3) * 0.04, (Math.random() - 0.5) * 0.12);
    g.add(sm);
    smoke.push(sm);
  }

  // ---------- camera rigs (visible where the views are filmed from) ----------
  const camRig = (x, y, z, ry) => {
    const r = new THREE.Group();
    r.position.set(x, y, z);
    r.rotation.y = ry;
    const bodyC = box(0.12, 0.08, 0.16, mats.black, 0, 0, 0, r);
    const lensC = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 16), mats.chrome);
    lensC.rotation.x = Math.PI / 2;
    lensC.position.z = 0.1;
    r.add(lensC);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false }));
    rec.position.set(0.04, 0.05, 0.05);
    r.add(rec);
    g.add(r);
    return r;
  };
  camRig(0, STAGE.y + 1.25, -7.25, Math.PI); // fisheye cam in front of the decks (faces the DJ)
  camRig(-11.9, 5.3, 0, -Math.PI / 2 - 0.2); // balcony cam

  // ---------- detail pass (all static, merged into a handful of draw calls) ----------
  const foam = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 1 });
  for (const sx of [-1, 1])
    for (let z = -8.6; z <= 8.7; z += 1.12)
      for (let y = 1.4; y <= 5.3; y += 1.12) {
        if (sx < 0 && z > 5.6 && y < 3.2) continue; // entrance
        if (sx > 0 && z > -3.6 && z < 9 && y < 2.2) continue; // lounge couches
        const p = box(1.04, 1.04, 0.02, foam, sx * 14.99, y, z);
        p.rotation.y = Math.PI / 2;
      }
  const ductM = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.8, roughness: 0.45 });
  for (const sx of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 18, 16), ductM);
    d.rotation.x = Math.PI / 2;
    d.position.set(sx * 12.2, 7.45, 0);
    g.add(d);
    for (let z = -8; z <= 8; z += 2) {
      box(0.04, 0.5, 0.04, ductM, sx * 12.2, 7.85, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 16), ductM);
      ring.position.set(sx * 12.2, 7.45, z);
      g.add(ring);
    }
    box(0.08, 0.06, 18, mats.steel, sx * 14.7, 6.6, 0); // cable tray
  }
  const parLens = new THREE.MeshBasicMaterial({ color: 0x5a2cff, toneMapped: false });
  for (let i = 0; i < 12; i++) {
    const x = -8.25 + i * 1.5;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 12), mats.dark);
    can.position.set(x, 6.62, -4.3);
    can.rotation.x = 0.6;
    g.add(can);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), parLens);
    lens.position.set(x, 6.55, -4.21);
    lens.rotation.x = Math.PI / 2 + 0.6;
    g.add(lens);
  }
  const glassM = new THREE.MeshStandardMaterial({ color: 0xc8d4e0, roughness: 0.1, metalness: 0.3 });
  for (let i = 0; i < 28; i++) {
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 8), glassM);
    gl.position.set(-6.5 + i * 0.48, 1.06, 9.6);
    g.add(gl);
  }
  box(0.35, 0.25, 0.04, new THREE.MeshBasicMaterial({ color: 0x2a60ff, toneMapped: false }), 6.4, 1.3, 8.55); // POS screen
  for (const x of [-3, 3]) box(0.6, 0.02, 0.4, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }), x, 1.165, 8.3); // bar mats
  const red = new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.4 });
  for (const [x, y, z] of [[-14.65, 0.3, 5.9], [14.65, 0.3, -8.0], [7.9, 1.3, -10.4]]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), red);
    ex.position.set(x, y, z);
    g.add(ex);
  }
  const trim = mats.chrome;
  box(18.1, 0.025, 0.05, trim, 0, 0.012, -5.56);
  box(18.1, 0.025, 0.05, trim, 0, 0.012, 4.96);
  box(0.05, 0.025, 10.55, trim, -9.03, 0.012, -0.3);
  box(0.05, 0.025, 10.55, trim, 9.03, 0.012, -0.3);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a0f1a, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-3, STAGE.y + 0.005, -12.6);
  g.add(rug);
  box(0.04, 1.6, 0.04, mats.steel, -6.2, STAGE.y + 0.8, -13.5);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false, side: THREE.DoubleSide }));
  shade.position.set(-6.2, STAGE.y + 1.65, -13.5);
  g.add(shade);

  const merged = mergeStatic(g, [pix, ledWall, tiles, bottles, ...heads.map((h) => h.fix), ...lasers, ...strobes]);
  console.info('club meshes merged', merged);
  return { group: g, pix, pts, ledWallMat, tileMat, heads, lasers, strobes, strobeLight, spotA, spotB, hemi, washes, smoke, loungeSeats, mats };
}

// ---------- per-frame lighting show ----------
const cA = new THREE.Color();
const cB = new THREE.Color();
const tmp = new THREE.Color();
const BLUE = new THREE.Color(0x2418ff);
const PURPLE = new THREE.Color(0x8a1cff);
const VIOLET = new THREE.Color(0x5a2cff);
const WHITE = new THREE.Color(0xffffff);

export function updateClub(club, t, dt, m, bands, lightFX) {
  const { pix, pts } = club;
  const sec = m.section || 'idle';
  const hype = m.playing ? m.hype : 0.1;
  const build = sec === 'build' ? Math.max(0, Math.min(1, 1 - m.toDrop / 16)) : 0;
  const flash = lightFX.flash;
  const kick = m.playing ? Math.pow(1 - m.beatFrac, 3) * (m.bass > 0.4 ? 1 : 0.2) : 0;
  const dropOn = m.playing && sec === 'drop';
  const beatPulse = m.playing ? Math.pow(1 - m.beatFrac, 2.2) : 0; // hits on every beat
  const impact = lightFX.impact || 0; // 1 right at the drop, fades over 2 bars
  // ceiling pixels
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    let k;
    if (sec === 'build') {
      // chase toward the stage, speeding up into the drop
      k = 0.5 + 0.5 * Math.sin(p[2] * 1.6 + t * (4 + build * 18));
      k = k * (0.3 + build);
    } else if (sec === 'breakdown' || sec === 'intro' || sec === 'outro') {
      k = 0.25 + 0.2 * Math.sin(p[0] * 0.7 + t * 0.8) * Math.sin(p[2] * 0.5 - t * 0.6);
      if (Math.random() < 0.002) k = 1.0; // sparkle
    } else if (dropOn) {
      // drop: the whole grid punches on every kick, rings radiate out from the stage
      const d = Math.hypot(p[0], p[2] + 8);
      const ring = Math.max(0, Math.sin(d * 0.8 - (m.beat + m.beatFrac) * Math.PI * 2));
      k = 0.16 + beatPulse * 1.15 + ring * 0.45 * beatPulse + impact * 1.3;
    } else {
      // groove: radial pulse on the kick + slow colour sweep
      const d = Math.hypot(p[0], p[2] + 2);
      k = 0.3 + 0.7 * Math.max(0, Math.sin(d * 0.9 - t * 6)) * (0.35 + kick * 0.9) * (0.5 + hype);
    }
    const mix = 0.5 + 0.5 * Math.sin(p[0] * 0.25 + p[2] * 0.2 + t * 0.35);
    tmp.copy(BLUE).lerp(PURPLE, mix).multiplyScalar(Math.max(0.03, k) * 1.6);
    if (flash > 0.01 || impact > 0.01) tmp.lerp(WHITE, Math.min(1, flash * 0.7 + impact * 0.5));
    pix.setColorAt(i, tmp);
  }
  pix.instanceColor.needsUpdate = true;
  // LED wall + floor
  const lw = club.ledWallMat.uniforms;
  lw.time.value = t;
  lw.bass.value = dropOn ? Math.max(bands.low, beatPulse) : bands.low;
  lw.high.value = bands.high;
  lw.hype.value = 0.3 + hype * 0.7;
  lw.flash.value = Math.max(flash, dropOn ? beatPulse * 0.3 : 0, impact * 0.6);
  lw.build.value = build;
  const tl = club.tileMat.uniforms;
  tl.time.value = t;
  tl.bass.value = bands.low;
  tl.hype.value = 0.2 + hype;
  tl.flash.value = Math.max(flash, dropOn ? beatPulse * 0.7 : 0);
  // moving heads
  for (const h of club.heads) {
    const ph = dropOn ? m.bar * 1.3 + h.phase + Math.sin(t * 2.4 + h.phase) * 0.35 : t * 0.35 + h.phase;
    let pan = Math.sin(ph) * 0.7;
    let tilt = 0.35 + Math.sin(ph * 1.3) * 0.25;
    if (sec === 'build') {
      tilt = 0.1 + build * 0.6 * Math.abs(Math.sin(t * 2 + h.phase));
      pan = (h.i - 4.5) * 0.12;
    }
    if (sec === 'breakdown') tilt = 0.15 + Math.sin(ph) * 0.1;
    h.head.rotation.set(tilt, 0, pan);
    const col = h.i % 3 === 0 ? VIOLET : h.i % 2 ? BLUE : PURPLE;
    h.beam.material.uniforms.color.value.copy(col).lerp(WHITE, Math.min(1, Math.max(flash * 0.8, impact * 0.75)));
    const on = dropOn ? 0.5 + beatPulse * 1.1 + impact * 1.6 : sec === 'groove' ? 0.55 + kick * 0.6 : sec === 'build' ? 0.4 + build * 0.9 : 0.35;
    h.beam.material.uniforms.intensity.value = m.playing ? on : 0.2;
    h.lens.material.color.copy(col).multiplyScalar(1 + on);
  }
  // lasers: fan sweeps on drops/grooves, off otherwise
  club.lasers.forEach((l, i) => {
    const active = m.playing && (sec === 'drop' || (sec === 'build' && build > 0.6));
    l.material.opacity += ((active ? 0.75 : 0) - l.material.opacity) * Math.min(1, dt * 8);
    const fan = ((i >> 1) / 6 - 0.5) * 1.6;
    l.rotation.set(1.35 + Math.sin(t * (dropOn ? 3.2 : 1.5) + i) * 0.14, 0, fan + Math.sin(t * (dropOn ? 1.9 : 0.8)) * 0.35);
    l.material.color.copy(i % 4 === 0 ? PURPLE : VIOLET).lerp(WHITE, 0.25);
  });
  // strobes
  const strobeOn = lightFX.strobe > 0 && Math.floor(t * 14) % 2 === 0;
  club.strobes.forEach((s) => s.material.color.setScalar(strobeOn || flash > 0.5 ? 3 : 0.05));
  club.strobeLight.intensity = strobeOn ? 22 : flash * 26;
  // crowd spots follow the colour scheme + kick
  cA.copy(BLUE).lerp(PURPLE, 0.5 + 0.5 * Math.sin(t * 0.4));
  cB.copy(PURPLE).lerp(BLUE, 0.5 + 0.5 * Math.sin(t * 0.4));
  club.spotA.color.copy(cA);
  club.spotB.color.copy(cB);
  club.spotA.intensity = 26 + (dropOn ? beatPulse * 70 : kick * 40 * hype) + flash * 60 + impact * 40;
  club.spotB.intensity = 26 + (dropOn ? beatPulse * 70 : kick * 40 * hype) + flash * 60 + impact * 40;
  club.hemi.intensity = 0.45 + (dropOn ? beatPulse * 0.45 : 0) + impact * 0.8 + flash * 0.5;
  club.spotA.target.position.x = -2 + Math.sin(t * 0.5) * 3;
  club.spotB.target.position.x = 2 + Math.cos(t * 0.45) * 3;
  club.washes.forEach((w, i) => {
    w.material.color.copy(i % 2 ? BLUE : PURPLE);
    w.material.opacity = 0.35 + 0.4 * hype + (i % 4 === m.beatInBar ? kick * 0.3 : 0) + (dropOn ? beatPulse * 0.35 : 0);
  });
  // haze drift
  for (const s of club.smoke) {
    s.position.addScaledVector(s.userData.v, dt);
    if (s.position.x > 12) s.position.x = -12;
    if (s.position.x < -12) s.position.x = 12;
    if (s.position.y > 6.5 || s.position.y < 0.5) s.userData.v.y *= -1;
    if (s.position.z > 8 || s.position.z < -9) s.userData.v.z *= -1;
    s.material.color.copy(cA).multiplyScalar(0.35 + flash * 0.25);
    s.material.opacity = 0.035 + hype * 0.03;
  }
}
