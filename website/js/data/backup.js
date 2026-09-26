/**
 * Yedekleme / geri yükleme, yerel verileri buluta taşıma ve eski sürüm (v4) verilerinin aktarımı.
 * Yedek biçimi: ZIP — manifest.json, patients.json, sessions.json, lexicon.json,
 * acoustic/<seans>.json, audio/<ses-id>.<uzantı>. Parola özetleri asla yedeğe yazılmaz.
 *
 * İçe aktarma depo arayüzü (repo.*.importRaw) üzerinden yapılır; yerel ve bulut modunda aynı çalışır.
 * Yedek başka bir ekibe yükleniyorsa kayıtlar yeni kimlik alır ("importedFrom" ile izlenir),
 * böylece kaynak ekip etkilenmez ve aynı yedek ikinci kez yüklendiğinde kopya oluşmaz.
 */
import * as db from './db.js';
import { loadJSZip } from '../lib/cdn.js';
import { analyzeSession, summarize } from '../core/analysis.js';
import { encodeTyped, decodeTyped } from './typed.js';
import { uuid } from './crypto.js';
import { createLocalRepo } from './repo.local.js';

export { extFor } from './mime.js';
import { extFor } from './mime.js';

export async function exportBackup(repo, { includeAudio = true, onProgress = () => {} } = {}) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  onProgress(0.02, 'Veriler toplanıyor');
  const patients = await repo.patients.list({ includeArchived: true });
  const sessions = await repo.sessions.list({ full: true });
  const lexicon = await repo.lexicon.list();
  const audioMeta = [];
  for (const [i, s] of sessions.entries()) {
    const heavy = await repo.acoustic.get(s.id);
    if (heavy) zip.file(`acoustic/${s.id}.json`, encodeTyped(heavy));
    if (includeAudio) {
      for (const a of await repo.audio.forSession(s.id)) {
        const { blob, ...meta } = a;
        const name = `audio/${a.id}.${extFor(a.mimeType)}`;
        zip.file(name, blob);
        audioMeta.push({ ...meta, file: name });
      }
    }
    onProgress(0.05 + 0.45 * ((i + 1) / Math.max(1, sessions.length)), includeAudio ? 'Ses kayıtları ekleniyor' : 'Seanslar ekleniyor');
  }
  const manifest = {
    app: 'MorphologAI', format: 'morphologai-backup', version: 1, exportedAt: new Date().toISOString(),
    org: { id: repo.ctx.org.id, name: repo.ctx.org.name }, exportedBy: repo.ctx.user.email, source: repo.kind || 'local',
    counts: { patients: patients.length, sessions: sessions.length, audio: audioMeta.length, lexicon: lexicon.length },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('patients.json', JSON.stringify(patients, null, 2));
  zip.file('sessions.json', encodeTyped(sessions));
  zip.file('lexicon.json', JSON.stringify(lexicon, null, 2));
  zip.file('audio.json', JSON.stringify(audioMeta, null, 2));
  zip.file('OKUBENI.txt', 'MorphologAI yedek dosyasıdır. Uygulamada Ayarlar → Veri → Yedekten geri yükle ile içe aktarın.\n'
    + 'Bu dosya danışan sağlık verisi içerebilir; güvenli saklayın.\n');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => onProgress(0.5 + 0.5 * (meta.percent / 100), 'Sıkıştırılıyor'));
  return { blob, manifest };
}

/**
 * Kaynaktaki kayıtları hedef depoya yazar.
 * @param {object} repo  hedef depo
 * @param {{orgId, patients, sessions, lexicon, acousticFor:(id)=>Promise, audios:Array<{meta, getBlob:()=>Promise<Blob>}>}} src
 */
