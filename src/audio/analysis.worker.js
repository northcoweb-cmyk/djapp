// Runs the CPU-heavy part of song analysis off the main thread.
import { analyzeBands } from './analyzer.js';

self.onmessage = async (e) => {
  const { id, bands, duration } = e.data;
  try {
    const result = await analyzeBands(bands, duration, () => {}, true);
    const w = result.wave;
    self.postMessage({ id, result }, [w.low.buffer, w.mid.buffer, w.high.buffer, w.full.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
