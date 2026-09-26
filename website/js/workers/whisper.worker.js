// Cihaz içi Whisper (transformers.js) — ses bilgisayardan çıkmaz. İlk kullanımda model indirilir ve önbelleğe alınır.
// ÖNEMLİ: kütüphane dinamik import() ile yüklenir. Modül işçisindeki statik "import … from"
// tarayıcıda işçi betiği sayılır ve CSP'nin worker-src 'self' kuralına takılıp işçiyi
// sessizce öldürür. Dosya yolu da açık yazılmalıdır (yolsuz paket adresi kullanılmaz).
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';

let libPromise = null;
function lib() {
  if (!libPromise) {
    libPromise = import(LIB).then((m) => {
      // İşçi bağlamında model önbelleği varsayılan olarak kapalı gelir: açıkça aç ki
      // model bir kez indirilsin, sonraki seanslarda tarayıcı önbelleğinden yüklensin
      m.env.useBrowserCache = typeof caches !== 'undefined';
      m.env.useWasmCache = true;
      // Sayfa çapraz köken yalıtımlı değil: ONNX çalışma zamanı ek işçi (iş parçacığı / vekil) açamaz
      m.env.allowLocalModels = false;
      if (m.env.backends?.onnx?.wasm) {
        m.env.backends.onnx.wasm.proxy = false;
        m.env.backends.onnx.wasm.numThreads = 1;
      }
      return m;
    }).catch((err) => {
      libPromise = null;
      throw new Error(`Whisper kütüphanesi yüklenemedi (${err && err.message ? err.message : err}). İnternet bağlantınızı kontrol edin.`);
    });
  }
  return libPromise;
}

const DTYPES = {
  'onnx-community/whisper-base': { webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, wasm: 'q8' },
  'onnx-community/whisper-small': { webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, wasm: 'q8' },
  'onnx-community/whisper-large-v3-turbo': { webgpu: { encoder_model: 'q4', decoder_model_merged: 'q4' }, wasm: 'q8' },
};

let asr = null;
let loaded = null;

async function load(id, model, device) {
  const key = `${model}|${device}`;
  if (asr && loaded === key) return;
  self.postMessage({ id, type: 'status', status: 'loading', device });
  const { pipeline } = await lib();
  asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype: (DTYPES[model] || {})[device] || (device === 'webgpu' ? 'fp32' : 'q8'),
    progress_callback: (p) => self.postMessage({ id, type: 'load', data: { status: p.status, file: p.file, progress: p.progress, loaded: p.loaded, total: p.total } }),
  });
  loaded = key;
}

self.onmessage = async (ev) => {
  const { id, type } = ev.data;
  if (type !== 'transcribe') return;
  const { audio, model, maxTokens } = ev.data;
  let { device } = ev.data;
  try {
    try {
      await load(id, model, device);
    } catch (err) {
      // WebGPU bazı sürücülerde/tarayıcılarda başlatılamaz: WebAssembly ile yeniden dene
      if (device !== 'webgpu') throw err;
      asr = null;
      loaded = null;
      device = 'wasm';
      self.postMessage({ id, type: 'status', status: 'fallback', device, reason: err && err.message ? err.message : String(err) });
      await load(id, model, device);
    }
    self.postMessage({ id, type: 'status', status: 'transcribing', device });
    // İstemci sesi ≤ 24 sn'lik pencerelere böler; daha uzun ses gelirse 30 sn'lik parçalarla işlenir
    const out = await asr(audio, {
      language: 'turkish',
      task: 'transcribe',
      return_timestamps: true,
      // Süreye göre üst sınır: tekrar döngüsüne giren model boşuna 448 parça üretmesin
      ...(maxTokens ? { max_new_tokens: maxTokens } : {}),
      ...(audio.length > 30 * 16000 ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
    });
    self.postMessage({ id, type: 'done', device, result: { text: out.text, chunks: out.chunks || [] } });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

// Yakalanmamış hatalar da istemciye iletilsin (işçi sessizce kalmasın)
self.addEventListener('error', (e) => self.postMessage({ id: -1, type: 'fatal', message: e.message || 'Whisper işçisi hatası' }));
self.addEventListener('unhandledrejection', (e) => self.postMessage({ id: -1, type: 'fatal', message: String(e.reason && e.reason.message ? e.reason.message : e.reason) }));