async function ingest(repo, src, onProgress = () => {}) {
  const sameOrg = !!src.orgId && src.orgId === repo.ctx.org.id;
  const lc = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const existingPatients = await repo.patients.list({ includeArchived: true });
  const existingSessions = await repo.sessions.list();
  const seen = new Set(existingSessions.flatMap((s) => [s.id, s.importedFrom].filter(Boolean)));
  const pidMap = new Map();
  const counts = { patients: 0, sessions: 0, audio: 0, lexicon: 0, skipped: 0 };

  onProgress(0.05, 'Danışanlar aktarılıyor');
  for (const p of src.patients) {
    const same = existingPatients.find((x) => x.id === p.id || (x.importedFrom && x.importedFrom === p.id) || lc(x.code) === lc(p.code));
    if (same) { pidMap.set(p.id, same.id); continue; }
    let rec = { ...p, id: sameOrg ? p.id : uuid(), importedFrom: sameOrg ? p.importedFrom : p.id };
    if (!(await repo.patients.importRaw(rec))) {
      rec = { ...rec, id: uuid() };
      await repo.patients.importRaw(rec);
    }
    pidMap.set(p.id, rec.id);
    existingPatients.push(rec);
    counts.patients++;
  }

  const audiosBySession = new Map();
  for (const a of src.audios) {
    if (!audiosBySession.has(a.meta.sessionId)) audiosBySession.set(a.meta.sessionId, []);
    audiosBySession.get(a.meta.sessionId).push(a);
  }

  for (const [i, s] of src.sessions.entries()) {
    onProgress(0.1 + 0.8 * (i / Math.max(1, src.sessions.length)), `Seanslar aktarılıyor (${i + 1}/${src.sessions.length})`);
    if (seen.has(s.id)) { counts.skipped++; continue; }
    const aidMap = new Map((audiosBySession.get(s.id) || []).map((a) => [a.meta.id, sameOrg ? a.meta.id : uuid()]));
    const rec = {
      ...s,
      id: sameOrg ? s.id : uuid(),
      patientId: pidMap.get(s.patientId) || s.patientId,
      audioId: s.audioId ? aidMap.get(s.audioId) || s.audioId : s.audioId,
      importedFrom: sameOrg ? s.importedFrom : s.id,
    };
    if (!existingPatients.some((p) => p.id === rec.patientId)) { counts.skipped++; continue; }
    if (!(await repo.sessions.importRaw(rec))) { counts.skipped++; continue; }
    seen.add(s.id);
    counts.sessions++;
    const heavy = await src.acousticFor(s.id);
    if (heavy) await repo.acoustic.put(rec.id, heavy);
    for (const a of audiosBySession.get(s.id) || []) {
      const blob = await a.getBlob();
      if (!blob) continue;
      const { file: _f, blob: _b, ...meta } = a.meta;
      if (await repo.audio.importRaw({ ...meta, id: aidMap.get(a.meta.id), sessionId: rec.id, mimeType: meta.mimeType || blob.type }, blob)) counts.audio++;
    }
  }

  onProgress(0.95, 'Sözlük aktarılıyor');
  for (const e of src.lexicon) {
    if (await repo.lexicon.importRaw(e)) counts.lexicon++;
  }
  onProgress(1, 'Tamamlandı');
  return counts;
}

// Yedekten gelen veriler güvenilmez kabul edilir: tür ve boyut denetiminden geçmeyen kayıtlar atlanır
const isId = (x) => typeof x === 'string' && x.length >= 1 && x.length <= 64 && /^[\w-]+$/.test(x);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const validPatient = (p) => isObj(p) && isId(p.id) && typeof p.code === 'string' && p.code.trim().length >= 1 && p.code.length <= 60;
const validSession = (s) => isObj(s) && isId(s.id) && isId(s.patientId) && (!s.transcript || isObj(s.transcript));
const validAudio = (a) => isObj(a) && isId(a.id) && isId(a.sessionId) && typeof a.file === 'string' && /^audio\/[\w-]{1,64}\.[a-z0-9]{2,5}$/i.test(a.file);
const validLex = (e) => isObj(e) && typeof e.word === 'string' && e.word.length >= 1 && e.word.length <= 80 && isObj(e.analysis);

export async function importBackup(repo, file, { onProgress = () => {} } = {}) {
  if (file.size > 4 * 1024 ** 3) throw new Error('Yedek dosyası çok büyük (4 GB üstü).');
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error('Dosya açılamadı; geçerli bir ZIP yedeği seçin.'); }
  const mf = zip.file('manifest.json');
  if (!mf || !zip.file('patients.json') || !zip.file('sessions.json')) throw new Error('Bu dosya bir MorphologAI yedeği değil.');
  const readJson = async (name, fallback, typed = false) => {
    const f = zip.file(name);
    if (!f) return fallback;
    try { const t = await f.async('string'); return typed ? decodeTyped(t) : JSON.parse(t); } catch { throw new Error(`Yedek bozuk: ${name} okunamadı.`); }
  };
  const manifest = await readJson('manifest.json', null);
  if (!isObj(manifest) || manifest.format !== 'morphologai-backup') throw new Error('Tanınmayan yedek biçimi.');
  const arr = (x) => (Array.isArray(x) ? x : []);
  const patients = arr(await readJson('patients.json', [])).filter(validPatient);
  const sessions = arr(await readJson('sessions.json', [], true)).filter(validSession);
  const lexicon = arr(await readJson('lexicon.json', [])).filter(validLex);
  const audioMeta = arr(await readJson('audio.json', [])).filter(validAudio);
  const counts = await ingest(repo, {
    orgId: manifest.org?.id,
    patients,
    sessions,
    lexicon,
    acousticFor: async (id) => {
      const f = zip.file(`acoustic/${id}.json`);
      return f ? decodeTyped(await f.async('string')) : null;
    },
    audios: audioMeta.map((meta) => ({
      meta,
      getBlob: async () => {
        const f = zip.file(meta.file);
        return f ? new Blob([await f.async('arraybuffer')], { type: meta.mimeType }) : null;
      },
    })),
  }, onProgress);
  return { ...counts, manifest };
}

