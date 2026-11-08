// Performance helpers.
//  - mergeStatic: merge static meshes per material (cuts draw calls)
//  - prepCharacter: one shared skeleton + one skinned mesh per character
//  - atlasCharacter: pack every material of a character into ONE texture atlas and tag each
//    vertex with its clothing region, so a whole person is a single draw call. Per-person
//    outfit colours are applied in the shader (tints[region]).
//  - bakeColored: merge a small prop into one vertex-coloured mesh
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function normalizeStatic(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export function mergeStatic(root, exclude = []) {
  root.updateMatrixWorld(true);
  const ex = new Set();
  for (const o of exclude) if (o) o.traverse((c) => ex.add(c));
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || ex.has(o) || Array.isArray(o.material)) return;
    if (o.material.transparent || o.userData.noMerge) return;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  });
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  let before = 0;
  let after = 0;
  for (const [mat, list] of byMat) {
    before += list.length;
    if (list.length < 2) {
      after += list.length;
      continue;
    }
    const geos = list.map((m) => normalizeStatic(m.geometry).applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    if (!merged) {
      after += list.length;
      continue;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const m of list) m.parent && m.parent.remove(m);
    after++;
  }
  return { before, after };
}

// Merge every mesh under `group` into one geometry with vertex colours.
// colorOf(mesh) -> THREE.Color (defaults to the mesh material colour).
export function bakeColored(group, material, colorOf) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  const geos = [];
  group.traverse((m) => {
    if (!m.isMesh) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    const col = (colorOf && colorOf(m)) || (m.material && m.material.color) || new THREE.Color(1, 1, 1);
    const n = g.attributes.position.count;
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      ca[i * 3] = col.r;
      ca[i * 3 + 1] = col.g;
      ca[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(ca, 3));
    g.morphAttributes = {};
    g.clearGroups();
    geos.push(g);
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
  return mesh;
}

// One skeleton + (when possible) one merged SkinnedMesh per character template.
export function prepCharacter(root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  for (const m of meshes) if (/lash/i.test(m.name)) m.parent.remove(m); // invisible at club distance
  const list = meshes.filter((m) => !/lash/i.test(m.name));
  if (!list.length) return root;
  for (const m of list) {
    const src = m.material;
    m.material = new THREE.MeshLambertMaterial({
      name: m.name,
      map: src.map || null,
      normalMap: src.normalMap || null,
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      alphaTest: src.alphaTest || 0,
      side: src.side,
    });
  }
  const bones = [];
  const inverses = [];
  const idx = new Map();
  for (const m of list)
    m.skeleton.bones.forEach((b, i) => {
      if (!idx.has(b)) {
        idx.set(b, bones.length);
        bones.push(b);
        inverses.push(m.skeleton.boneInverses[i].clone());
      }
    });
  const skeleton = new THREE.Skeleton(bones, inverses);
  const geos = [];
  for (const m of list) {
    const g = m.geometry.clone();
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const remap = m.skeleton.bones.map((b) => idx.get(b));
    const ia = new Uint16Array(si.count * 4);
    const wa = new Float32Array(si.count * 4);
    for (let i = 0; i < si.count; i++) {
      ia[i * 4] = remap[si.getX(i)] ?? 0;
      ia[i * 4 + 1] = remap[si.getY(i)] ?? 0;
      ia[i * 4 + 2] = remap[si.getZ(i)] ?? 0;
      ia[i * 4 + 3] = remap[si.getW(i)] ?? 0;
      wa[i * 4] = sw.getX(i);
      wa[i * 4 + 1] = sw.getY(i);
      wa[i * 4 + 2] = sw.getZ(i);
      wa[i * 4 + 3] = sw.getW(i);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ia, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wa, 4));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(si.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of ['position', 'normal', 'uv']) {
      const a = g.attributes[k];
      if (a.normalized || !(a.array instanceof Float32Array) || a.isInterleavedBufferAttribute) {
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(k, new THREE.Float32BufferAttribute(f, a.itemSize));
      } else g.setAttribute(k, a.clone());
    }
    g.morphAttributes = {};
    geos.push(g);
  }
  const sameBind = list.every((m) => m.bindMatrix.equals(list[0].bindMatrix));
  let merged = null;
  if (sameBind) {
    const allIndexed = geos.every((g) => g.index);
    const gg = allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
    try {
      merged = mergeGeometries(gg, true);
    } catch (e) {
      merged = null;
    }
  }
  if (merged) {
    const sm = new THREE.SkinnedMesh(
      merged,
      list.map((m) => m.material)
    );
    sm.name = 'body';
    const parent = list[0].parent;
    parent.add(sm);
    sm.bind(skeleton, list[0].bindMatrix);
    for (const m of list) m.parent.remove(m);
  } else {
    list.forEach((m, i) => {
      m.geometry = geos[i];
      m.bind(skeleton, m.bindMatrix);
    });
  }
  return root;
}

// ---------------- texture atlas + per-person tint shader ----------------
export function classifyRegion(name) {
  const n = (name || '').toLowerCase();
  if (/hair/.test(n)) return 'hair';
  if (/lash|brow|eye/.test(n)) return 'eyes';
  if (/body|skin|head/.test(n)) return 'skin';
  if (/shoe|sneaker|boot/.test(n)) return 'shoes';
  if (/sock/.test(n)) return 'socks';
  if (/pant|short|bottom|jean|skirt|trouser/.test(n)) return 'bottom';
  if (/belt/.test(n)) return 'belt';
  if (/tie/.test(n)) return 'tie';
  if (/shirt|cloth|top|sweater|zipper|suit|collar|jacket|hood|dress/.test(n)) return 'top';
  return 'other';
}

