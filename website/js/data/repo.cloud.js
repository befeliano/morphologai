/**
 * Ekip (kiracı) kapsamlı bulut veri deposu — Supabase (Postgres + Storage).
 * Arayüz repo.local.js ile aynıdır. Veriler ekip kimliğiyle (org_id) ayrılır;
 * asıl erişim denetimi veritabanındaki RLS kurallarıdır (supabase/schema.sql).
 *
 * Notlar
 *  - Seansın sözcük tablosu ayrı sütunda tutulur; listeler onu indirmez (hız).
 *  - Ses kayıtları "recordings" kovasında: <org>/<seans>/<ses>.<uzantı>.
 *    45 MB'den büyük dosyalar 20 MB'lik parçalar hâlinde yüklenir.
 *  - Listeler kısa süre (20 sn) bellekte tutulur; kendi yazmalarınızda hemen yenilenir.
 */
import { backend, cloudError } from './backend.js';
import { uuid } from './crypto.js';
import { can } from './roles.js';
import { audit } from './auth.cloud.js';
import { toJsonSafe, fromJsonSafe } from './typed.js';
import { extFor, safeAudioMime } from './mime.js';
import { cacheGet, cachePut, cacheDelete } from './audioCache.js';

const BUCKET = 'recordings';
const MB = 1024 * 1024;
const LIST_TTL = 20000;
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad3 = (i) => String(i).padStart(3, '0');

function check(res, fallback) {
  if (res.error) throw cloudError(res.error, fallback);
  return res.data;
}

function storageError(err) {
  const msg = String(err?.message || err || '');
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(msg)) {
    return new Error('Ses dosyası bulut deposunun dosya boyutu sınırını aştı. Supabase → Storage → recordings kovasının boyut sınırını kontrol edin.');
  }
  if (/Bucket not found/i.test(msg)) return new Error('"recordings" deposu bulunamadı. supabase/schema.sql dosyasını SQL Editor\'da çalıştırın.');
  if (/row-level security|Unauthorized|not allowed|403/i.test(msg)) return new Error('Ses deposuna erişim yetkiniz yok.');
  return cloudError(err, 'Ses deposu işlemi başarısız oldu.');
}

