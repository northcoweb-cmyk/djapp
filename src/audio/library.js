// Track library. Songs live in IndexedDB (audio blob + analysis + queue order) so a set
// survives reloads and is never re-analysed. Audio is decoded on demand (a decoded 4-minute
// track is ~90 MB), so only the playing and the next track are kept in memory, and analysis
// runs one track at a time in the background.
import { analyzeBuffer } from './analyzer.js';

const DB = 'clubsim';
const VER = 2;
const req = (r) =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'name' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function cleanName(n) {
  return String(n)
    .replace(/\.[^.]+$/, '')
    .replace(/^[0-9a-f]{8}-/, '')
    .replace(/_/g, ' ')
    .trim();
}
const keyOf = (name, blob) => `${name}|${blob ? blob.size : 0}`;
const statusOf = (t) => `${t.analysis.bpm} BPM · ${t.analysis.drops.length} drop${t.analysis.drops.length === 1 ? '' : 's'} · ${fmt(t.analysis.duration)}`;
export const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

let nextId = 1;
export class Library {
  constructor(ctx) {
    this.ctx = ctx;
    this.tracks = [];
    this.listeners = [];
    this.job = Promise.resolve();
    this.db = null;
    this.lastEmit = 0;
    this.onAnalysed = null;
  }
  on(fn) {
    this.listeners.push(fn);
  }
  emit() {
    this.lastEmit = performance.now();
    this.listeners.forEach((f) => f());
  }
  emitSoon() {
    if (performance.now() - this.lastEmit > 200) this.emit();
  }
  async init() {
    try {
      this.db = await openDB();
    } catch (e) {
      return;
    }
    try {
      let recs = await req(this.db.transaction('library').objectStore('library').getAll());
      if (!recs.length) {
        // migrate songs saved by the first version
        const old = await req(this.db.transaction('tracks').objectStore('tracks').getAll());
        recs = old.filter((x) => x.blob).map((x, i) => ({ key: keyOf(x.name, x.blob), name: x.name, blob: x.blob, order: i }));
        for (const r of recs) this.put(r);
      }
      recs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const r of recs) this.addRecord(r, false);
    } catch (e) {
      console.warn('library load failed', e);
    }
    this.emit();
  }
  put(rec) {
    if (!this.db) return;
    try {
      this.db.transaction('library', 'readwrite').objectStore('library').put(rec);
    } catch (e) {}
  }
  async patch(key, fields) {
    if (!this.db) return;
    try {
      const st = this.db.transaction('library', 'readwrite').objectStore('library');
      const rec = await req(st.get(key));
      if (!rec) return;
      Object.assign(rec, fields);
      this.db.transaction('library', 'readwrite').objectStore('library').put(rec);
    } catch (e) {}
  }
  addRecord(r, persist) {
    if (this.tracks.find((t) => t.key === r.key)) return null;
    const t = { id: nextId++, key: r.key, name: cleanName(r.name), file: r.blob, analysis: r.analysis || null, status: 'waiting for analysis', buffer: null };
    if (t.analysis) t.status = statusOf(t);
    this.tracks.push(t);
    if (persist) this.put({ key: r.key, name: r.name, blob: r.blob, order: 1e6 + t.id });
    if (!t.analysis) this.queueAnalysis(t);
    return t;
  }
  add(files) {
    const added = [];
    for (const f of files) {
      if (!/audio|mpeg|mp3|wav|m4a|aac|ogg|flac/i.test((f.type || '') + f.name)) continue;
      const t = this.addRecord({ key: keyOf(f.name, f), name: f.name, blob: f }, true);
      if (t) added.push(t);
    }
    this.emit();
    return added;
  }
  queueAnalysis(t) {
    this.job = this.job.then(() => this.analyze(t)).catch((e) => console.error(e));
  }
  async analyze(t) {
    if (t.removed) return;
    t.status = 'decoding';
    this.emit();
    try {
      const buf = await this.decode(t);
      t.status = 'analysing';
      this.emit();
      t.analysis = await analyzeBuffer(buf, (p, msg) => {
        t.status = `${msg} ${Math.round(p * 100)}%`;
        this.emitSoon();
      });
      t.status = statusOf(t);
      this.patch(t.key, { analysis: t.analysis });
      if (!t.keepBuffer) t.buffer = null; // decoded again when it is about to play
    } catch (e) {
      console.error(e);
      t.status = 'could not decode this file';
      t.failed = true;
    }
    this.emit();
    if (this.onAnalysed) this.onAnalysed(t);
  }
  async decode(t) {
    const ab = await t.file.arrayBuffer();
    const b = await this.ctx.decodeAudioData(ab);
    t.buffer = b;
    return b;
  }
  getBuffer(t) {
    if (t.buffer) return Promise.resolve(t.buffer);
    if (!t.decoding)
      t.decoding = this.decode(t).finally(() => {
        t.decoding = null;
      });
    return t.decoding;
  }
  release(t) {
    if (t && !t.keepBuffer) t.buffer = null;
  }
  async remove(t) {
    t.removed = true;
    this.tracks = this.tracks.filter((x) => x !== t);
    t.buffer = null;
    if (this.db)
      try {
        this.db.transaction('library', 'readwrite').objectStore('library').delete(t.key);
      } catch (e) {}
    this.emit();
  }
  saveOrder(list) {
    list.forEach((t, i) => this.patch(t.key, { order: i }));
  }
}
