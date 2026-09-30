/**
 * Web Speech API ile konuşma tanıma (tr-TR).
 *
 * Gizlilik notu: Chrome'da tanıma varsayılan olarak Google sunucularında yapılır
 * (ses Google'a gönderilir). Chrome cihaz içi tanımayı destekliyorsa ve Türkçe paketi
 * kuruluysa `processLocally` ile yerel çalıştırılır. Uygulama bu durumu kullanıcıya gösterir.
 *
 *  - LiveTranscriber: kesintisiz uzun seanslar için otomatik yeniden başlatma,
 *    her kesin sonuç için yaklaşık başlangıç/bitiş zamanı.
 *  - transcribeAudioBuffer: yüklenen dosyayı (sessizce) çalıp tanır (Chrome 133+,
 *    SpeechRecognition.start(MediaStreamTrack) desteği).
 */

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function browserInfo() {
  const ua = navigator.userAgent;
  // Brave, Chrome ile aynı kullanıcı aracısını gösterir; navigator.brave ile ayırt edilir
  const brave = typeof navigator !== 'undefined' && !!navigator.brave;
  const edge = /Edg\//.test(ua);
  const opera = /OPR\//.test(ua);
  const electron = /Electron\//.test(ua);
  const chrome = /Chrome\/(\d+)/.test(ua) && !edge && !opera && !brave && !electron;
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium/.test(ua);
  const firefox = /Firefox\//.test(ua);
  const m = ua.match(/Chrome\/(\d+)/);
  return {
    name: brave ? 'Brave' : chrome ? 'Chrome' : edge ? 'Edge' : safari ? 'Safari' : firefox ? 'Firefox' : opera ? 'Opera' : electron ? 'Uygulama içi tarayıcı' : 'Diğer',
    chromeVersion: m ? Number(m[1]) : 0,
    chrome, edge, safari, firefox, brave, opera, electron,
  };
}

/**
 * Tarayıcının konuşma tanıma olanakları.
 * Brave, Opera ve uygulama içi tarayıcılarda SpeechRecognition nesnesi vardır ama Google'ın
 * tanıma hizmetine bağlanamaz ("network" hatası, hiç sonuç yok) — bu yüzden "yok" sayılır.
 */
export function sttCapabilities() {
  const b = browserInfo();
  const blocked = b.brave || b.opera || b.electron;
  const ok = !!SR && !blocked;
  return {
    available: ok,
    browser: b.name,
    blockedReason: SR && blocked ? `${b.name}, Chrome'un konuşma tanıma hizmetine bağlanamıyor.` : null,
    trackInput: ok && (b.chrome || b.edge) && b.chromeVersion >= 133,
    fileTranscription: ok && b.chrome && b.chromeVersion >= 133,
    cloudProvider: b.chrome || b.edge ? (b.edge ? 'Microsoft' : 'Google') : b.safari ? 'Apple' : null,
  };
}

/** Cihaz içi (yerel) Türkçe tanıma durumu: available | downloadable | downloading | unavailable | unsupported */
export async function onDeviceStatus(lang = 'tr-TR') {
  if (!SR || typeof SR.available !== 'function') return 'unsupported';
  try {
    return await SR.available({ langs: [lang], processLocally: true });
  } catch {
    return 'unsupported';
  }
}

export async function installOnDevice(lang = 'tr-TR') {
  if (!SR || typeof SR.install !== 'function') return false;
  try { return await SR.install({ langs: [lang], processLocally: true }); } catch { return false; }
}

const LATENCY_START = 0.35;

export class LiveTranscriber {
  /**
   * @param {object} o
   *   lang, track (MediaStreamTrack|null), clock: () => saniye,
   *   onInterim(text), onFinal({text,start,end,confidence}), onStatus(state), onError({code,message,fatal})
   *   processLocally: boolean
   */
  constructor(o = {}) {
    this.lang = o.lang || 'tr-TR';
    this.track = o.track || null;
    this.clock = o.clock || (() => performance.now() / 1000);
    this.onInterim = o.onInterim || (() => {});
    this.onFinal = o.onFinal || (() => {});
    this.onStatus = o.onStatus || (() => {});
    this.onError = o.onError || (() => {});
    this.processLocally = !!o.processLocally;
    this.active = false;
    this.paused = false;
    this.rec = null;
    this.session = 0;
    this.firstSeen = new Map();
    this.finalized = new Set();
    this.restarts = 0;
    this.networkErrors = 0;
  }

  static supported() { return !!SR; }

  start() {
    if (!SR) throw new Error('Bu tarayıcı konuşma tanımayı desteklemiyor.');
    this.active = true;
    this.paused = false;
    this._spawn();
  }