// ---------------------------------------------------------------------------
// Bu tarayıcıdaki yerel verileri (IndexedDB) bulut ekibine taşıma
// ---------------------------------------------------------------------------
/** Yerel veritabanındaki ekipler ve kayıt sayıları. */
export async function listLocalOrgs() {
  try {
    const orgs = await db.getAll('orgs');
    const out = [];
    for (const o of orgs) {
      const [p, s, a] = await Promise.all([db.byIndex('patients', 'orgId', o.id), db.byIndex('sessions', 'orgId', o.id), db.byIndex('audio', 'orgId', o.id)]);
      out.push({ id: o.id, name: o.name, patients: p.length, sessions: s.length, audio: a.length, demoOnly: p.length > 0 && p.every((x) => x.demo) });
    }
    return out.filter((o) => o.patients || o.sessions);
  } catch {
    return [];
  }
}

export async function copyLocalToCloud(targetRepo, localOrgId, { onProgress = () => {} } = {}) {
  const org = await db.get('orgs', localOrgId);
  if (!org) throw new Error('Yerel ekip bulunamadı.');
  const src = createLocalRepo({ org, user: { id: 'local-migration' }, member: { role: 'owner', status: 'active' } });
  const patients = await src.patients.list({ includeArchived: true });
  const sessions = await src.sessions.list();
  const lexicon = await src.lexicon.list();
  const audios = [];
  for (const s of sessions) {
    for (const a of await db.byIndex('audio', 'sessionId', s.id)) {
      if (a.orgId !== localOrgId) continue;
      const { blob, ...meta } = a;
      audios.push({ meta, getBlob: async () => blob });
    }
  }
  return ingest(targetRepo, {
    orgId: localOrgId, patients, sessions, lexicon,
    acousticFor: (id) => src.acoustic.get(id),
    audios,
  }, onProgress);
}

// ---------------------------------------------------------------------------
// v4 (tek sayfa sürüm) seanslarını yeni şemaya taşıma
// ---------------------------------------------------------------------------
export async function legacyCount() {
  try {
    if (!(await db.hasStore('legacy_sessions'))) return 0;
    return await db.count('legacy_sessions');
  } catch {
    return 0;
  }
}

export async function migrateLegacy(repo, settings, onProgress = () => {}) {
  const rows = await db.getAll('legacy_sessions');
  const patients = await repo.patients.list({ includeArchived: true });
  let n = 0;
  for (const [i, r] of rows.entries()) {
    const name = (r.patientName || 'İsimsiz Danışan').trim();
    let p = patients.find((x) => (x.fullName || '').toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'));
    if (!p) {
      p = await repo.patients.save({ code: await repo.patients.nextCode('D'), fullName: name, group: 'patient', notes: 'Eski sürümden aktarıldı.' });
      patients.push(p);
    }
    const text = (r.transcript || '').trim();
    const result = analyzeSession({ transcript: text, settings, final: true });
    const s = await repo.sessions.save({
      patientId: p.id, taskType: 'free', taskDetail: '', source: 'live', status: 'draft',
      recordedAt: r.createdAt || new Date().toISOString(),
      transcript: { text, engine: 'webspeech-cloud', segments: [] },
      analysis: summarize(result),
      legacy: { metrics: r.metrics || null, durationSec: r.durationSec || null },
      notes: 'MorphologAI v4 sürümünden aktarıldı. Duraksama ölçümleri için "Sesi yeniden çözümle" kullanılabilir.',
    });
    if (r.audioBlob) {
      const a = await repo.audio.put(s.id, r.audioBlob, { durationSec: r.durationSec || null, fileName: `eski-kayit-${r.legacyOriginalId || i}.webm` });
      await repo.sessions.save({ ...s, audioId: a.id, audioMeta: { mimeType: a.mimeType, sizeBytes: a.sizeBytes, durationSec: r.durationSec || null } });
    }
    await db.del('legacy_sessions', r.legacyId);
    n++;
    onProgress((i + 1) / rows.length);
  }
  return n;
}
