/** Ses dosyası MIME türleri: uzantı eşleme ve güvenli tür denetimi. */
const EXT = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/aac': 'aac',
};

export const extFor = (mime) => EXT[(mime || '').split(';')[0].trim().toLowerCase()] || 'bin';

/**
 * Blob türü yalnızca audio/* olabilir. Başka bir tür (ör. text/html) içeren kayıt, blob: adresi
 * yeni sekmede açıldığında uygulama kökeninde çalışabilirdi (depolanmış XSS) — bu yüzden
 * güvenli olmayan türler "application/octet-stream"e indirgenir.
 */
export function safeAudioMime(mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase();
  // audio/* ve (ses içeren) video/* kapları oynatıcıda açılır, HTML olarak yorumlanmaz
  return /^(audio|video)\/[a-z0-9.+-]{1,40}$/.test(m) ? m : 'application/octet-stream';
}

/** Blob'u güvenli türle yeniden sarar (içerik kopyalanmaz). */
export function safeAudioBlob(blob, mime) {
  const t = safeAudioMime(mime ?? blob?.type);
  return blob && blob.type === t ? blob : new Blob([blob], { type: t });
}
