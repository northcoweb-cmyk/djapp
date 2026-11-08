// Performance helpers: merge static meshes per material (cuts draw calls), and prepare
// character templates (one shared skeleton + one skinned mesh per character, Lambert shading).
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

function toLambert(m, name) {
  const l = new THREE.MeshLambertMaterial({
    name,
    map: m.map || null,
    normalMap: m.normalMap || null,
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    alphaTest: m.alphaTest || 0,
    side: m.side,
    transparent: false,
  });
  return l;
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
  for (const m of list) m.material = toLambert(m.material, m.name);
  // unified skeleton
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
      if (a.normalized || !(a.array instanceof Float32Array)) {
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(k, new THREE.Float32BufferAttribute(f, a.itemSize));
      }
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
    // fallback: keep meshes, but share one skeleton (one bone update per person)
    list.forEach((m, i) => {
      m.geometry = geos[i];
      m.bind(skeleton, m.bindMatrix);
    });
  }
  return root;
}
