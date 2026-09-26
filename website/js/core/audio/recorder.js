/**
 * Canlı kayıt: seçilen mikrofondan kayıpsız 16-bit PCM WAV kaydı.
 *  - Tarayıcı ses işleme (yankı giderme, gürültü bastırma, otomatik kazanç) KAPALI:
 *    akustik ölçümler (duraksama, F0) ham sinyalden yapılmalıdır.
 *  - AudioWorklet (yoksa ScriptProcessor) ile örnekler toplanır.
 *  - Her ~50 ms'de ses düzeyi (dBFS) bildirilir; canlı sessizlik algılayıcı bunu kullanır.
 */
import { encodeWavInt16 } from './wav.js';

export async function listInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label || (d.deviceId === 'default' ? 'Varsayılan mikrofon' : `Mikrofon ${i + 1}`),
  }));
}

export class Recorder {
  /**
   * @param {{deviceId?: string, onLevel?: (db:number, t:number)=>void}} opts
   */
  constructor(opts = {}) {
    this.deviceId = opts.deviceId || null;
    this.onLevel = opts.onLevel || (() => {});
    this.chunks = [];
    this.samples = 0;
    this.paused = false;
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.track = null;
    this.sampleRate = 48000;
    this._blockSum = 0;
    this._blockN = 0;
    this.peak = 0;
  }

  get elapsed() {
    return this.samples / this.sampleRate;
  }

  async start() {
    const constraints = {
      audio: {
        deviceId: this.deviceId && this.deviceId !== 'default' ? { exact: this.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Kayıtlı mikrofon bu cihazda yoksa varsayılana dön
      if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') && constraints.audio.deviceId) {
        delete constraints.audio.deviceId;
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else throw err;
    }
    this.track = this.stream.getAudioTracks()[0];
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.sampleRate = this.ctx.sampleRate;
    this._blockSize = Math.round(this.sampleRate * 0.05);
    const source = this.ctx.createMediaStreamSource(this.stream);
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    sink.connect(this.ctx.destination);
    if (this.ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      await this.ctx.audioWorklet.addModule(new URL('../../workers/recorder.worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'recorder-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.node.port.onmessage = (e) => {
        if (e.data.type === 'chunk') this._handle(e.data.samples);
        else if (e.data.type === 'flushed' && this._flushResolve) this._flushResolve();
      };
    } else {
      // Eski tarayıcılar için yedek yol
      this.node = this.ctx.createScriptProcessor(4096, 1, 1);
      this.node.onaudioprocess = (e) => { if (!this.paused) this._handle(e.inputBuffer.getChannelData(0).slice()); };
    }
    source.connect(this.node);
    this.node.connect(sink);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this._td = new Float32Array(this.analyser.fftSize);
    this.source = source;
    this.sink = sink;
    this.startedAt = performance.now();
    return this.track;
  }

  _handle(f32) {
    const int16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = f32[i];
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      int16[i] = c < 0 ? c * 0x8000 : c * 0x7fff;
      const a = c < 0 ? -c : c;
      if (a > this.peak) this.peak = a;
      this._blockSum += c * c;
      this._blockN++;
      if (this._blockN >= this._blockSize) {
        const db = 20 * Math.log10(Math.sqrt(this._blockSum / this._blockN) + 1e-9);
        this.onLevel(db, (this.samples + i) / this.sampleRate, this.peak);
        this._blockSum = 0;
        this._blockN = 0;
        this.peak = 0;
      }
    }
    this.chunks.push(int16);
    this.samples += int16.length;
  }

  /** Anlık temel frekans (Hz) — normalize otokorelasyon, yalnız gösterim amaçlı. */
  livePitch(f0Min = 70, f0Max = 500) {
    if (!this.analyser) return 0;
    const x = this._td;
    this.analyser.getFloatTimeDomainData(x);
    const sr = this.sampleRate;
    let rms = 0;
    for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
    if (Math.sqrt(rms / x.length) < 0.01) return 0;
    const minLag = Math.floor(sr / f0Max);
    const maxLag = Math.min(Math.floor(sr / f0Min), x.length / 2);
    let best = 0;
    let bestLag = 0;
    const W = x.length - maxLag;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0; let e1 = 0; let e2 = 0;
      for (let i = 0; i < W; i += 2) { s += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; }
      const r = s / Math.sqrt(e1 * e2 + 1e-12);
      if (r > best) { best = r; bestLag = lag; }
    }
    return best > 0.75 && bestLag ? sr / bestLag : 0;
  }

  pause() {
    this.paused = true;
    this.node?.port?.postMessage({ cmd: 'pause' });
  }

  resume() {
    this.paused = false;
    this.node?.port?.postMessage({ cmd: 'resume' });
  }

  async _flush() {
    if (!this.node?.port) return;
    await new Promise((resolve) => {
      this._flushResolve = resolve;
      this.node.port.postMessage({ cmd: 'flush' });
      setTimeout(resolve, 400);
    });
  }

  /** Kaydı bitirir ve WAV döndürür. */
  async stop() {
    await this._flush();
    this._teardown();
    const blob = encodeWavInt16(this.chunks, this.sampleRate);
    return { blob, sampleRate: this.sampleRate, durationSec: this.elapsed, channels: 1, bitsPerSample: 16 };
  }

  cancel() {
    this._teardown();
    this.chunks = [];
  }

  _teardown() {
    try { this.source?.disconnect(); } catch { /* yok say */ }
    try { this.node?.disconnect(); } catch { /* yok say */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    this.stream = null;
  }
}

/**
 * Canlı sessizlik algılayıcı (ekrandaki göstergeler için; kesin ölçüm kayıt
 * bittikten sonra akustik çözümlemeyle yapılır).
 */
export class LiveVad {
  constructor({ longPauseSec = 2 } = {}) {
    this.history = [];
    this.silence = 0;
    this.speaking = 0;
    this.longPauses = 0;
    this.pauses = 0;
    this.longPauseSec = longPauseSec;
    this.started = false;
    this.lastDb = -100;
    this.threshold = -45;
  }

  push(db, dt = 0.05) {
    this.lastDb = db;
    this.history.push(db);
    if (this.history.length > 300) this.history.shift();
    if (this.history.length >= 20 && this.history.length % 10 === 0) {
      const s = [...this.history].sort((a, b) => a - b);
      const floor = s[Math.floor(s.length * 0.1)];
      const top = s[Math.floor(s.length * 0.95)];
      this.threshold = floor + Math.max(9, 0.28 * (top - floor));
    }
    const isSpeech = db > this.threshold;
    if (isSpeech) {
      if (this.started && this.silence >= 0.25) this.pauses++;
      if (this.started && this.silence >= this.longPauseSec) this.longPauses++;
      this.started = true;
      this.silence = 0;
      this.speaking += dt;
    } else {
      this.silence += dt;
    }
    return { isSpeech, silence: this.started ? this.silence : 0 };
  }
}
