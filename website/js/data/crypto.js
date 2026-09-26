/** Kimlik üretimi ve parola özeti (Web Crypto, PBKDF2-SHA256). */

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const toHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));

export const PBKDF2_ITERATIONS = 210000;

export async function hashPassword(password, saltHex = null, iterations = PBKDF2_ITERATIONS) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return { hash: toHex(bits), salt: toHex(salt), iterations };
}

export async function verifyPassword(password, record) {
  if (!record || !record.passwordHash) return false;
  const { hash } = await hashPassword(password, record.salt, record.iterations || PBKDF2_ITERATIONS);
  // sabit süreli karşılaştırma
  let diff = hash.length ^ record.passwordHash.length;
  for (let i = 0; i < Math.min(hash.length, record.passwordHash.length); i++) diff |= hash.charCodeAt(i) ^ record.passwordHash.charCodeAt(i);
  return diff === 0;
}

/** Okunabilir geçici parola (ekibe üye eklerken). */
export function tempPassword() {
  const words = ['Mavi', 'Kalem', 'Deniz', 'Bulut', 'Nehir', 'Toprak', 'Limon', 'Yaprak', 'Kiraz', 'Sahil'];
  const w = words[crypto.getRandomValues(new Uint8Array(1))[0] % words.length];
  const n = 1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000);
  return `${w}${n}!`;
}
