/**
 * Tipli dizileri (Int16Array, Float32Array, Uint8Array) JSON'a güvenle yazma/okuma.
 * Yedek dosyaları ve bulut veritabanındaki jsonb alanları aynı biçimi kullanır:
 *   { "__typed": "Float32Array", "b64": "…" }
 */
const TYPED = { Int16Array, Float32Array, Uint8Array };

function b64FromBytes(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

function bytesFromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encodeValue(v) {
  for (const [name, T] of Object.entries(TYPED)) {
    if (v instanceof T) return { __typed: name, b64: b64FromBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  }
  return undefined;
}

function decodeValue(v) {
  if (v && typeof v === 'object' && typeof v.__typed === 'string' && TYPED[v.__typed] && typeof v.b64 === 'string') {
    return new TYPED[v.__typed](bytesFromB64(v.b64).buffer);
  }
  return undefined;
}

/** Nesneyi JSON metnine yazar (tipli diziler base64 olarak). */
export function encodeTyped(obj) {
  return JSON.stringify(obj, (k, v) => encodeValue(v) ?? v);
}

/** encodeTyped çıktısını geri okur. */
export function decodeTyped(text) {
  return JSON.parse(text, (k, v) => decodeValue(v) ?? v);
}

/** Nesneyi jsonb'ye yazılabilir düz nesneye çevirir (tipli diziler base64). */
export function toJsonSafe(obj) {
  return obj == null ? obj : JSON.parse(encodeTyped(obj));
}

/** toJsonSafe'in tersi: {__typed,b64} düğümlerini tipli dizilere çevirir. */
export function fromJsonSafe(obj) {
  const typed = decodeValue(obj);
  if (typed) return typed;
  if (Array.isArray(obj)) return obj.map(fromJsonSafe);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = fromJsonSafe(v);
    return out;
  }
  return obj;
}