  _spawn() {
    if (!this.active || this.paused) return;
    const r = new SR();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    if (this.processLocally && 'processLocally' in r) r.processLocally = true;
    const session = ++this.session;
    r.onstart = () => this.onStatus('listening');
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const key = `${session}:${i}`;
        if (!this.firstSeen.has(key)) this.firstSeen.set(key, Math.max(0, this.clock() - LATENCY_START));
        if (res.isFinal) {
          if (this.finalized.has(key)) continue;
          this.finalized.add(key);
          const text = (res[0].transcript || '').trim();
          if (text) {
            this.onFinal({
              text,
              start: Number(this.firstSeen.get(key).toFixed(2)),
              end: Number(Math.max(this.firstSeen.get(key), this.clock() - 0.2).toFixed(2)),
              confidence: res[0].confidence ? Number(res[0].confidence.toFixed(3)) : null,
            });
          }
        } else {
          interim += res[0].transcript;
        }
      }
      this.onInterim(interim.trim());
    };
    r.onerror = (e) => {
      const code = e.error;
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'language-not-supported') {
        this.active = false;
        this.onError({ code, fatal: true, message: code === 'language-not-supported' ? 'Türkçe tanıma bu tarayıcıda kullanılamıyor.' : 'Konuşma tanıma izni verilmedi.' });
        return;
      }
      if (code === 'network') this.networkErrors++;
      this.onError({ code, fatal: false, message: code === 'network' ? 'Konuşma tanıma servisine ulaşılamadı; yeniden deneniyor…' : `Konuşma tanıma hatası: ${code}` });
    };
    r.onend = () => {
      this.onInterim('');
      if (this.rec === r) this.rec = null;
      if (this.active && !this.paused) {
        this.restarts++;
        const delay = this.networkErrors > 3 ? 1500 : 120;
        setTimeout(() => this._spawn(), delay);
      } else {
        this.onStatus('stopped');
        this._endResolve?.();
      }
    };
    this.rec = r;
    try {
      if (this.track && this.track.readyState === 'live') r.start(this.track);
      else r.start();
    } catch (err) {
      // Zaten başlamışsa ya da parça desteklenmiyorsa varsayılan mikrofona düş
      try { r.start(); } catch { this.onError({ code: 'start', fatal: false, message: String(err.message || err) }); }
    }
  }

  pause() {
    this.paused = true;
    try { this.rec?.stop(); } catch { /* yok say */ }
  }

  resume() {
    if (!this.active) return;
    this.paused = false;
    this._spawn();
  }

  /** Durdurur; son kesin sonuçların gelmesini en fazla `waitMs` bekler. */
  stop(waitMs = 1500) {
    this.active = false;
    return new Promise((resolve) => {
      if (!this.rec) { resolve(); return; }
      this._endResolve = resolve;
      try { this.rec.stop(); } catch { resolve(); }
      setTimeout(resolve, waitMs);
    });
  }
}

/**
 * Çözülmüş ses tamponunu gerçek zamanlı çalarak tanır (Chrome 133+).
 * @param {AudioBuffer} buffer
 * @param {object} o { onSegment, onInterim, onProgress, listen, signal }
 * @returns {Promise<Array<{text,start,end,confidence}>>}
 */
export async function transcribeAudioBuffer(buffer, o = {}) {
  const caps = sttCapabilities();
  if (!caps.fileTranscription) {
    throw new Error(caps.blockedReason
      ? `${caps.blockedReason} Google Chrome ile açın ya da "Cihaz içi Whisper" seçeneğini kullanın.`
      : 'Dosyadan konuşma tanıma için güncel Google Chrome (133+) gerekir. "Cihaz içi Whisper" seçeneğini kullanabilirsiniz.');
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  if (o.listen) src.connect(ctx.destination);
  const track = dest.stream.getAudioTracks()[0];
  const segments = [];
  let startAt = 0;
  let heard = false;
  let fatal = null;
  let stopPlayback = () => {};
  const clock = () => Math.max(0, ctx.currentTime - startAt);
  const t = new LiveTranscriber({
    track,
    clock,
    onFinal: (seg) => { heard = true; segments.push(seg); o.onSegment?.(seg); },
    onInterim: (txt) => { if (txt) heard = true; o.onInterim?.(txt); },
    onError: (err) => {
      o.onError?.(err);
      // Hizmete hiç ulaşılamıyorsa kaydın sonuna kadar beklemeden dur
      if (err.fatal || (err.code === 'network' && !heard && t.networkErrors >= 2)) {
        fatal = err.code === 'network'
          ? new Error('Konuşma tanıma hizmetine ulaşılamadı ("network"). Sayfayı Google Chrome ile açın ya da "Cihaz içi Whisper" seçeneğini kullanın.')
          : new Error(err.message);
        stopPlayback();
      }
    },
  });
  t.start();
  await new Promise((r) => setTimeout(r, 400));
  startAt = ctx.currentTime + 0.05;
  src.start(startAt);
  const timer = setInterval(() => o.onProgress?.(Math.min(1, clock() / buffer.duration), clock()), 250);
  await new Promise((resolve) => {
    stopPlayback = () => { try { src.stop(); } catch { /* */ } resolve(); };
    src.onended = resolve;
    o.signal?.addEventListener('abort', stopPlayback);
  });
  if (!fatal) await new Promise((r) => setTimeout(r, 1800));
  clearInterval(timer);
  await t.stop(fatal ? 200 : 2000);
  track.stop();
  ctx.close().catch(() => {});
  if (fatal) throw fatal;
  o.onProgress?.(1, buffer.duration);
  if (!segments.length && buffer.duration > 5) {
    throw new Error('Kayıttan hiç metin çıkarılamadı. Konuşma tanıma hizmeti yanıt vermemiş olabilir; "Cihaz içi Whisper" ile deneyin.');
  }
  return segments;
}

/** Segmentlerden zaman damgalı transkript metni üretir. */
export function segmentsToTranscript(segments) {
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `[${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}]`;
  };
  return segments.map((s) => `${s.start != null ? fmt(s.start) + ' ' : ''}${s.speaker === 'examiner' ? 'T: ' : ''}${capitalize(s.text)}`).join('\n');
}

function capitalize(t) {
  const s = t.trim();
  return s ? s[0].toLocaleUpperCase('tr-TR') + s.slice(1) : s;
}
