// Cheap bloom for integrated GPUs: bright-pass + downsample to 1/4 resolution, two small
// separable blurs at that size, then one composite. Roughly a tenth of the work of
// UnrealBloomPass (5 mip levels, 10 blur passes) for a very similar glow on LEDs and beams.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export class CheapBloomPass extends Pass {
  constructor(strength = 0.75, threshold = 0.72) {
    super();
    this.strength = strength;
    this.threshold = threshold;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.bw = 1;
    this.bh = 1;
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: threshold }, texel: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float threshold; uniform vec2 texel; varying vec2 vUv;
        vec3 bright(vec2 uv){ vec3 c = texture2D(tDiffuse, uv).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(threshold, threshold + 0.4, l); }
        void main(){
          vec3 c = bright(vUv + texel * vec2(-1.0, -1.0)) + bright(vUv + texel * vec2(1.0, -1.0))
                 + bright(vUv + texel * vec2(-1.0, 1.0)) + bright(vUv + texel * vec2(1.0, 1.0));
          gl_FragColor = vec4(c * 0.25, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
          c += texture2D(tDiffuse, vUv + dir * 1.3846).rgb * 0.3162162;
          c += texture2D(tDiffuse, vUv - dir * 1.3846).rgb * 0.3162162;
          c += texture2D(tDiffuse, vUv + dir * 3.2308).rgb * 0.0702703;
          c += texture2D(tDiffuse, vUv - dir * 3.2308).rgb * 0.0702703;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.mixMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, strength: { value: strength } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb += texture2D(tBloom, vUv).rgb * strength; gl_FragColor = c; }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(null);
  }
  setSize(w, h) {
    this.bw = Math.max(1, Math.round(w / 4));
    this.bh = Math.max(1, Math.round(h / 4));
    this.rtA.setSize(this.bw, this.bh);
    this.rtB.setSize(this.bw, this.bh);
    this.brightMat.uniforms.texel.value.set(1 / w, 1 / h);
  }
  render(renderer, writeBuffer, readBuffer) {
    const q = this.quad;
    this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.brightMat.uniforms.threshold.value = this.threshold;
    q.material = this.brightMat;
    renderer.setRenderTarget(this.rtA);
    q.render(renderer);
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
      this.blurMat.uniforms.dir.value.set((1 + i) / this.bw, 0);
      q.material = this.blurMat;
      renderer.setRenderTarget(this.rtB);
      q.render(renderer);
      this.blurMat.uniforms.tDiffuse.value = this.rtB.texture;
      this.blurMat.uniforms.dir.value.set(0, (1 + i) / this.bh);
      renderer.setRenderTarget(this.rtA);
      q.render(renderer);
    }
    this.mixMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.mixMat.uniforms.tBloom.value = this.rtA.texture;
    this.mixMat.uniforms.strength.value = this.strength;
    q.material = this.mixMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    q.render(renderer);
  }
  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.mixMat.dispose();
    this.quad.dispose();
  }
}

// Swap physically-based materials on static surfaces for cheaper ones (Lambert, or Phong
// for metal). Big screen areas (floor, walls, stage) cost far less per pixel this way.
export function cheapenMaterials(root) {
  const cache = new Map();
  const conv = (m) => {
    if (!m || !m.isMeshStandardMaterial || m.transparent) return m;
    if (cache.has(m)) return cache.get(m);
    let nm;
    if (m.metalness > 0.5)
      nm = new THREE.MeshPhongMaterial({ color: m.color.clone(), map: m.map || null, shininess: 70, specular: new THREE.Color(0x6a6a72), emissive: m.emissive ? m.emissive.clone() : undefined });
    else nm = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map || null, emissive: m.emissive ? m.emissive.clone() : undefined, emissiveMap: m.emissiveMap || null });
    nm.side = m.side;
    nm.name = m.name;
    cache.set(m, nm);
    return nm;
  };
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return cache.size;
}
