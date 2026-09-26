// Akustik çözümleme işçisi — ana iş parçacığını kilitlemeden F0/VAD hesaplar.
import { analyzeAcoustic } from '../core/audio/acoustic.js';

self.onmessage = (ev) => {
  const { id, samples, sampleRate, params } = ev.data;
  try {
    const result = analyzeAcoustic(samples, sampleRate, params, (p, label) => {
      self.postMessage({ id, type: 'progress', progress: p, label });
    });
    self.postMessage({ id, type: 'done', result }, [result.frames.buffer, result.peaks.buffer]);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
