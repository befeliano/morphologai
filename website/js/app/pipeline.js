/**
 * Seans işleme hattı (canlı kayıt ve yüklenen dosya için ortak):
 *   ses → 16 kHz çözme → akustik çözümleme (işçi) → modüle özel ölçümler → metin çözümlemesi → kayıt
 */
import { decodeToMono16k } from '../core/audio/decode.js';
import { runAcousticAnalysis } from '../core/audio/analyzeAudio.js';
import { voiceReport } from '../core/audio/voice.js';
import { ddkAnalysis } from '../core/audio/ddk.js';
import { analyzeSession, summarize } from '../core/analysis.js';
import { computeFluency } from '../core/metrics/fluency.js';

const HEAVY = ['frames', 'peaks', 'f0Track'];

export function splitAcoustic(acoustic) {
  if (!acoustic) return { summary: null, heavy: null };
  const summary = {};
  const heavy = { hopSec: acoustic.hopSec };
  for (const [k, v] of Object.entries(acoustic)) {
    if (HEAVY.includes(k)) heavy[k] = v;
    else summary[k] = v;
  }
  return { summary, heavy };
}

/** Çözülmüş ses tamponunu doğal örnekleme hızında monoya indirger. */
export function mixDown(buffer) {
  const n = buffer.length;
  const out = new Float32Array(n);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / chs;
  }
  return out;
}

/** Modüle özel ölçümler (ses raporu, s/z, DDK). */
export function moduleMeasures(module, taskType, dec, acoustic) {
  const res = { voice: null, ddk: null, sz: null };
  const segs = acoustic?.speechSegments || [];
  if (module === 'voice') {
    const native = mixDown(dec.decoded);
    const sr = dec.decoded.sampleRate;
    if (taskType === 'sz') {
      const longest = [...segs].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 2).sort((a, b) => a.start - b.start);
      if (longest.length === 2) {
        const s = longest[0].end - longest[0].start;
        const z = longest[1].end - longest[1].start;
        res.sz = { s: Number(s.toFixed(2)), z: Number(z.toFixed(2)), ratio: Number((s / z).toFixed(2)), segments: longest };
      } else {
        res.sz = { error: 'Kayıtta iki ayrı uzatılmış ses (/s/ ve /z/) bulunamadı.' };
      }
    } else if (segs.length) {
      const longest = [...segs].sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
      const len = longest.end - longest.start;
      const trim = len > 2 ? 0.25 : len > 1 ? 0.1 : 0;
      const t0 = longest.start + trim;
      const t1 = longest.end - trim;
      res.voice = voiceReport(native, sr, { t0, t1 });
      if (res.voice.ok) res.voice.segmentSec = Number(len.toFixed(2));
      res.mptSec = Number(len.toFixed(2));
    }
  }
  if (module === 'motor' && segs.length) {
    const t0 = Math.max(0, segs[0].start - 0.1);
    const t1 = segs[segs.length - 1].end + 0.1;
    res.ddk = ddkAnalysis(dec.samples, dec.sampleRate, { t0, t1 });
  }
  return res;
}

/**
 * Ses kaydını çözümler.
 * @returns {{dec, acoustic, measures}}
 */
export async function analyzeAudio(app, blob, { module = 'aphasia', taskType, onProgress = () => {} } = {}) {
  onProgress(0.02, 'Ses dosyası çözülüyor…');
  const dec = await decodeToMono16k(blob);
  const s = app.settings;
  const acoustic = await runAcousticAnalysis(dec.samples, dec.sampleRate, { minPauseMs: s.minPauseMs, vadOffsetDb: s.vadOffsetDb || 0 },
    (p, label) => onProgress(0.08 + 0.72 * p, label === 'Tamamlandı' ? 'Akustik ölçümler tamam' : `Akustik çözümleme: ${label}`));
  onProgress(0.84, 'Modül ölçümleri hesaplanıyor…');
  const measures = moduleMeasures(module, taskType, dec, acoustic);
  onProgress(0.9, 'Hazır');
  return { dec, acoustic, measures };
}

/**
 * Seansı kaydeder (ses + akustik + analiz).
 */
export async function saveSession(app, p) {
  await app.lexicon();
  const { summary: acousticSummary, heavy } = splitAcoustic(p.acoustic);
  let analysis = null;
  if (p.transcriptText && p.transcriptText.trim()) {
    const norms = await app.norms(p.taskType);
    const result = analyzeSession({ transcript: p.transcriptText, acoustic: acousticSummary, settings: app.settings, norms, final: true });
    analysis = summarize(result);
  }
  const base = {
    patientId: p.patientId,
    module: p.module || 'aphasia',
    taskType: p.taskType,
    taskDetail: p.taskDetail || '',
    source: p.source,
    status: 'draft',
    recordedAt: p.recordedAt || new Date().toISOString(),
    transcript: { text: p.transcriptText || '', engine: p.engine || 'manual', segments: p.segments || [], editedAt: null },
    acoustic: acousticSummary,
    analysis,
    // Her ses kaydında akıcılık (duraksama, konuşma oranı); transkript varsa sözcük/hece hızlarıyla
    fluency: analysis?.fluency || (acousticSummary ? computeFluency(acousticSummary, null, app.settings) : null),
    voice: p.measures?.voice || null,
    ddk: p.measures?.ddk || null,
    sz: p.measures?.sz || null,
    mpt: p.measures?.mptSec || null,
    markers: p.markers || [],
    notes: p.notes || '',
    device: p.device || null,
  };
  let session = await app.repo.sessions.save(base);
  if (p.blob) {
    const a = await app.repo.audio.put(session.id, p.blob, {
      fileName: p.fileName || null,
      durationSec: p.acoustic?.durationSec ?? p.durationSec ?? null,
      sampleRate: p.audioInfo?.sampleRate ?? null,
      channels: p.audioInfo?.channels ?? null,
      bitsPerSample: p.audioInfo?.bitsPerSample ?? null,
      format: p.audioInfo?.format ?? null,
    }, { onProgress: p.onUploadProgress });
    session = await app.repo.sessions.save({
      ...session,
      audioId: a.id,
      audioMeta: { mimeType: a.mimeType, sizeBytes: a.sizeBytes, durationSec: a.durationSec, sampleRate: a.sampleRate, channels: a.channels, bitsPerSample: a.bitsPerSample, format: a.format, fileName: a.fileName },
    });
  }
  if (heavy) await app.repo.acoustic.put(session.id, heavy);
  app.refreshCounts();
  return session;
}
