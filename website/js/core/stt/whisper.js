/**
 * Cihaz içi Whisper istemcisi — ses bilgisayardan çıkmaz.
 * WebGPU varsa ekran kartında (hızlı), yoksa WebAssembly ile işlemcide çalışır.
 *
 * Kalite önlemleri
 *  - Ses, akustik çözümlemedeki konuşma bölümlerine göre ≤ 24 sn'lik pencerelere bölünür;
 *    uzun sessizlikler modele verilmez (Whisper sessizlikte metin "uydurur").
 *  - Pencereler uzun duraksamalarda (≥ 1,5 sn) bölünür; her pencere bir ya da birkaç sözce olur.
 *  - Bilinen uydurma kalıpları ("Altyazı M.K.", "İzlediğiniz için teşekkürler"…) ayıklanır.
 */
export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-small', label: 'Whisper Small — dengeli (önerilen)', size: 'ilk kullanımda ~250–500 MB', webgpuOnly: false },
  { id: 'onnx-community/whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo — en doğru', size: 'ilk kullanımda ~800 MB', webgpuOnly: true },
  { id: 'onnx-community/whisper-base', label: 'Whisper Base — en hızlı, düşük doğruluk', size: 'ilk kullanımda ~80–200 MB', webgpuOnly: false },
];

export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/** Cihaza uygun varsayılan model. */
export function defaultWhisperModel(preferred) {
  const m = WHISPER_MODELS.find((x) => x.id === preferred);
  if (m && (!m.webgpuOnly || hasWebGPU())) return m.id;
  return WHISPER_MODELS[0].id;
}

const HALLUCINATIONS = [
  /altyaz[ıi]/i, /izlediğiniz için/i, /abone ol/i, /beğen(meyi|ip) unutma/i, /bir sonraki videoda/i, /kanal[ıi]ma/i,
  /\bM\.\s?K\.?$/, /www\.|\.com\b/i, /^\s*[[(].{0,30}[\])]\s*$/, /♪|🎵/, /^[\s.,!?…-]*$/,
];
const isHallucination = (t) => HALLUCINATIONS.some((re) => re.test(t));

/**
 * Whisper'ın tekrar döngülerini ("ne yapabilirsiniz ne yapabilirsiniz …" × 50) tek söyleyişe indirir.
 * Klinik açıdan anlamlı tekrarlar (ör. "ben ben ben", sözcük/öbek tekrarı 2–5 kez) korunur:
 * tek/iki sözcük için ≥ 8, daha uzun öbekler için ≥ 5 ardışık tekrar döngü sayılır.
 * @returns {{text: string, looped: boolean}}
 */
