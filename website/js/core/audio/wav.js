/**
 * WAV (PCM) kodlama ve başlık okuma.
 * Canlı kayıtlar kayıpsız 16-bit PCM WAV olarak saklanır (araştırma için arşiv niteliğinde).
 */

/** Int16Array parçalarından mono 16-bit WAV Blob üretir. */
export function encodeWavInt16(chunks, sampleRate) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);             // PCM
  v.setUint16(22, 1, true);             // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, length * 2, true);
  return new Blob([header, ...chunks], { type: 'audio/wav' });
}

/** Float32 örneklerden 16-bit WAV. */
export function encodeWavFloat(samples, sampleRate) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return encodeWavInt16([out], sampleRate);
}

/**
 * WAV başlığını okur (profesyonel kayıt cihazı bilgisini göstermek için).
 * @returns {{format, sampleRate, channels, bitsPerSample, durationSec}|null}
 */
export function parseWavHeader(buf) {
  if (!buf || buf.byteLength < 44) return null;
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') return null;
  let off = 12;
  let fmt = null;
  let dataSize = null;
  while (off + 8 <= buf.byteLength) {
    const id = str(off, 4);
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: v.getUint16(off + 8, true),
        channels: v.getUint16(off + 10, true),
        sampleRate: v.getUint32(off + 12, true),
        byteRate: v.getUint32(off + 16, true),
        bitsPerSample: v.getUint16(off + 22, true),
      };
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt) return null;
  const fmtName = fmt.audioFormat === 1 ? 'PCM' : fmt.audioFormat === 3 ? 'IEEE float' : fmt.audioFormat === 0xfffe ? 'PCM (genişletilmiş)' : `kod ${fmt.audioFormat}`;
  return {
    format: fmtName,
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    durationSec: dataSize && fmt.byteRate ? dataSize / fmt.byteRate : null,
  };
}
