/**
 * Bulut katmanı uçtan uca testleri (PGlite + sahte Supabase istemcisi).
 * supabase/schema.sql gerçek Postgres'te kurulur; uygulamanın auth.cloud.js / repo.cloud.js /
 * backup.js kodu bu istemciyle çalıştırılır. RLS ve izinler "authenticated" rolüyle sınanır.
 */
import { createMockSupabase, SUPABASE_PRELUDE } from './sbmock.js';
import { initBackend, backend } from '../js/data/backend.js';
import * as auth from '../js/data/auth.js';
import { createRepo } from '../js/data/repo.js';
import { exportBackup, importBackup } from '../js/data/backup.js';

const out = document.getElementById('rows');
const sum = document.getElementById('sum');
const results = [];
function row(ok, name, detail = '') {
  results.push({ ok, name, detail });
  const tr = document.createElement('tr');
  if (!ok) tr.className = 'fail';
  for (const v of [ok ? '✓' : '✗', name, detail]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
  out.appendChild(tr);
}
const check = (name, cond, detail = '') => row(!!cond, name, detail);
async function expectError(name, fn, re) {
  try { await fn(); row(false, name, 'hata bekleniyordu, oluşmadı'); } catch (e) { row(re ? re.test(e.message) : true, name, e.message); }
}

async function main() {
  sum.textContent = 'PGlite yükleniyor…';
  const { PGlite } = await import('https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js');
  const pg = new PGlite();
  await pg.exec(SUPABASE_PRELUDE);
  const schema = await (await fetch('/__supabase/schema.sql', { cache: 'no-store' })).text();
  const t0 = performance.now();
  await pg.exec(schema);
  check('schema.sql Postgres\'te hatasız kuruldu', true, `${Math.round(performance.now() - t0)} ms`);
  await pg.exec(schema);
  check('schema.sql ikinci kez çalıştırılabilir (idempotent)', true);

  const sb = createMockSupabase(pg);
  await initBackend({ client: sb, tuning: { singleMax: 2000, partSize: 800 } });
  check('Altyapı bulut modunda', backend.mode === 'cloud');
  sum.textContent = 'Senaryolar çalışıyor…';

  // 1) A kaydolur, ekibini kurar
  const rA = await auth.register({ email: 'Ayse@Test.com', password: 'parola123', name: 'Ayşe Yılmaz', title: 'Dkt.', orgName: 'Tez Ekibi' });
  let ctxA = await auth.loadContext();
  check('Kayıt: oturum açıldı, ekip kuruldu', ctxA && ctxA.org?.name === 'Tez Ekibi' && ctxA.member?.role === 'owner', `${ctxA?.user.email} · ${ctxA?.org?.name}`);
  check('E-posta küçük harfe çevrildi (İ/ı sorunu yok)', ctxA.user.email === 'ayse@test.com');
  check('Profil adı/unvanı', ctxA.user.name === 'Ayşe Yılmaz' && ctxA.user.title === 'Dkt.');
  const orgA = ctxA.org.id;
  let repoA = createRepo(ctxA);

  // 2) Danışan
  const p1 = await repoA.patients.save({ code: 'T-001', fullName: 'Deneme Hasta', birthYear: 1960, sex: 'K', education: 11 });
  check('Danışan kaydı', (await repoA.patients.list()).length === 1 && (await repoA.patients.get(p1.id))?.fullName === 'Deneme Hasta');
  await expectError('Aynı kodla ikinci danışan reddedilir', () => repoA.patients.save({ code: 't-001' }), /zaten kullanılıyor/);
  const p1b = await repoA.patients.save({ ...p1, notes: 'güncel' });
  check('Danışan güncelleme', p1b.notes === 'güncel' && (await repoA.patients.get(p1.id)).notes === 'güncel');

  // 3) Seans + sözcük tablosu
  const s1 = await repoA.sessions.save({ patientId: p1.id, module: 'aphasia', taskType: 'picture', recordedAt: '2026-01-10T10:00:00.000Z',
    transcript: { text: 'anne su', engine: 'manual' }, analysis: { language: { mluM: 5.2 }, wordTable: [{ w: 'anne' }, { w: 'su' }] } });
  const g1 = await repoA.sessions.get(s1.id);
  check('Seans kaydı ve okuma', g1?.analysis?.language?.mluM === 5.2 && g1.analysis.wordTable.length === 2);
  const lite = (await repoA.sessions.list())[0];
  check('Liste sözcük tablosunu indirmiyor (hız)', lite && lite.analysis && lite.analysis.wordTable === undefined);
  check('Tam liste sözcük tablosunu getiriyor', (await repoA.sessions.list({ full: true }))[0].analysis.wordTable.length === 2);
  await repoA.sessions.save({ ...lite, status: 'verified' });
  check('Listeden gelen kayıt kaydedilince sözcük tablosu korunur', (await repoA.sessions.get(s1.id)).analysis.wordTable.length === 2);

  // 4) Parçalı ses yükleme (singleMax 2000 B, parça 800 B)
  const bytes = new Uint8Array(5000); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
  const a1 = await repoA.audio.put(s1.id, new Blob([bytes], { type: 'audio/wav' }), { fileName: 'kayit.wav', durationSec: 3 });
  const objs = (await pg.query("select count(*)::int as n from storage.objects where name like $1", [`${orgA}/${s1.id}/%`])).rows[0].n;
  check('Büyük ses parçalara bölünerek yüklendi', a1.parts === 7 && objs === 7, `${a1.parts} parça · ${objs} nesne`);
  await repoA.sessions.save({ ...(await repoA.sessions.get(s1.id)), audioId: a1.id });
  const got = await repoA.audio.get(a1.id);
  const gb = new Uint8Array(await got.blob.arrayBuffer());
  check('Ses parçaları birleştirilip aynı bayta ulaşıldı', gb.length === 5000 && gb.every((x, i) => x === bytes[i]) && got.mimeType === 'audio/wav');
  check('Ekip ses kullanımı', (await repoA.usage()).usage === 5000);

  // 5) Akustik diziler (tipli)
  const frames = new Int16Array([1, -2, 300, -32000]);
  await repoA.acoustic.put(s1.id, { hopSec: 0.01, frames, peaks: new Float32Array([0.5, -0.25]) });
  const ac = await repoA.acoustic.get(s1.id);
  check('Akustik tipli diziler korunur', ac.frames instanceof Int16Array && ac.frames[3] === -32000 && ac.peaks instanceof Float32Array && ac.peaks[1] === -0.25);

  // 6) Sözlük
  await repoA.lexicon.save('gitti', { root: 'git', pos: 'verb' });
  await repoA.lexicon.save('gitti', { root: 'git', pos: 'verb', v: 2 });
  const lex = await repoA.lexicon.list();
  check('Ekip sözlüğü ekle/güncelle', lex.length === 1 && lex[0].analysis.v === 2);

  // 7) Günlük
  const log = await repoA.audit.list();
  check('İşlem günlüğü yazıldı', ['org.create', 'patient.create', 'session.create'].every((a) => log.some((e) => e.action === a)), log.map((e) => e.action).join(', '));

  // 8) B kaydolur (ekip adı vermeden) → kendi ekibi
  await auth.logout();
  await auth.register({ email: 'mehmet@test.com', password: 'parola123', name: 'Mehmet Kaya', title: '' });
  let ctxB = await auth.loadContext();
  check('İkinci kullanıcı kendi ekibini aldı', ctxB.org?.name === 'Mehmet Kaya Ekibi' && ctxB.orgs.length === 1);
  const bUid = ctxB.user.id;
  const orgBOwn = ctxB.org.id;

  // RLS: B, A'nın ekibini göremez / yazamaz
  const peek = await sb.from('patients').select('*').eq('org_id', orgA);
  check('RLS: başka ekibin danışanları görünmez', !peek.error && peek.data.length === 0);
  const sneak = await sb.from('patients').insert({ org_id: orgA, code: 'X-1', data: {} }).select('id');
  check('RLS: başka ekibe kayıt eklenemez', !!sneak.error && sneak.error.code === '42501', sneak.error?.message);
  const dl = await sb.storage.from('recordings').download(`${orgA}/${s1.id}/${a1.id}.wav.part000`);
  check('RLS: başka ekibin ses dosyası indirilemez', !!dl.error);
  const orgsPeek = await sb.from('orgs').select('*').eq('id', orgA);
  check('RLS: başka ekip bilgisi görünmez', orgsPeek.data.length === 0);
  const selfJoin = await sb.from('members').insert({ org_id: orgA, user_id: bUid, email: 'mehmet@test.com', role: 'owner', status: 'active' }).select('id');
  check('Kendini başka ekibe ekleyemez', !!selfJoin.error, selfJoin.error?.message);
  const rpcAdd = await sb.rpc('add_member', { p_org: orgA, p_email: 'mehmet@test.com', p_role: 'owner' });
  check('Yetkisiz add_member reddedilir', !!rpcAdd.error, rpcAdd.error?.message);
  const profTamper = await sb.from('profiles').update({ email: 'ayse@test.com' }).eq('id', bUid).select('id');
  check('Profil e-postası değiştirilemez (sütun izni)', !!profTamper.error, profTamper.error?.message);

  // 9) A, B'yi ekler (hesap var → hemen etkin)
  await auth.logout();
  await auth.login('ayse@test.com', 'parola123');
  ctxA = await auth.loadContext();
  const mB = await auth.addMember(ctxA, { email: 'MEHMET@test.com', role: 'clinician' });
  check('Var olan hesap ekibe hemen eklenir', mB.status === 'active' && mB.role === 'clinician');
  const mC = await auth.addMember(ctxA, { email: 'can@test.com', role: 'viewer' });
  check('Hesabı olmayan kişi davet olarak eklenir', mC.status === 'invited');
  await expectError('Aynı kişi iki kez eklenemez', () => auth.addMember(ctxA, { email: 'can@test.com', role: 'viewer' }), /zaten ekipte/);
  const members = await auth.listMembers(orgA);
  check('Üye listesi profillerle', members.length === 3 && members.find((m) => m.email === 'mehmet@test.com')?.user?.name === 'Mehmet Kaya');

  // 10) B, A'nın ekibinde çalışır
  await auth.logout();
  await auth.login('mehmet@test.com', 'parola123');
  ctxB = await auth.loadContext();
  check('B iki ekibi görür', ctxB.orgs.length === 2);
  await auth.switchOrg(orgA);
  ctxB = await auth.loadContext();
  let repoB = createRepo(ctxB);
  check('B ekip değiştirdi (klinisyen)', ctxB.org.id === orgA && ctxB.member.role === 'clinician');
  check('B ortak danışanları görür', (await repoB.patients.list()).length === 1);
  const bAudio = await repoB.audio.get(a1.id);
  check('B ortak ses kaydını dinleyebilir', bAudio && bAudio.blob.size === 5000);
  const s2 = await repoB.sessions.save({ patientId: p1.id, module: 'aphasia', taskType: 'free', transcript: { text: 'b' } });
  check('B ortak ekibe seans ekleyebilir', !!(await repoA.sessions.get(s2.id)));
  await expectError('Klinisyen üye ekleyemez', () => auth.addMember(ctxB, { email: 'x@test.com', role: 'viewer' }), /yetki/i);
  const auditB = await sb.from('audit').insert({ org_id: orgA, user_id: ctxA.user.id, action: 'sahte', detail: {} }).select('user_id');
  check('Günlükte başkası adına kayıt yazılamaz (sunucu damgalar)', !auditB.error && auditB.data[0].user_id === bUid);
  const roleTamper = await sb.from('members').update({ role: 'owner' }).eq('user_id', bUid).select('id');
  check('Kendi rolünü doğrudan yükseltemez', !!roleTamper.error || roleTamper.data.length === 0, roleTamper.error?.message || '0 satır');
  const orgRename = await sb.from('orgs').update({ name: 'Ele geçirildi' }).eq('id', orgA).select('id');
  check('Klinisyen ekip adını değiştiremez', (orgRename.data || []).length === 0);

  // 11) Rol kuralları
  await auth.logout();
  await auth.login('ayse@test.com', 'parola123');
  ctxA = await auth.loadContext();
  await auth.setMemberRole(ctxA, mB.id, 'viewer');
  await expectError('Sahip kendi rolünü düşüremez', () => auth.setMemberRole(ctxA, ctxA.member.id, 'admin'), /Kendi rolünüzü/);
  await expectError('Sahip kendini çıkaramaz', () => auth.removeMember(ctxA, ctxA.member.id), /Kendinizi/);
  await auth.logout();
  await auth.login('mehmet@test.com', 'parola123');
  await auth.switchOrg(orgA);
  ctxB = await auth.loadContext();
  repoB = createRepo(ctxB);
  check('Rol gözlemciye düştü', ctxB.member.role === 'viewer');
  await expectError('Gözlemci danışan ekleyemez (istemci)', () => repoB.patients.save({ code: 'V-1' }), /yetkiniz yok/);
  const vIns = await sb.from('patients').insert({ org_id: orgA, code: 'V-2', data: {} }).select('id');
  check('Gözlemci danışan ekleyemez (RLS)', !!vIns.error && vIns.error.code === '42501');
  check('Gözlemci verileri görebilir', (await repoB.sessions.list()).length === 2);

  // 12) Davet: C kaydolur → A'nın ekibine katılır, kendi ekibi açılmaz
  await auth.logout();
  const rC = await auth.register({ email: 'can@test.com', password: 'parola123', name: 'Can Demir' });
  const ctxC = await auth.loadContext();
  check('Davetli kişi kayıtta ekibe katıldı', rC.joined === 1 && ctxC.org?.id === orgA && ctxC.member.role === 'viewer' && ctxC.orgs.length === 1);

  // 13) E-posta doğrulaması açık: doğrulanmamış hesap davet ele geçiremez
  sb._test.setAutoConfirm(false);
  await auth.logout();
  const rD = await auth.register({ email: 'deniz@test.com', password: 'parola123', name: 'Deniz' });
  check('Doğrulama gerekiyorsa oturum açılmaz', rD.needsConfirmation === true);
  await expectError('Doğrulanmamış hesapla giriş yapılamaz', () => auth.login('deniz@test.com', 'parola123'), /doğrulanmadı/);
  await auth.login('ayse@test.com', 'parola123');
  ctxA = await auth.loadContext();
  const mD = await auth.addMember(ctxA, { email: 'deniz@test.com', role: 'clinician' });
  check('Doğrulanmamış hesap davetli kalır', mD.status === 'invited');
  await auth.logout();
  await sb._test.confirmEmail('deniz@test.com');
  await auth.login('deniz@test.com', 'parola123');
  const ctxD = await auth.loadContext();
  check('Doğrulamadan sonra davet üyeliğe döner', ctxD.orgs.some((o) => o.id === orgA));
  const dupReg = await sb.auth.signUp({ email: 'ayse@test.com', password: 'x' });
  check('Kayıtlı e-postayla yeniden kayıt olunamaz', dupReg.data.user && dupReg.data.user.identities.length === 0);
  sb._test.setAutoConfirm(true);

  // 14) Parola değişimi
  await auth.logout();
  await auth.login('ayse@test.com', 'parola123');
  ctxA = await auth.loadContext();
  await expectError('Yanlış mevcut parola reddedilir', () => auth.changePassword(ctxA.user.id, 'yanlis', 'yeniParola1'), /Mevcut parola/);
  await auth.changePassword(ctxA.user.id, 'parola123', 'yeniParola1');
  await auth.logout();
  await auth.login('ayse@test.com', 'yeniParola1');
  ctxA = await auth.loadContext();
  check('Parola değişti ve yeni parolayla girildi', !!ctxA);
  repoA = createRepo(ctxA);

  // 15) Güvenli olmayan ses türü veritabanında reddedilir
  const badMime = await sb.from('audio_files').insert({ org_id: orgA, session_id: s1.id, path: 'x', mime_type: 'text/html', size_bytes: 1 }).select('id');
  check('text/html ses kaydı olarak kaydedilemez', !!badMime.error && badMime.error.code === '23514', badMime.error?.message);

  // 16) Yedek al → B'nin kendi ekibine yükle
  const { blob: zip } = await exportBackup(repoA, { includeAudio: true });
  check('Yedek ZIP oluşturuldu', zip.size > 1000, `${zip.size} bayt`);
  await auth.logout();
  await auth.login('mehmet@test.com', 'parola123');
  await auth.switchOrg(orgBOwn);
  ctxB = await auth.loadContext();
  repoB = createRepo(ctxB);
  const imp = await importBackup(repoB, new File([zip], 'yedek.zip'));
  check('Yedek başka ekibe yeni kimliklerle yüklendi', imp.patients === 1 && imp.sessions === 2 && imp.audio === 1, JSON.stringify({ p: imp.patients, s: imp.sessions, a: imp.audio }));
  const impAudio = (await repoB.sessions.list()).find((s) => s.audioId);
  const ia = impAudio && await repoB.audio.get(impAudio.audioId);
  check('İçe aktarılan ses kaydı açılıyor', ia && ia.blob.size === 5000);
  const imp2 = await importBackup(repoB, new File([zip], 'yedek.zip'));
  check('Aynı yedek ikinci kez yüklenince kopya oluşmaz', imp2.sessions === 0 && imp2.skipped === 2);
  check('Kaynak ekip etkilenmedi', (await repoA.sessions.list()).length === 2);

  // 17) Seans silme: depo nesneleri ve bağlı satırlar temizlenir
  await auth.logout();
  await auth.login('ayse@test.com', 'yeniParola1');
  ctxA = await auth.loadContext();
  repoA = createRepo(ctxA);
  await repoA.sessions.remove(s1.id);
  const left = (await pg.query("select count(*)::int as n from storage.objects where name like $1", [`${orgA}/${s1.id}/%`])).rows[0].n;
  const leftRows = (await pg.query('select (select count(*) from audio_files where session_id = $1)::int as a, (select count(*) from acoustic where session_id = $1)::int as c', [s1.id])).rows[0];
  check('Seans silinince ses nesneleri de silinir', left === 0, `${left} nesne kaldı`);
  check('Seans silinince ses/akustik satırları silinir', leftRows.a === 0 && leftRows.c === 0);
  await repoA.patients.remove(p1.id);
  check('Danışan silinince seansları da silinir', (await repoA.sessions.list()).length === 0);

  // Özet
  const pass = results.filter((r) => r.ok).length;
  sum.textContent = `${pass} / ${results.length} test geçti`;
  sum.className = `sum ${pass === results.length ? 'ok' : 'bad'}`;
  window.__cloudResults = results;
}

main().catch((err) => {
  console.error(err);
  row(false, 'Beklenmeyen hata', `${err.message}\n${err.stack || ''}`.slice(0, 600));
  sum.textContent = `Hata: ${err.message}`;
  sum.className = 'sum bad';
  window.__cloudResults = results;
});
