/**
 * Buluttan indirilen ses kayıtları için tarayıcı önbelleği (Cache Storage).
 * Aynı seans tekrar açıldığında ses yeniden indirilmez. Çıkış yapılınca silinir.
 */
const NAME = 'morphologai-audio-v1';
const key = (id) => `${location.origin}/__morphologai-audio/${id}`;
const available = () => typeof caches !== 'undefined' && window.isSecureContext;

export async function cacheGet(id) {
  if (!available()) return null;
  try {
    const r = await (await caches.open(NAME)).match(key(id));
    return r ? await r.blob() : null;
  } catch { return null; }
}

export async function cachePut(id, blob) {
  if (!available()) return;
  try {
    await (await caches.open(NAME)).put(key(id), new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream' } }));
  } catch { /* kota dolu olabilir; önbelleksiz devam */ }
}

export async function cacheDelete(id) {
  if (!available()) return;
  try { await (await caches.open(NAME)).delete(key(id)); } catch { /* yok say */ }
}

export async function clearAudioCache() {
  if (!available()) return;
  try { await caches.delete(NAME); } catch { /* yok say */ }
}