export function createCloudRepo(ctx) {
  const sb = backend.supabase;
  const orgId = ctx.org.id;
  const userId = ctx.user.id;
  const tune = { singleMax: backend.tuning?.singleMax ?? 45 * MB, partSize: backend.tuning?.partSize ?? 20 * MB };
  const ensure = (action) => {
    if (!can(ctx.member, action)) throw new Error('Bu işlem için yetkiniz yok (rolünüz: yalnızca görüntüleme).');
  };

  // ---- kısa süreli liste önbelleği ----
  const cache = new Map();
  const cached = async (key, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < LIST_TTL) return hit.promise;
    const promise = fn();
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    return promise;
  };
  const invalidate = (...prefixes) => {
    for (const k of [...cache.keys()]) if (prefixes.some((p) => k.startsWith(p))) cache.delete(k);
  };

  async function fetchAll(build, pageSize = 1000) {
    const out = [];
    for (let from = 0; ; from += pageSize) {
      const rows = check(await build().range(from, from + pageSize - 1)) || [];
      out.push(...rows);
      if (rows.length < pageSize) return out;
    }
  }

  // -------------------------------------------------------------------------
  // Danışanlar
  // -------------------------------------------------------------------------
  const pFromRow = (r) => ({ ...fromJsonSafe(r.data || {}), id: r.id, orgId: r.org_id, code: r.code, archived: !!r.archived, demo: !!r.demo });
  const pRow = (rec) => ({ id: rec.id, org_id: orgId, code: rec.code, archived: !!rec.archived, demo: !!rec.demo, data: toJsonSafe({ ...rec, orgId }) });
  const P_COLS = 'id,org_id,code,archived,demo,data';

  const patients = {
    async list({ includeArchived = false } = {}) {
      const all = await cached('patients', async () => (await fetchAll(() => sb.from('patients').select(P_COLS).eq('org_id', orgId).order('id'))).map(pFromRow));
      return all.filter((p) => includeArchived || !p.archived)
        .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true }));
    },
    async get(id) {
      if (!id) return null;
      const r = check(await sb.from('patients').select(P_COLS).eq('id', id).eq('org_id', orgId).maybeSingle());
      return r ? pFromRow(r) : null;
    },
    async nextCode(prefix = 'D') {
      let max = 0;
      for (const p of await patients.list({ includeArchived: true })) {
        const m = String(p.code || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, Number(m[1]));
      }
      return `${prefix}-${String(max + 1).padStart(3, '0')}`;
    },
    async save(p) {
      ensure('patient.write');
      const code = (p.code || '').trim();
      if (!code) throw new Error('Danışan kodu gerekli.');
      invalidate('patients');
      const all = await patients.list({ includeArchived: true });
      const dupMsg = `"${code}" kodu bu ekipte zaten kullanılıyor.`;
      if (all.some((x) => x.id !== p.id && (x.code || '').toLocaleLowerCase('tr-TR') === code.toLocaleLowerCase('tr-TR'))) throw new Error(dupMsg);
      const prev = p.id ? await patients.get(p.id) : null;
      const rec = {
        ...(prev || {}), ...p, code, orgId,
        id: prev ? prev.id : uuid(),
        createdAt: prev ? prev.createdAt : now(),
        createdBy: prev ? prev.createdBy : userId,
        updatedAt: now(),
      };
      const row = pRow(rec);
      const res = prev
        ? await sb.from('patients').update({ code: row.code, archived: row.archived, demo: row.demo, data: row.data }).eq('id', rec.id).eq('org_id', orgId).select('id')
        : await sb.from('patients').insert(row).select('id');
      const data = check(res, dupMsg);
      if (!data?.length) throw new Error('Danışan kaydedilemedi (yetkiniz olmayabilir).');
      invalidate('patients');
      await audit(orgId, userId, prev ? 'patient.update' : 'patient.create', { code });
      return rec;
    },
    async importRaw(p) {
      ensure('patient.write');
      const res = await sb.from('patients').insert(pRow({ ...p, orgId })).select('id');
      if (res.error?.code === '23505') return false;
      check(res, 'Danışan aktarılamadı.');
      invalidate('patients');
      return true;
    },
    async remove(id) {
      ensure('session.delete');
      const p = await patients.get(id);
      if (!p) return;
      const ss = await sessions.list({ patientId: id });
      for (const s of ss) await sessions.remove(s.id, { silent: true });
      const data = check(await sb.from('patients').delete().eq('id', id).eq('org_id', orgId).select('id'));
      if (!data?.length) throw new Error('Danışan silinemedi (yetkiniz olmayabilir).');
      invalidate('patients', 'sessions');
      await audit(orgId, userId, 'patient.delete', { code: p.code, sessions: ss.length });
    },
  };

  // -------------------------------------------------------------------------
  // Seanslar
  // -------------------------------------------------------------------------
  const S_COLS = 'id,org_id,patient_id,data';
  const sFromRow = (r) => {
    const s = { ...fromJsonSafe(r.data || {}), id: r.id, orgId: r.org_id, patientId: r.patient_id };
    if ('word_table' in r && s.analysis) s.analysis = { ...s.analysis, wordTable: r.word_table || [] };
    return s;
  };
  const sRow = (rec) => {
    const wordTable = rec.analysis?.wordTable ?? null;
    const data = toJsonSafe({ ...rec, orgId, analysis: rec.analysis ? { ...rec.analysis, wordTable: undefined } : (rec.analysis ?? null) });
    return {
      id: rec.id, org_id: orgId, patient_id: rec.patientId, module: rec.module || 'aphasia', task_type: rec.taskType || null,
      status: rec.status || 'draft', source: rec.source || null, recorded_at: rec.recordedAt || now(), audio_id: rec.audioId || null,
      demo: !!rec.demo, data, word_table: wordTable,
    };
  };
  const byRecorded = (a, b) => new Date(b.recordedAt || b.createdAt) - new Date(a.recordedAt || a.createdAt);

  const sessions = {
    /** full: sözcük tablolarını da getirir (sözcük düzeyi dışa aktarım için). */
    async list({ patientId = null, full = false } = {}) {
      const key = `sessions:${patientId || '*'}:${full ? 'full' : 'lite'}`;
      const cols = full ? `${S_COLS},word_table` : S_COLS;
      const all = await cached(key, async () => (await fetchAll(() => {
        let q = sb.from('sessions').select(cols).eq('org_id', orgId);
        if (patientId) q = q.eq('patient_id', patientId);
        return q.order('id');
      })).map(sFromRow));
      return [...all].sort(byRecorded);
    },
    async get(id) {
      if (!id) return null;
      const r = check(await sb.from('sessions').select(`${S_COLS},word_table`).eq('id', id).eq('org_id', orgId).maybeSingle());
      return r ? sFromRow(r) : null;
    },
    async save(s) {
      ensure('session.write');
      const prev = s.id ? await sessions.get(s.id) : null;
      const rec = {
        ...(prev || {}), ...s, orgId,
        id: prev ? prev.id : s.id || uuid(),
        createdAt: prev ? prev.createdAt : now(),
        createdBy: prev ? prev.createdBy : userId,
        recordedAt: s.recordedAt || (prev && prev.recordedAt) || now(),
        updatedAt: now(),
        updatedBy: userId,
      };
      // Listeden gelen (sözcük tablosuz) bir kayıt kaydedilirse mevcut tablo korunur
      if (rec.analysis && rec.analysis.wordTable === undefined && prev?.analysis?.wordTable) {
        rec.analysis = { ...rec.analysis, wordTable: prev.analysis.wordTable };
      }
      const row = sRow(rec);
      let data;
      if (prev) {
        const { id: _i, org_id: _o, ...patch } = row;
        data = check(await sb.from('sessions').update(patch).eq('id', rec.id).eq('org_id', orgId).select('id'), 'Seans kaydedilemedi.');
      } else {
        data = check(await sb.from('sessions').insert(row).select('id'), 'Seans kaydedilemedi.');
      }
      if (!data?.length) throw new Error('Seans kaydedilemedi (yetkiniz olmayabilir).');
      invalidate('sessions');
      await audit(orgId, userId, prev ? 'session.update' : 'session.create', { id: rec.id, source: rec.source });
      return rec;
    },
    async importRaw(s) {
      ensure('session.write');
      const res = await sb.from('sessions').insert(sRow({ ...s, orgId })).select('id');
      if (res.error?.code === '23505') return false;
      check(res, 'Seans aktarılamadı.');
      invalidate('sessions');
      return true;
    },
    async remove(id, { silent = false } = {}) {
      ensure('session.delete');
      const files = check(await sb.from('audio_files').select('id,bucket,path,parts').eq('session_id', id).eq('org_id', orgId)) || [];
      await removeObjects(files);
      const data = check(await sb.from('sessions').delete().eq('id', id).eq('org_id', orgId).select('id'));
      for (const f of files) cacheDelete(f.id);
      invalidate('sessions');
      if (data?.length && !silent) await audit(orgId, userId, 'session.delete', { id });
    },
  };

  // -------------------------------------------------------------------------
  // Ses kayıtları (Storage)
  // -------------------------------------------------------------------------
  const objectPaths = (f) => (f.parts > 1 ? Array.from({ length: f.parts }, (_, i) => `${f.path}.part${pad3(i)}`) : [f.path]);
  const aFromRow = (r) => ({
    ...(r.meta || {}), id: r.id, orgId: r.org_id, sessionId: r.session_id, mimeType: safeAudioMime(r.mime_type),
    sizeBytes: Number(r.size_bytes), parts: r.parts, path: r.path, createdAt: r.created_at,
  });

  async function removeObjects(files) {
    const paths = files.flatMap(objectPaths);
    for (let i = 0; i < paths.length; i += 900) {
      const res = await sb.storage.from(BUCKET).remove(paths.slice(i, i + 900));
      if (res.error) throw storageError(res.error);
    }
  }

  async function uploadPart(path, body, contentType) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await sb.storage.from(BUCKET).upload(path, body, { contentType, upsert: true, cacheControl: '31536000' });
      if (!res.error) return;
      last = res.error;
      if (/row-level security|Unauthorized|maximum allowed size|Bucket not found|403|413/i.test(String(last.message || ''))) break;
      await sleep(700 * (attempt + 1));
    }
    throw storageError(last);
  }

  async function uploadAudio({ id, sessionId, blob, meta = {}, onProgress = () => {} }) {
    const mime = safeAudioMime(blob.type || meta.mimeType || 'audio/wav');
    const base = `${orgId}/${sessionId}/${id}.${extFor(mime)}`;
    const parts = blob.size > tune.singleMax ? Math.ceil(blob.size / tune.partSize) : 1;
    const uploaded = [];
    try {
      for (let i = 0; i < parts; i++) {
        const path = parts === 1 ? base : `${base}.part${pad3(i)}`;
        const body = parts === 1 ? blob : blob.slice(i * tune.partSize, Math.min(blob.size, (i + 1) * tune.partSize));
        await uploadPart(path, body, parts === 1 ? mime : 'application/octet-stream');
        uploaded.push(path);
        onProgress((i + 1) / parts);
      }
      const { fileName = null, durationSec = null, sampleRate = null, channels = null, bitsPerSample = null, format = null } = meta;
      const row = check(await sb.from('audio_files').insert({
        id, org_id: orgId, session_id: sessionId, bucket: BUCKET, path: base, parts, mime_type: mime, size_bytes: blob.size,
        meta: { fileName, durationSec, sampleRate, channels, bitsPerSample, format },
      }).select('*').single(), 'Ses kaydı bilgisi yazılamadı.');
      await cachePut(id, blob);
      return { ...aFromRow(row), blob };
    } catch (err) {
      if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded).catch(() => {});
      throw err;
    }
  }

  async function loadBlob(row) {
    const type = safeAudioMime(row.mime_type);
    const hit = await cacheGet(row.id);
    if (hit && hit.size === Number(row.size_bytes)) return new Blob([hit], { type });
    const chunks = [];
    for (const path of objectPaths(row)) {
      const res = await sb.storage.from(row.bucket || BUCKET).download(path);
      if (res.error) throw storageError(res.error);
      chunks.push(res.data);
    }
    const blob = new Blob(chunks, { type });
    await cachePut(row.id, blob);
    return blob;
  }

  const audio = {
    /** opts.onProgress(0..1): yükleme ilerlemesi */
    async put(sessionId, blob, meta = {}, opts = {}) {
      ensure('session.write');
      return uploadAudio({ id: uuid(), sessionId, blob, meta, onProgress: opts.onProgress });
    },
    async importRaw(meta, blob) {
      ensure('session.write');
      const exists = check(await sb.from('audio_files').select('id').eq('id', meta.id).maybeSingle());
      if (exists) return false;
      await uploadAudio({ id: meta.id, sessionId: meta.sessionId, blob, meta });
      return true;
    },
    async get(id) {
      if (!id) return null;
      const row = check(await sb.from('audio_files').select('*').eq('id', id).eq('org_id', orgId).maybeSingle());
      if (!row) return null;
      try {
        return { ...aFromRow(row), blob: await loadBlob(row) };
      } catch (err) {
        console.error(err);
        import('../app/ui/dom.js').then((m) => m.toast(`Ses kaydı indirilemedi: ${err.message}`, 'error', 8000)).catch(() => {});
        return null;
      }
    },
    async forSession(sessionId) {
      const rows = check(await sb.from('audio_files').select('*').eq('session_id', sessionId).eq('org_id', orgId)) || [];
      const out = [];
      for (const r of rows) out.push({ ...aFromRow(r), blob: await loadBlob(r) });
      return out;
    },
  };

  // -------------------------------------------------------------------------
  // Akustik diziler
  // -------------------------------------------------------------------------
  const acoustic = {
    async put(sessionId, heavy) {
      ensure('session.write');
      const { sessionId: _s, orgId: _o, ...rest } = heavy || {};
      check(await sb.from('acoustic').upsert({ session_id: sessionId, org_id: orgId, data: toJsonSafe(rest) }, { onConflict: 'session_id' }), 'Akustik veriler kaydedilemedi.');
    },
    async get(sessionId) {
      if (!sessionId) return null;
      const r = check(await sb.from('acoustic').select('data').eq('session_id', sessionId).eq('org_id', orgId).maybeSingle());
      return r ? { ...fromJsonSafe(r.data), sessionId, orgId } : null;
    },
  };

  // -------------------------------------------------------------------------
  // Ekip sözlüğü
  // -------------------------------------------------------------------------
  const lFromRow = (r) => ({ id: r.id, orgId: r.org_id, word: r.word, analysis: r.analysis, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at });
  const lexicon = {
    async list() {
      const all = await cached('lexicon', async () => (await fetchAll(() => sb.from('lexicon').select('*').eq('org_id', orgId).order('id'))).map(lFromRow));
      return [...all].sort((a, b) => a.word.localeCompare(b.word, 'tr'));
    },
    async map() {
      const out = new Map();
      for (const e of await lexicon.list()) out.set(e.word, e.analysis);
      return out;
    },
    async save(word, analysis) {
      ensure('lexicon.write');
      const r = check(await sb.from('lexicon').upsert({ org_id: orgId, word, analysis }, { onConflict: 'org_id,word' }).select('*').single(), 'Sözlüğe kaydedilemedi.');
      invalidate('lexicon');
      await audit(orgId, userId, 'lexicon.save', { word });
      return lFromRow(r);
    },
    async importRaw(e) {
      ensure('lexicon.write');
      const res = await sb.from('lexicon').insert({ org_id: orgId, word: e.word, analysis: e.analysis }).select('id');
      if (res.error?.code === '23505') return false;
      check(res, 'Sözlük girdisi aktarılamadı.');
      invalidate('lexicon');
      return true;
    },
    async remove(id) {
      ensure('lexicon.write');
      check(await sb.from('lexicon').delete().eq('id', id).eq('org_id', orgId));
      invalidate('lexicon');
    },
  };

  return {
    kind: 'cloud',
    ctx,
    patients,
    sessions,
    audio,
    acoustic,
    lexicon,
    audit: {
      async list(limit = 100) {
        const rows = check(await sb.from('audit').select('*').eq('org_id', orgId).order('at', { ascending: false }).limit(limit)) || [];
        return rows.map((r) => ({ id: r.id, orgId: r.org_id, userId: r.user_id, action: r.action, detail: r.detail || {}, at: r.at }));
      },
    },
    /** Ekibin buluttaki ses verisi (bayt). */
    async usage() {
      const bytes = check(await sb.rpc('org_storage_bytes', { p_org: orgId })) || 0;
      return { usage: Number(bytes), quota: null, persisted: true, kind: 'cloud' };
    },
    invalidate: () => invalidate(''),
  };
}
