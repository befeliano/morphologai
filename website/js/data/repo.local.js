/**
 * Ekip (kiracı) kapsamlı yerel veri deposu (IndexedDB).
 * Tüm işlemler oturumdaki ekip kimliğiyle sınırlıdır ve rol yetkisi denetlenir.
 * Bulut modunda aynı arayüzü repo.cloud.js sağlar.
 */
import * as db from './db.js';
import { uuid } from './crypto.js';
import { can } from './roles.js';
import { audit } from './auth.local.js';
import { safeAudioMime, safeAudioBlob, safeImageBlob } from './mime.js';

const now = () => new Date().toISOString();

export function createLocalRepo(ctx) {
  const orgId = ctx.org.id;
  const userId = ctx.user.id;
  const ensure = (action) => {
    if (!can(ctx.member, action)) throw new Error('Bu işlem için yetkiniz yok (rolünüz: yalnızca görüntüleme).');
  };
  const own = (x) => (x && x.orgId === orgId ? x : null);

  const patients = {
    async list({ includeArchived = false } = {}) {
      const all = await db.byIndex('patients', 'orgId', orgId);
      return all.filter((p) => includeArchived || !p.archived)
        .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true }));
    },
    async get(id) { return own(await db.get('patients', id)); },
    async nextCode(prefix = 'D') {
      const all = await db.byIndex('patients', 'orgId', orgId);
      let max = 0;
      for (const p of all) {
        const m = String(p.code || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, Number(m[1]));
      }
      return `${prefix}-${String(max + 1).padStart(3, '0')}`;
    },
    async save(p) {
      ensure('patient.write');
      const all = await db.byIndex('patients', 'orgId', orgId);
      const code = (p.code || '').trim();
      if (!code) throw new Error('Danışan kodu gerekli.');
      if (all.some((x) => x.id !== p.id && (x.code || '').toLocaleLowerCase('tr-TR') === code.toLocaleLowerCase('tr-TR'))) {
        throw new Error(`"${code}" kodu bu ekipte zaten kullanılıyor.`);
      }
      const prev = p.id ? await patients.get(p.id) : null;
      const rec = {
        ...(prev || {}), ...p, code, orgId,
        id: prev ? prev.id : uuid(),
        createdAt: prev ? prev.createdAt : now(),
        createdBy: prev ? prev.createdBy : userId,
        updatedAt: now(),
      };
      await db.put('patients', rec);
      await audit(orgId, userId, prev ? 'patient.update' : 'patient.create', { code });
      return rec;
    },
    /** Yedekten/taşımadan gelen kaydı olduğu gibi (kimliğiyle) yazar; kimlik doluysa false. */
    async importRaw(p) {
      ensure('patient.write');
      if (await db.get('patients', p.id)) return false;
      await db.put('patients', { ...p, orgId });
      return true;
    },
    async remove(id) {
      ensure('session.delete');
      const p = await patients.get(id);
      if (!p) return;
      const ss = await sessions.list({ patientId: id });
      for (const s of ss) await sessions.remove(s.id, { silent: true });
      await db.del('patients', id);
      await audit(orgId, userId, 'patient.delete', { code: p.code, sessions: ss.length });
    },
  };

  const sessions = {
    async list({ patientId = null } = {}) {
      const all = patientId ? await db.byIndex('sessions', 'patientId', patientId) : await db.byIndex('sessions', 'orgId', orgId);
      return all.filter((s) => s.orgId === orgId)
        .sort((a, b) => new Date(b.recordedAt || b.createdAt) - new Date(a.recordedAt || a.createdAt));
    },
    async get(id) { return own(await db.get('sessions', id)); },
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
      await db.put('sessions', rec);
      await audit(orgId, userId, prev ? 'session.update' : 'session.create', { id: rec.id, source: rec.source });
      return rec;
    },
    async importRaw(s) {
      ensure('session.write');
      if (await db.get('sessions', s.id)) return false;
      await db.put('sessions', { ...s, orgId });
      return true;
    },
    async remove(id, { silent = false } = {}) {
      ensure('session.delete');
      const s = await sessions.get(id);
      if (!s) return;
      const ops = [{ op: 'delete', store: 'sessions', key: id }, { op: 'delete', store: 'acoustic', key: id }];
      const audios = await db.byIndex('audio', 'sessionId', id);
      for (const a of audios) ops.push({ op: 'delete', store: 'audio', key: a.id });
      await db.batch(ops);
      if (!silent) await audit(orgId, userId, 'session.delete', { id });
    },
  };

  // Okunan ses kayıtlarının türü her zaman güvenli (audio/*) hâle getirilir
  const safeRec = (a) => (a ? { ...a, mimeType: safeAudioMime(a.mimeType), blob: a.blob ? safeAudioBlob(a.blob, a.mimeType) : a.blob } : a);
  const audio = {
    async put(sessionId, blob, meta = {}) {
      ensure('session.write');
      const mimeType = safeAudioMime(blob.type || meta.mimeType || 'audio/wav');
      const rec = { id: uuid(), orgId, sessionId, ...meta, blob: safeAudioBlob(blob, mimeType), mimeType, sizeBytes: blob.size, createdAt: now() };
      await db.put('audio', rec);
      return rec;
    },
    /** meta: yedekteki ses kaydı (id, sessionId, mimeType …) */
    async importRaw(meta, blob) {
      ensure('session.write');
      if (await db.get('audio', meta.id)) return false;
      const mimeType = safeAudioMime(meta.mimeType || blob.type);
      await db.put('audio', { ...meta, blob: safeAudioBlob(blob, mimeType), mimeType, orgId, sizeBytes: blob.size });
      return true;
    },
    async get(id) { return safeRec(own(await db.get('audio', id))); },
    async forSession(sessionId) {
      return (await db.byIndex('audio', 'sessionId', sessionId)).filter((a) => a.orgId === orgId).map(safeRec);
    },
  };

  const acoustic = {
    async put(sessionId, heavy) {
      ensure('session.write');
      await db.put('acoustic', { ...heavy, sessionId, orgId });
    },
    async get(sessionId) { return own(await db.get('acoustic', sessionId)); },
  };

  const lexicon = {
    async list() {
      return (await db.byIndex('lexicon', 'orgId', orgId)).sort((a, b) => a.word.localeCompare(b.word, 'tr'));
    },
    async map() {
      const out = new Map();
      for (const e of await lexicon.list()) out.set(e.word, e.analysis);
      return out;
    },
    async save(word, analysis) {
      ensure('lexicon.write');
      const existing = (await lexicon.list()).find((e) => e.word === word);
      const rec = { id: existing ? existing.id : uuid(), orgId, word, analysis, createdBy: existing ? existing.createdBy : userId, updatedAt: now(), createdAt: existing ? existing.createdAt : now() };
      await db.put('lexicon', rec);
      await audit(orgId, userId, 'lexicon.save', { word });
      return rec;
    },
    async importRaw(e) {
      ensure('lexicon.write');
      const cur = await lexicon.list();
      if (cur.some((x) => x.word === e.word)) return false;
      await db.put('lexicon', { ...e, id: e.id || uuid(), orgId });
      return true;
    },
    async remove(id) {
      ensure('lexicon.write');
      await db.del('lexicon', id);
    },
  };

  // ---- Materyal Atölyesi: sözcük bankası, görseller, kayıtlı materyaller ----
  const normWord = (w) => String(w || '').trim().toLocaleLowerCase('tr-TR');
  const words = {
    async list() {
      return (await db.byIndex('words', 'orgId', orgId)).sort((a, b) => a.word.localeCompare(b.word, 'tr'));
    },
    /** { word, category, ageBand, mediaId, hidden } — sözcük ekibin bankasında tekildir */
    async save(w) {
      ensure('lexicon.write');
      const word = normWord(w.word);
      if (!word || word.length > 60) throw new Error('Sözcük 1–60 karakter olmalı.');
      const existing = (await words.list()).find((x) => x.word === word);
      const { category = null, ageBand = null, mediaId = null, hidden = false } = w;
      const rec = { id: existing ? existing.id : uuid(), orgId, word, category, ageBand, mediaId, hidden: !!hidden, createdAt: existing ? existing.createdAt : now(), updatedAt: now() };
      await db.put('words', rec);
      return rec;
    },
    async remove(id) {
      ensure('lexicon.write');
      if (own(await db.get('words', id))) await db.del('words', id);
    },
  };

  const mediaMeta = ({ blob: _b, ...m }) => m;
  const media = {
    async list() {
      return (await db.byIndex('media', 'orgId', orgId)).map(mediaMeta).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async put(blob, meta = {}) {
      ensure('lexicon.write');
      const safe = safeImageBlob(blob, blob.type || meta.mimeType);
      if (safe.size > 5 * 1024 * 1024) throw new Error('Görsel 5 MB sınırını aşıyor.');
      const rec = { id: uuid(), orgId, label: String(meta.label || '').slice(0, 80), width: meta.width || null, height: meta.height || null, mimeType: safe.type, sizeBytes: safe.size, blob: safe, createdAt: now() };
      await db.put('media', rec);
      return mediaMeta(rec);
    },
    async get(id) {
      const r = own(await db.get('media', id));
      return r ? { ...r, blob: safeImageBlob(r.blob, r.mimeType) } : null;
    },
    async update(id, patch) {
      ensure('lexicon.write');
      const r = own(await db.get('media', id));
      if (!r) return null;
      const rec = { ...r, label: String(patch.label ?? r.label ?? '').slice(0, 80) };
      await db.put('media', rec);
      return mediaMeta(rec);
    },
    async remove(id) {
      ensure('lexicon.write');
      if (own(await db.get('media', id))) await db.del('media', id);
    },
  };

  const materials = {
    async list() {
      return (await db.byIndex('materials', 'orgId', orgId)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async get(id) { return own(await db.get('materials', id)); },
    async save(m) {
      ensure('session.write');
      const prev = m.id ? await materials.get(m.id) : null;
      const rec = {
        id: prev ? prev.id : uuid(), orgId, patientId: m.patientId || null, kind: String(m.kind || 'other').slice(0, 40), title: String(m.title || '').slice(0, 160),
        params: m.params || {}, content: m.content || {}, createdAt: prev ? prev.createdAt : now(), createdBy: prev ? prev.createdBy : userId, updatedAt: now(),
      };
      await db.put('materials', rec);
      return rec;
    },
    async remove(id) {
      ensure('session.write');
      if (await materials.get(id)) await db.del('materials', id);
    },
  };

  // Danışan bağlantısı yalnız bulut modunda çalışır (danışanın cihazı bu tarayıcının verisine erişemez)
  const noLinks = async () => { throw new Error('Danışan bağlantısı yalnızca bulut veritabanıyla kullanılabilir.'); };
  const links = { supported: false, create: noLinks, revoke: noLinks, async list() { return []; }, async logs() { return []; } };

  return {
    kind: 'local',
    ctx,
    links,
    patients,
    sessions,
    audio,
    acoustic,
    lexicon,
    words,
    media,
    materials,
    audit: {
      async list(limit = 100) {
        return (await db.byIndex('audit', 'orgId', orgId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
      },
    },
    /** Depolama kullanımı (tarayıcı kotası). */
    async usage() {
      const e = await db.storageEstimate();
      return { ...e, kind: 'local' };
    },
  };
}
