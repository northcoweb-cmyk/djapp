// Builds low-poly crowd versions of each character: public/models/chars/<id>_lo.glb (~1/3 triangles)
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'models');
await MeshoptSimplifier.ready;
const io = new NodeIO();
const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
for (const [id, c] of Object.entries(man.chars)) {
  const doc = await io.read(path.join(OUT, c.file));
  let before = 0;
  let after = 0;
  const count = () => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
  before = count();
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.03 }), prune(), dedup());
  after = count();
  const file = 'chars/' + id + '_lo.glb';
  await io.write(path.join(OUT, file), doc);
  c.lo = file;
  console.log(id, Math.round(before), '->', Math.round(after), 'tris');
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(man, null, 1));
