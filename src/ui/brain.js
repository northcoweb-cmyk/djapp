// Brain view: a stylised side view of a brain whose regions light up from the crowd's (or one
// person's) state. Based on music neuroscience: the caudate ramps up dopamine while people
// anticipate a drop, the nucleus accumbens releases it at the peak; motor cortex/basal ganglia
// track groove, auditory cortex follows the sound, cerebellum the beat timing, the amygdala the
// chills, and prefrontal cortex the prediction of what comes next.
export const REGIONS = [
  { id: 'prefrontal', label: 'Prefrontal · prediction', x: 52, y: 70, r: 28, color: [120, 200, 255] },
  { id: 'motor', label: 'Motor cortex · groove', x: 128, y: 30, r: 26, color: [80, 120, 255] },
  { id: 'auditory', label: 'Auditory cortex · sound', x: 140, y: 92, r: 22, color: [80, 230, 200] },
  { id: 'caudate', label: 'Caudate · anticipation', x: 112, y: 64, r: 15, color: [255, 210, 60] },
  { id: 'accumbens', label: 'Nucleus accumbens · reward', x: 90, y: 92, r: 14, color: [255, 70, 150] },
  { id: 'amygdala', label: 'Amygdala · chills', x: 118, y: 106, r: 12, color: [255, 120, 60] },
  { id: 'cerebellum', label: 'Cerebellum · timing', x: 207, y: 124, r: 22, color: [170, 120, 255] },
];

const OUTLINE = [
  [40, 112],
  [28, 92, 24, 62, 44, 40],
  [64, 18, 108, 10, 150, 14],
  [196, 18, 236, 40, 246, 74],
  [252, 96, 240, 112, 222, 112],
  [196, 120, 168, 118, 150, 122],
  [124, 132, 92, 130, 70, 124],
  [56, 120, 46, 118, 40, 112],
];
const GYRI = [
  [60, 46, 80, 36, 96, 48],
  [70, 70, 92, 58, 104, 76],
  [128, 24, 140, 44, 132, 60],
  [158, 26, 176, 40, 170, 62],
  [186, 34, 206, 52, 200, 74],
  [212, 60, 230, 74, 226, 96],
  [150, 80, 176, 74, 196, 92],
  [96, 104, 120, 96, 142, 108],
  [50, 88, 64, 96, 70, 112],
];

export class BrainView {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.bursts = [];
    this.acc = 0;
  }
  burst() {
    this.bursts.push({ t: 0 });
  }
  draw(dt, v, beatFrac) {
    this.acc += dt;
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter((b) => b.t < 1.4);
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const c = this.c;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = this.g;
    const s = Math.min(W / 270, H / 160);
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ((W - 270 * s) / 2), dpr * ((H - 160 * s) / 2));
    g.clearRect(-50, -50, 400, 300);
    // brainstem + cerebellum + cerebrum
    g.fillStyle = '#16122a';
    g.strokeStyle = '#3a2c66';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(150, 118);
    g.quadraticCurveTo(160, 140, 156, 158);
    g.lineTo(172, 158);
    g.quadraticCurveTo(176, 136, 170, 116);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(207, 124, 34, 19, -0.15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(OUTLINE[0][0], OUTLINE[0][1]);
    for (let i = 1; i < OUTLINE.length; i++) {
      const p = OUTLINE[i];
      g.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(120,100,200,0.25)';
    g.lineWidth = 1.2;
    for (const q of GYRI) {
      g.beginPath();
      g.moveTo(q[0], q[1]);
      g.quadraticCurveTo(q[2], q[3], q[4], q[5]);
      g.stroke();
    }
    g.restore();
    // region glows
    g.globalCompositeOperation = 'lighter';
    const pulse = Math.pow(1 - (beatFrac || 0), 3);
    for (const r of REGIONS) {
      let val = Math.max(0, Math.min(1, v[r.id] || 0));
      if (r.id === 'auditory' || r.id === 'cerebellum') val *= 0.65 + 0.35 * pulse;
      if (val < 0.02) continue;
      const rad = r.r * (0.8 + val * 0.5);
      const grd = g.createRadialGradient(r.x, r.y, 0, r.x, r.y, rad);
      const [cr, cg, cb] = r.color;
      grd.addColorStop(0, `rgba(${cr},${cg},${cb},${0.85 * val})`);
      grd.addColorStop(0.5, `rgba(${cr},${cg},${cb},${0.35 * val})`);
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, Math.PI * 2);
      g.fill();
    }
    // dopamine burst rings from the reward centre at drops
    for (const b of this.bursts) {
      const k = b.t / 1.4;
      g.strokeStyle = `rgba(255,90,170,${(1 - k) * 0.9})`;
      g.lineWidth = 3 * (1 - k) + 0.5;
      g.beginPath();
      g.arc(90, 92, 8 + k * 110, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // labels for the brightest regions
    g.font = '7px system-ui';
    for (const r of REGIONS) {
      const val = v[r.id] || 0;
      if (val < 0.35) continue;
      g.fillStyle = `rgba(255,255,255,${0.4 + val * 0.5})`;
      g.fillText(r.label.split(' · ')[0], r.x - 16, r.y - r.r * 0.6);
    }
  }
}
