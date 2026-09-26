/**
 * Ses dosyası çözme: tarayıcının desteklediği her biçim (WAV, MP3, M4A/AAC, FLAC,
 * OGG/Opus, WebM) → analiz için 16 kHz mono Float32.
 * Yeniden örnekleme ve kanal indirgeme OfflineAudioContext ile yapılır (yüksek kalite).
 */
import { parseWavHeader } from './wav.js';

export const ANALYSIS_RATE = 16000;
let decodeCtx = null;

function getDecodeContext() {
  if (!decodeCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    decodeCtx = new AC();
  }
  return decodeCtx;
}

/**
 * @param {Blob|ArrayBuffer} input
 * @returns {Promise<{samples: Float32Array, sampleRate: number, durationSec: number,
 *                    source: {sampleRate, channels, bitsPerSample?, format?, durationSec}}>}
 */
export async function decodeToMono16k(input) {
  const arrayBuffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const wavInfo = parseWavHeader(arrayBuffer);
  const ctx = getDecodeContext();
  // decodeAudioData ArrayBuffer'ı devralabilir; kopyası verilir
  // Safari çözemediği biçimde hatayı null olarak verebilir; anlaşılır iletiye çevrilir
  const fail = (err) => new Error(`Bu tarayıcı ses dosyasını çözemedi${err && err.message ? ` (${err.message})` : ''}. WAV, MP3 ya da M4A biçimini deneyin (Safari OGG/WebM dosyalarını her zaman açamaz).`);
  const decoded = await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(arrayBuffer.slice(0), resolve, (err) => reject(fail(err)));
    if (p && p.then) p.then(resolve, (err) => reject(fail(err)));
  });
  const frames = Math.max(1, Math.ceil(decoded.duration * ANALYSIS_RATE));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(1, frames, ANALYSIS_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  const samples = rendered.getChannelData(0).slice();
  return {
    samples,
    sampleRate: ANALYSIS_RATE,
    durationSec: decoded.duration,
    source: {
      sampleRate: wavInfo ? wavInfo.sampleRate : decoded.sampleRate,
      channels: wavInfo ? wavInfo.channels : decoded.numberOfChannels,
      bitsPerSample: wavInfo ? wavInfo.bitsPerSample : null,
      format: wavInfo ? `WAV ${wavInfo.format}` : null,
      durationSec: decoded.duration,
    },
    decoded,
  };
}

/** Süreyi saniye → "dd:ss" */
export function fmtTime(sec, withTenths = false) {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const ss = withTenths ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${ss}`;
}
