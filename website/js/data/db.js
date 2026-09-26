/**
 * Yerel veritabanı (IndexedDB) — çok kiracılı şema
 * ================================================
 *
 *  users            kullanıcı hesapları (PBKDF2 parola özeti)
 *  orgs             ekipler / kurumlar (kiracı)
 *  members          ekip üyelikleri ve roller  (orgId, userId, email, role, status)
 *  patients         danışanlar                  (orgId)
 *  sessions         seanslar (transkript, analiz özeti, akustik özet)   (orgId, patientId)
 *  acoustic         seansın ağır akustik dizileri (dalga biçimi, enerji, F0 izi)  (sessionId)
 *  audio            ses dosyaları (Blob)        (orgId, sessionId)
 *  lexicon          ekip sözlüğü düzeltmeleri   (orgId)
 *  audit            işlem günlüğü               (orgId)
 *  meta             uygulama meta verisi
 *  legacy_sessions  v4 sürümünden kalan seanslar (içe aktarılmayı bekler)
 *
 * Tüm okuma/yazmalar repo.js üzerinden, ekip kimliğiyle (orgId) sınırlandırılarak yapılır.
 * İleride bulut veritabanına (ör. Supabase + satır düzeyi güvenlik) geçişte yalnızca
 * repo.js'nin yerine aynı arayüzü sağlayan bir bağdaştırıcı yazılması yeterlidir.
 */

const DB_NAME = 'morphologai-db';
const DB_VERSION = 2;
let dbPromise = null;

const STORES = {
  meta: { keyPath: 'key' },
  users: { keyPath: 'id', indexes: [['email', 'email', { unique: true }]] },
  orgs: { keyPath: 'id' },
  members: { keyPath: 'id', indexes: [['orgId', 'orgId'], ['userId', 'userId'], ['email', 'email']] },
  patients: { keyPath: 'id', indexes: [['orgId', 'orgId']] },
  sessions: { keyPath: 'id', indexes: [['orgId', 'orgId'], ['patientId', 'patientId']] },
  acoustic: { keyPath: 'sessionId' },
  audio: { keyPath: 'id', indexes: [['orgId', 'orgId'], ['sessionId', 'sessionId']] },
  lexicon: { keyPath: 'id', indexes: [['orgId', 'orgId']] },
  audit: { keyPath: 'id', indexes: [['orgId', 'orgId']] },
};

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const tx = req.transaction;
      const oldVersion = e.oldVersion;
      const createAll = () => {
        for (const [name, def] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, { keyPath: def.keyPath });
          for (const [iname, key, opts] of def.indexes || []) store.createIndex(iname, key, opts || { unique: false });
        }
      };
      if (oldVersion >= 1 && db.objectStoreNames.contains('sessions')) {
        // v4 → v5 geçişi: eski seansları legacy_sessions'a kopyala, yeni şemayı kur
        const old = tx.objectStore('sessions');
        if (old.keyPath === 'id' && old.autoIncrement) {
          const getAll = old.getAll();
          getAll.onsuccess = () => {
            const records = getAll.result || [];
            db.deleteObjectStore('sessions');
            const legacy = db.objectStoreNames.contains('legacy_sessions')
              ? tx.objectStore('legacy_sessions')
              : db.createObjectStore('legacy_sessions', { keyPath: 'legacyId', autoIncrement: true });
            for (const r of records) legacy.add({ ...r, legacyOriginalId: r.id });
            createAll();
          };
          return;
        }
      }
      createAll();
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede açık; lütfen diğer MorphologAI sekmelerini kapatın.'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) {
  if (key == null) return null;
  return (await wrap((await store(name)).get(key))) || null;
}

export async function put(name, value) {
  await wrap((await store(name, 'readwrite')).put(value));
  return value;
}

export async function del(name, key) {
  await wrap((await store(name, 'readwrite')).delete(key));
}

export async function getAll(name) {
  return wrap((await store(name)).getAll());
}

export async function byIndex(name, index, value) {
  return wrap((await store(name)).index(index).getAll(value));
}

export async function count(name) {
  return wrap((await store(name)).count());
}

export async function hasStore(name) {
  const db = await openDB();
  return db.objectStoreNames.contains(name);
}

/** Birden çok yazmayı tek işlemde yapar. ops: [{op:'put'|'delete', store, value|key}] */
export async function batch(ops) {
  const db = await openDB();
  const names = [...new Set(ops.map((o) => o.store))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.op === 'delete') s.delete(o.key);
      else s.put(o.value);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('İşlem iptal edildi'));
  });
}

/** Tarayıcıdan kalıcı depolama izni ister (otomatik silinme riskini azaltır). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* yok say */ }
  return false;
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: e.usage || 0, quota: e.quota || 0, persisted };
  } catch {
    return { usage: 0, quota: 0, persisted: false };
  }
}

export async function destroyDatabase() {
  const db = await openDB();
  db.close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
    r.onblocked = resolve;
  });
}