function tintCompile(shader) {
  shader.uniforms.tints = this.userData.tints;
  shader.uniforms.tintMix = this.userData.tintMix;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float region;\nvarying float vRegion;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = region;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 tints[8];\nuniform float tintMix[8];\nvarying float vRegion;')
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        int ri = int(vRegion + 0.5);
        vec3 tc = tints[ri];
        float tm = tintMix[ri];
        float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb * tc, tc * (0.35 + 1.25 * luma), tm);
      }`
    );
}

export function makeTintMaterial(template) {
  const m = template.clone();
  m.userData = {
    tints: { value: Array.from({ length: 8 }, () => new THREE.Color(1, 1, 1)) },
    tintMix: { value: new Array(8).fill(0) },
  };
  m.onBeforeCompile = tintCompile;
  return m;
}

const atlasCache = new Map();
function releaseMaps(mats) {
  for (const m of mats)
    for (const t of [m.map, m.normalMap]) {
      if (!t) continue;
      if (t.image && typeof t.image.close === 'function') t.image.close();
      t.dispose();
    }
}
function buildAtlas(mats) {
  const n = mats.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const C = 512;
  const CN = 256;
  const pad = 3;
  const W = cols * C;
  const H = rows * C;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const hasNormal = mats.some((m) => m.normalMap && m.normalMap.image);
  let nv = null;
  let nctx = null;
  if (hasNormal) {
    nv = document.createElement('canvas');
    nv.width = cols * CN;
    nv.height = rows * CN;
    nctx = nv.getContext('2d');
    nctx.fillStyle = 'rgb(128,128,255)';
    nctx.fillRect(0, 0, nv.width, nv.height);
  }
  const cells = new Map();
  const regions = [];
  mats.forEach((m, i) => {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    try {
      if (m.map && m.map.image) ctx.drawImage(m.map.image, cx * C, cy * C, C, C);
      else {
        ctx.fillStyle = '#' + (m.color ? m.color.getHexString() : 'ffffff');
        ctx.fillRect(cx * C, cy * C, C, C);
      }
      if (nctx && m.normalMap && m.normalMap.image) nctx.drawImage(m.normalMap.image, cx * CN, cy * CN, CN, CN);
    } catch (e) {
      ctx.fillStyle = '#888';
      ctx.fillRect(cx * C, cy * C, C, C);
    }
    cells.set(m.name, { u0: (cx * C + pad) / W, v0: (cy * C + pad) / H, su: (C - 2 * pad) / W, sv: (C - 2 * pad) / H, region: Math.min(7, i) });
    regions.push({ name: m.name, kind: classifyRegion(m.name), index: Math.min(7, i) });
  });
  const map = new THREE.CanvasTexture(cv);
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 2;
  let normalMap = null;
  if (nv) {
    normalMap = new THREE.CanvasTexture(nv);
    normalMap.flipY = false;
    normalMap.colorSpace = THREE.NoColorSpace;
  }
  const material = new THREE.MeshLambertMaterial({ map, normalMap, alphaTest: 0.35, side: THREE.DoubleSide });
  // release the per-material textures; the atlas replaces them
  releaseMaps(mats);
  return { cells, regions, material };
}

export function atlasCharacter(root, key) {
  let sm = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh && !sm) sm = o;
  });
  if (!sm) return null;
  const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
  let atlas = atlasCache.get(key);
  if (!atlas) {
    atlas = buildAtlas(mats);
    atlasCache.set(key, atlas);
  } else releaseMaps(mats);
  const g = sm.geometry;
  const uv = g.attributes.uv;
  const n = uv.count;
  const region = new Float32Array(n);
  const visited = new Uint8Array(n);
  const idx = g.index;
  const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : n, materialIndex: 0 }];
  for (const gr of groups) {
    const m = mats[gr.materialIndex] || mats[0];
    const cell = atlas.cells.get(m.name) || { u0: 0, v0: 0, su: 1, sv: 1, region: 0 };
    for (let k = gr.start; k < gr.start + gr.count; k++) {
      const v = idx ? idx.getX(k) : k;
      if (visited[v]) continue;
      visited[v] = 1;
      let u = uv.getX(v);
      let w = uv.getY(v);
      if (u < 0 || u > 1) u -= Math.floor(u);
      if (w < 0 || w > 1) w -= Math.floor(w);
      uv.setXY(v, cell.u0 + u * cell.su, cell.v0 + w * cell.sv);
      region[v] = cell.region;
    }
  }
  uv.needsUpdate = true;
  g.setAttribute('region', new THREE.BufferAttribute(region, 1));
  g.clearGroups();
  sm.material = atlas.material;
  sm.userData.regions = atlas.regions;
  // generous fixed bounds so culling never needs a per-person skinned bounds pass
  g.computeBoundingSphere();
  sm.boundingSphere = g.boundingSphere.clone();
  sm.boundingSphere.radius *= 1.6;
  return sm;
}