export function collapseLoops(text) {
  let words = text.split(/\s+/).filter(Boolean);
  const key = (w) => w.toLocaleLowerCase('tr-TR').replace(/[.,!?…;:"'()]/g, '');
  let looped = false;
  for (let n = 1; n <= 8; n++) {
    const limit = n <= 2 ? 8 : 5;
    const out = [];
    let i = 0;
    while (i < words.length) {
      let reps = 1;
      const same = (a, b) => { for (let k = 0; k < n; k++) if (key(words[a + k] || '') !== key(words[b + k] || '')) return false; return true; };
      while (i + (reps + 1) * n <= words.length && same(i, i + reps * n)) reps++;
      if (reps >= limit) {
        out.push(...words.slice(i, i + n));
        i += reps * n;
        looped = true;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    words = out;
  }
  return { text: words.join(' '), looped };
}

let worker = null;
let seq = 0;
let forcedDevice = null;

function getWorker() {
  if (!worker) worker = new Worker(new URL('../../workers/whisper.worker.js', import.meta.url), { type: 'module' });
  return worker;
}

/** Tek bir ses parçasını işçide yazıya döker. */
function runChunk(audio, model, device, o) {
  const w = getWorker();
  const id = ++seq;
  const files = new Map();
  return new Promise((resolve, reject) => {
    const cleanup = () => { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); };
    const onErr = (e) => {
      cleanup();
      worker?.terminate();
      worker = null;
      reject(new Error(`Whisper başlatılamadı${e && e.message ? `: ${e.message}` : ''}. Sayfayı yenileyip tekrar deneyin.`));
    };
    const onMsg = (ev) => {
      const m = ev.data;
      if (m.type === 'fatal') { cleanup(); reject(new Error(m.message)); return; }
      if (m.id !== id) return;
      if (m.type === 'load') {
        const d = m.data;
        if (d.status === 'progress_total' && d.total) {
          o.onLoad?.(d.loaded / d.total, `Model indiriliyor: ${(d.loaded / 1e6).toFixed(0)} / ${(d.total / 1e6).toFixed(0)} MB (yalnızca ilk kullanımda)`);
        } else if (d.status === 'progress' && d.total) {
          files.set(d.file, { loaded: d.loaded, total: d.total });
          let l = 0;
          let t = 0;
          for (const f of files.values()) { l += f.loaded; t += f.total; }
          o.onLoad?.(t ? l / t : 0, `Model indiriliyor: ${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} MB (yalnızca ilk kullanımda)`);
        }
      } else if (m.type === 'status') {
        if (m.status === 'fallback') forcedDevice = 'wasm';
        o.onStatus?.(m.status, m.device);
      } else if (m.type === 'done') {
        cleanup();
        if (m.device && m.device !== device) forcedDevice = m.device;
        resolve(m.result);
      } else if (m.type === 'error') {
        cleanup();
        reject(new Error(m.message));
      }
    };
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    const copy = audio.slice();
    // Türkçe konuşma ≈ 5–8 parça/sn; döngüye giren model için süreye göre üst sınır
    const maxTokens = Math.min(440, Math.ceil((audio.length / 16000) * 12) + 16);
    w.postMessage({ id, type: 'transcribe', audio: copy, model, device, maxTokens }, [copy.buffer]);
  });
}

/**
 * Modeli önceden indirir ve ekran kartı gölgelendiricilerini ısıtır (ilk seans beklemesin).
 * 1 sn'lik sessizlik işlenir; çıktısı atılır.
 */
export async function preloadWhisper(model, o = {}) {
  const def = WHISPER_MODELS.find((m) => m.id === model);
  const device = forcedDevice || (hasWebGPU() ? 'webgpu' : 'wasm');
  if (def && def.webgpuOnly && device !== 'webgpu') throw new Error('Bu model için WebGPU gerekir.');
  try { await navigator.storage?.persist?.(); } catch { /* yok say */ }
  await runChunk(new Float32Array(16000), model, device, o);
  return forcedDevice || device;
}

/** Model dosyaları tarayıcı önbelleğinde mi? (transformers.js "transformers-cache") */
export async function whisperCacheStatus(model) {
  try {
    if (typeof caches === 'undefined') return 'unknown';
    const c = await caches.open('transformers-cache');
    const keys = (await c.keys()).map((r) => r.url);
    const mine = keys.filter((u) => u.includes(`/${model}/`));
    // Bu cihazın yükleyeceği dosyalar (whisper.worker.js'deki DTYPES ile aynı)
    const device = forcedDevice || (hasWebGPU() ? 'webgpu' : 'wasm');
    const [encName, decName] = device === 'wasm'
      ? ['encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx']
      : model.includes('large-v3-turbo') ? ['encoder_model_q4.onnx', 'decoder_model_merged_q4.onnx'] : ['encoder_model.onnx', 'decoder_model_merged_q4.onnx'];
    const enc = mine.some((u) => u.endsWith(`/onnx/${encName}`));
    const dec = mine.some((u) => u.endsWith(`/onnx/${decName}`));
    return enc && dec ? 'cached' : mine.length ? 'partial' : 'missing';
  } catch {
    return 'unknown';
  }
}

/**
 * Konuşma bölümlerinden yazıya dökme pencereleri kurar.
 * @param {Array<{start,end}>} segs  konuşma bölümleri (sn)
 * @param {number} duration
 */
export function buildWindows(segs, duration, { maxLen = 24, pad = 0.3, splitGap = 1.5, minSpeech = 0.35, breaks = [] } = {}) {
  const out = [];
  // breaks: konuşmacı değişim anları (ör. terapist tuşu) — pencere bu anlardan geçmez
  const cuts = [...breaks].filter(Number.isFinite).sort((a, b) => a - b);
  const crosses = (a, b) => cuts.some((x) => x > a + 0.05 && x < b - 0.05);
  const push = (w) => {
    if (!w || w.speech < minSpeech) return;
    const a = cuts.filter((x) => x <= w.start).pop();
    const b = cuts.find((x) => x >= w.end);
    out.push({ start: Math.max(0, w.start - pad, a ?? -Infinity), end: Math.min(duration, w.end + pad, b ?? Infinity) });
  };
  if (!segs || !segs.length) {
    for (let t = 0; t < duration; t += maxLen) out.push({ start: t, end: Math.min(duration, t + maxLen) });
    return out;
  }
  let cur = null;
  for (const s0 of segs) {
    // Çok uzun kesintisiz konuşma ve konuşmacı değişim anları: parçala
    const bounds = [s0.start, ...cuts.filter((x) => x > s0.start && x < s0.end), s0.end];
    const pieces = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      for (let a = bounds[k]; a < bounds[k + 1]; a += maxLen) pieces.push({ start: a, end: Math.min(bounds[k + 1], a + maxLen) });
    }
    for (const s of pieces) {
      if (cur && (s.start - cur.end >= splitGap || s.end - cur.start > maxLen || crosses(cur.end, s.end) || crosses(cur.start, s.start + 0.1))) { push(cur); cur = null; }
      if (!cur) cur = { start: s.start, end: s.end, speech: 0 };
      cur.end = s.end;
      cur.speech += s.end - s.start;
    }
  }
  push(cur);
  return out;
}

/**
 * @param {Float32Array} audio16k 16 kHz mono
 * @param {object} o { model, segments (konuşma bölümleri), breaks (konuşmacı değişim anları, sn), onLoad(p,text), onStatus(status), onProgress(p,text) }
 * @returns {Promise<Array<{text,start,end}>>}
 */
export async function whisperTranscribe(audio16k, o = {}) {
  const model = o.model || WHISPER_MODELS[0].id;
  const def = WHISPER_MODELS.find((m) => m.id === model);
  let device = forcedDevice || (hasWebGPU() ? 'webgpu' : 'wasm');
  if (def && def.webgpuOnly && device !== 'webgpu') {
    throw new Error('Bu model için WebGPU destekli bir tarayıcı gerekir (güncel Chrome). "Whisper Small" modelini seçin.');
  }
  const duration = audio16k.length / 16000;
  const windows = buildWindows(o.segments, duration, { breaks: o.breaks || [] });
  const out = [];
  let loops = 0;
  const t0 = performance.now();
  for (const [i, win] of windows.entries()) {
    const slice = audio16k.subarray(Math.floor(win.start * 16000), Math.min(audio16k.length, Math.ceil(win.end * 16000)));
    const res = await runChunk(slice, model, device, o);
    device = forcedDevice || device;
    const chunks = res.chunks && res.chunks.length ? res.chunks : [{ text: res.text, timestamp: [0, win.end - win.start] }];
    for (const c of chunks) {
      // Gülme ve anlamsız hece zincirleri ("kıhıhıhıhı…") sözcük sayılmaz: CHAT olay koduna çevrilir
      const raw = (c.text || '').replace(/\s+/g, ' ').trim().replace(/\S*?([\p{L}]{1,3})\1{4,}\S*/gu, '&=güler');
      if (!raw || isHallucination(raw)) continue;
      const { text, looped } = collapseLoops(raw);
      if (looped) loops++;
      const a = c.timestamp && c.timestamp[0] != null ? win.start + c.timestamp[0] : win.start;
      const b = c.timestamp && c.timestamp[1] != null ? win.start + c.timestamp[1] : win.end;
      out.push({ text, start: Number(a.toFixed(2)), end: Number(Math.min(win.end, Math.max(a, b)).toFixed(2)) });
    }
    const elapsed = (performance.now() - t0) / 1000;
    const done = (i + 1) / windows.length;
    const eta = done > 0 ? elapsed / done - elapsed : 0;
    o.onProgress?.(done, `Whisper ${device === 'webgpu' ? '(ekran kartı)' : '(işlemci)'}: ${i + 1} / ${windows.length} bölüm${eta > 5 ? ` · kalan ~${Math.ceil(eta / 60)} dk` : ''}`);
  }
  out.loops = loops;
  return out;
}
