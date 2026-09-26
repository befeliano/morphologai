/**
 * Akustik çözümlemeyi Web Worker'da çalıştırır (ana iş parçacığı serbest kalır).
 * İşçi başlatılamazsa aynı kodu ana iş parçacığında çalıştırır.
 */
import { analyzeAcoustic } from './acoustic.js';

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../../workers/acoustic.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const { id, type } = ev.data;
      const p = pending.get(id);
      if (!p) return;
      if (type === 'progress') p.onProgress?.(ev.data.progress, ev.data.label);
      else if (type === 'done') { pending.delete(id); p.resolve(ev.data.result); }
      else if (type === 'error') { pending.delete(id); p.reject(new Error(ev.data.message)); }
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'İşçi hatası'));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * @param {Float32Array} samples 16 kHz mono
 * @param {object} params {minPauseMs, vadOffsetDb}
 * @param {(p:number,label:string)=>void} onProgress
 */
export function runAcousticAnalysis(samples, sampleRate, params = {}, onProgress) {
  const w = getWorker();
  if (!w) return Promise.resolve(analyzeAcoustic(samples, sampleRate, params, onProgress || (() => {})));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const copy = samples.slice();
    w.postMessage({ id, samples: copy, sampleRate, params }, [copy.buffer]);
  });
}
