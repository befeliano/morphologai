/** Ayarlar: profil, analiz parametreleri, kayıt ve transkripsiyon, ekip sözlüğü, yapay zekâ, veri. */
import { h, mount, icon, field, select, toast, confirmDialog, fmtBytes, badge, download, num, fmtDateTime, emptyState } from '../ui/dom.js';
import { changePassword, updateProfile, updateOrg } from '../../data/auth.js';
import { DEFAULT_SETTINGS } from '../../core/analysis.js';
import { setOverrides } from '../../core/text/morphology.js';
import { chips, posTag } from '../components/morphView.js';
import { exportBackup, importBackup, legacyCount, migrateLegacy, listLocalOrgs, copyLocalToCloud } from '../../data/backup.js';
import { createDemoData, removeDemoData } from '../../data/demo.js';
import { requestPersistence, destroyDatabase } from '../../data/db.js';
import { sttCapabilities, onDeviceStatus, installOnDevice, browserInfo } from '../../core/stt/webspeech.js';
import { WHISPER_MODELS, hasWebGPU, defaultWhisperModel, preloadWhisper, whisperCacheStatus } from '../../core/stt/whisper.js';
import { listInputDevices } from '../../core/audio/recorder.js';
import { AI_ENABLED, GEMINI_CONFIG } from '../../ai/gemini.js';
import { DEFAULT_NORMS } from '../../core/metrics/screening.js';
import { getLexicon } from '../../core/text/lexicon.js';
import { ENGINE_ID } from '../../core/text/morphology.js';

const TABS = [
  ['profil', 'Profil', 'user'],
  ['analiz', 'Analiz', 'activity'],
  ['kayit', 'Kayıt ve transkripsiyon', 'mic'],
  ['sozluk', 'Ekip sözlüğü', 'book'],
  ['ai', 'Yapay zekâ', 'sparkles'],
  ['veri', 'Veri ve yedek', 'database'],
];

export async function render(root, { query }, app) {
  app.setCrumbs([{ label: 'Ayarlar' }]);
  app.setActions([]);
  let tab = TABS.some(([id]) => id === query.tab) ? query.tab : 'profil';
  const bar = h('div.tabs');
  const panel = h('div');
  const drawBar = () => mount(bar, ...TABS.map(([id, label, ic]) => h(`button${id === tab ? '.on' : ''}`, { on: { click: () => { tab = id; history.replaceState(null, '', `#/ayarlar?tab=${id}`); drawBar(); draw(); } } }, icon(ic, 15), label)));
  const draw = async () => {
    const fn = { profil: profile, analiz: analysis, kayit: recording, sozluk: lexicon, ai, veri: data }[tab];
    mount(panel, h('div.row', { style: { padding: '30px', justifyContent: 'center' } }, h('div.spinner')));
    mount(panel, await fn(app));
  };
  drawBar();
  mount(root, h('div.page-head', null, h('div', null, h('h1', null, 'Ayarlar'), h('p', null, 'Hesabınız, ekibinizin analiz parametreleri ve verileriniz.'))), bar, panel);
  draw();
}

// ---------------------------------------------------------------------------
async function profile(app) {
  const u = app.ctx.user;
  const title = h('input.input', { value: u.title || '' });
  const name = h('input.input', { value: u.name || '' });
  const save = h('button.btn.btn-primary.btn-sm', null, icon('save', 14), 'Profili kaydet');
  save.addEventListener('click', async () => {
    await updateProfile(u.id, { name: name.value, title: title.value });
    await app.refreshContext();
    toast('Profil güncellendi.', 'success');
    location.reload();
  });
  const oldPw = h('input.input', { type: 'password', autocomplete: 'current-password' });
  const newPw = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const newPw2 = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const pwBtn = h('button.btn.btn-primary.btn-sm', null, icon('lock', 14), 'Parolayı değiştir');
  pwBtn.addEventListener('click', async () => {
    try {
      if (newPw.value !== newPw2.value) throw new Error('Yeni parolalar eşleşmiyor.');
      await changePassword(u.id, oldPw.value, newPw.value);
      await app.refreshContext();
      oldPw.value = newPw.value = newPw2.value = '';
      toast('Parolanız değiştirildi.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  const IDLE_KEY = 'morphologai.idleMinutes';
  let idleNow = 30;
  try { const v = localStorage.getItem(IDLE_KEY); idleNow = v == null ? 30 : Number(v) || 0; } catch { /* yok say */ }
  const idleSel = select([{ id: '15', label: '15 dakika' }, { id: '30', label: '30 dakika (önerilen)' }, { id: '60', label: '1 saat' }, { id: '120', label: '2 saat' }, { id: '0', label: 'Kapalı' }], String(idleNow));
  idleSel.addEventListener('change', () => {
    try { localStorage.setItem(IDLE_KEY, idleSel.value); } catch { /* yok say */ }
    toast(idleSel.value === '0' ? 'Otomatik çıkış kapatıldı (paylaşılan bilgisayarlarda önerilmez).' : 'Otomatik çıkış süresi kaydedildi.', idleSel.value === '0' ? 'warning' : 'success');
  });
  return h('div.grid.grid-2', null,
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('user', 18), 'Profil')),
      h('div.card-body', null, h('div.form-grid', null, field('Unvan', title, 'ör. Dkt., Uzm. Dkt., Dr.'), field('Ad Soyad', name)),
        field('E-posta', h('input.input', { value: u.email, disabled: true }), 'Giriş kimliğiniz; değiştirilemez.'),
        h('div.row.mt-2', null, save),
        h('div.divider'),
        field('Hareketsizlikte otomatik çıkış (bu bilgisayar)', idleSel, 'Hastane gibi paylaşılan bilgisayarlarda danışan verisini korur. Kayıt ya da çözümleme sürerken çıkış yapılmaz.'))),
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('lock', 18), 'Parola')),
      h('div.card-body', null,
        u.defaultPassword ? h('div.callout.warn', { style: { marginBottom: '12px' } }, icon('alert', 18), h('div', null, 'Varsayılan parola kullanılıyor; lütfen değiştirin.')) : null,
        h('div.stack', { style: { gap: '12px' } }, field('Mevcut parola', oldPw), field('Yeni parola', newPw, 'En az 8 karakter.'), field('Yeni parola (tekrar)', newPw2)),
        h('div.row.mt-2', null, pwBtn),
        h('p.tiny.muted.mt-2', null, app.backend.isCloud
          ? 'Parolanız Supabase Auth tarafından özetlenerek (bcrypt) saklanır; uygulama parolanızı hiçbir zaman görmez ya da saklamaz.'
          : 'Parolanız bu cihazda PBKDF2-SHA256 (210.000 tur) ile özetlenerek saklanır; açık hâli hiçbir yerde tutulmaz.'))));
}

// ---------------------------------------------------------------------------
async function analysis(app) {
  const s = { ...DEFAULT_SETTINGS, ...(app.ctx.org.settings?.analysis || {}) };
  const canEdit = app.can('settings.write');
  const cb = (key, label, help) => {
    const c = h('input', { type: 'checkbox', checked: !!s[key], disabled: !canEdit });
    c.addEventListener('change', () => { s[key] = c.checked; });
    return h('label.check', null, c, h('span', null, h('b', null, label), help ? h('div.small.muted', null, help) : null));
  };
  const numIn = (key, min, max, step = 1) => {
    const i = h('input.input', { type: 'number', min, max, step, value: s[key], disabled: !canEdit });
    i.addEventListener('change', () => { s[key] = Number(i.value); });
    return i;
  };
  const save = h('button.btn.btn-primary.btn-sm', { disabled: !canEdit }, icon('save', 14), 'Ekip ayarlarını kaydet');
  save.addEventListener('click', async () => {
    await updateOrg(app.ctx, { settings: { ...app.ctx.org.settings, analysis: s } });
    await app.refreshContext();
    toast('Analiz ayarları kaydedildi. Mevcut seanslar açıldığında yeni ayarlarla hesaplanır.', 'success', 6000);
  });
  const reset = h('button.btn.btn-ghost.btn-sm', { disabled: !canEdit }, icon('refresh', 14), 'Varsayılanlara dön');
  reset.addEventListener('click', async () => {
    await updateOrg(app.ctx, { settings: { ...app.ctx.org.settings, analysis: { ...DEFAULT_SETTINGS } } });
    await app.refreshContext();
    app.navigate('/ayarlar?tab=analiz');
  });
  const normRows = Object.entries(DEFAULT_NORMS).map(([, n]) => h('tr', null, h('td', null, n.label), h('td.num', null, n.pct ? `%${num(n.mean * 100, 0)}` : num(n.mean)), h('td.num', null, n.pct ? `%${num(n.sd * 100, 0)}` : num(n.sd)), h('td', null, n.dir === 'low' ? 'düşük değer' : 'yüksek değer'), h('td.small.muted', null, n.unit || '')));
  return h('div.stack', null,
    !canEdit ? h('div.callout.info', null, icon('lock', 18), h('div', null, 'Analiz ayarlarını yalnızca ekip yöneticileri değiştirebilir.')) : null,
    h('div.grid.grid-2', null,
      h('div.card', null, h('div.card-head', null, h('h2', null, icon('fileText', 18), 'MLU ve transkript kuralları')),
        h('div.card-body.stack', { style: { gap: '14px' } },
          cb('excludeYesNo', 'Tek sözcüklük evet/hayır yanıtlarını MLU dışında tut', 'evet, hayır, tamam, peki… (SALT/Türkçe MLU uygulaması)'),
          cb('excludeIncomplete', 'Yarım kalan sözceleri MLU dışında tut', '"..." ya da "+..." ile biten sözceler'),
          cb('excludeUnintelligible', 'Anlaşılmayan bölüm içeren sözceleri dışarıda tut', '"xxx" içeren sözceler'),
          cb('excludeDiscourse', 'Söylem belirleyicilerini dolgu say', 'yani, işte, hani, falan — MLU\'ya katılmaz, dolgu olarak sayılır'),
          cb('autoRepetition', 'Ardışık tekrarları otomatik ayıkla', '"araba araba", "ben gittim ben gittim" — ilk söyleniş tekrar sayılır'))),
      h('div.card', null, h('div.card-head', null, h('h2', null, icon('clock', 18), 'Akustik parametreler')),
        h('div.card-body', null, h('div.form-grid', null,
          field('En kısa duraksama (ms)', numIn('minPauseMs', 100, 1000, 50), 'Bundan kısa sessizlikler duraksama sayılmaz (varsayılan 250 ms).'),
          field('Uzun duraksama eşiği (ms)', numIn('longPauseMs', 1000, 5000, 250), 'Kelime bulma güçlüğü göstergesi (varsayılan 2000 ms).'),
          field('Ses algılama eşik düzeltmesi (dB)', numIn('vadOffsetDb', -10, 10, 1), 'Gürültülü kayıtlarda artırın (+), fısıltılı konuşmada azaltın (−).'),
          field('MATTR pencere boyutu', numIn('mattrWindow', 10, 100, 5), 'Sözcük çeşitliliği için kayan pencere (varsayılan 50).'))))),
    h('div.row', null, save, reset),
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('gauge', 18), 'Afazi tarama göstergesi — referans değerler')),
      h('div.card-body', null,
        h('div.callout.info', { style: { marginBottom: '12px' } }, icon('info', 18), h('div', null,
          h('b', null, 'Kendi normlarınızı oluşturun: '), 'Danışan kaydında grubu "Kontrol grubu" olan kişilerin aynı görev türündeki en az 5 seansı olduğunda, tarama göstergesi bu varsayılanlar yerine ekibinizin kontrol grubu ortalama ve standart sapmalarını kullanır.')),
        h('div.table-wrap', null, h('table.table', null, h('thead', null, h('tr', null, h('th', null, 'Ölçüt'), h('th.num', null, 'Ortalama'), h('th.num', null, 'SS'), h('th', null, 'Bozulma yönü'), h('th', null, 'Birim'))), h('tbody', null, normRows))),
        h('p.tiny.muted.mt-2', null, 'Varsayılan değerler yetişkin söylem literatüründen yaklaşık alınmıştır ve Türkçe için standartlaştırılmamıştır.'))));
}

// ---------------------------------------------------------------------------
async function recording(app) {
  const caps = sttCapabilities();
  const b = browserInfo();
  const local = await onDeviceStatus();
  const devices = await listInputDevices();
  const ts = { ...(app.ctx.org.settings?.transcription || {}) };
  const whisper = select(WHISPER_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.size})${m.webgpuOnly ? ' — WebGPU gerekir' : ''}` })), ts.whisperModel || WHISPER_MODELS[0].id, { disabled: !app.can('settings.write') });
  whisper.addEventListener('change', async () => {
    await updateOrg(app.ctx, { settings: { ...app.ctx.org.settings, transcription: { ...ts, whisperModel: whisper.value } } });
    await app.refreshContext();
    toast('Varsayılan Whisper modeli kaydedildi.', 'success');
  });
  const row = (k, v, tone) => h('div.row.between', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } }, h('span.small', null, k), tone ? badge(v, tone) : h('b.small', null, v));

  // Whisper modelini önceden indir (seans sırasında beklememek için)
  const preModel = select(WHISPER_MODELS.filter((m) => !m.webgpuOnly || hasWebGPU()).map((m) => ({ id: m.id, label: `${m.label} (${m.size})` })), defaultWhisperModel(ts.whisperModel));
  const cacheBadge = h('span');
  const drawCache = async () => {
    const s = await whisperCacheStatus(preModel.value);
    mount(cacheBadge, s === 'cached' ? badge('Bu tarayıcıda hazır', 'ok', true) : s === 'partial' ? badge('Yarım indirilmiş', 'warn', true) : s === 'missing' ? badge('İndirilmedi', 'outline', true) : badge('Bilinmiyor', 'outline', true));
  };
  preModel.addEventListener('change', drawCache);
  drawCache();
  const pbar = h('span');
  const pwrap = h('div.progress.mt-2', { hidden: true }, pbar);
  const ptext = h('div.tiny.muted.mt-1');
  const dlBtn = h('button.btn.btn-primary.btn-sm', null, icon('download', 14), 'Modeli indir ve hazırla');
  dlBtn.addEventListener('click', async () => {
    dlBtn.disabled = true;
    pwrap.hidden = false;
    ptext.textContent = 'Başlatılıyor…';
    try {
      const device = await preloadWhisper(preModel.value, {
        onLoad: (v, t) => { pbar.style.width = `${Math.round(v * 100)}%`; ptext.textContent = t; },
        onStatus: (s) => { if (s === 'transcribing') { pbar.style.width = '100%'; ptext.textContent = 'Model hazırlanıyor (ekran kartı ısıtılıyor)…'; } if (s === 'fallback') ptext.textContent = 'Ekran kartı kullanılamadı; işlemci ile hazırlanıyor…'; },
      });
      ptext.textContent = `Hazır · ${device === 'webgpu' ? 'ekran kartı (WebGPU)' : 'işlemci (WebAssembly)'} ile çalışacak.`;
      toast('Whisper modeli indirildi ve hazır. Bundan sonra yazıya dökme beklemeden başlar.', 'success', 7000);
    } catch (err) {
      ptext.textContent = '';
      toast(`Model indirilemedi: ${err.message}`, 'error', 9000);
    }
    dlBtn.disabled = false;
    drawCache();
  });

  const install = local === 'downloadable' ? h('button.btn.btn-soft.btn-sm.mt-2', { on: { click: async () => { toast('Türkçe cihaz içi dil paketi indiriliyor…', 'info'); const ok = await installOnDevice(); toast(ok ? 'Kuruldu.' : 'Kurulamadı.', ok ? 'success' : 'error'); } } }, icon('download', 14), 'Türkçe cihaz içi paketi kur') : null;
  const testMic = h('button.btn.btn-ghost.btn-sm', null, icon('mic', 14), 'Mikrofon iznini ver ve listele');
  const devList = h('div.small.mt-2', null, devices.map((d) => h('div', null, '• ', d.label)));
  testMic.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      const list = await listInputDevices();
      mount(devList, ...list.map((d) => h('div', null, '• ', d.label)));
    } catch (err) { toast(`Mikrofon: ${err.message}`, 'error'); }
  });
  return h('div.grid.grid-2', null,
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('mic', 18), 'Canlı kayıt')),
      h('div.card-body', null,
        row('Tarayıcı', `${b.name}${b.chromeVersion ? ' ' + b.chromeVersion : ''}`),
        row('Kayıt biçimi', 'WAV · 16-bit PCM · kayıpsız', 'ok'),
        row('Tarayıcı ses işleme', 'kapalı (ham sinyal)', 'ok'),
        row('Anlık konuşma tanıma', caps.available ? 'destekleniyor' : caps.blockedReason ? `${b.name}'da çalışmaz` : 'desteklenmiyor', caps.available ? 'ok' : 'danger'),
        row('Tanımada seçili mikrofon kullanımı', caps.trackInput ? 'evet (Chrome 133+)' : 'hayır (varsayılan mikrofon)', caps.trackInput ? 'ok' : 'warn'),
        row('Cihaz içi Türkçe tanıma', { available: 'kullanılabilir', downloadable: 'indirilebilir', downloading: 'indiriliyor', unavailable: 'Türkçe için yok', unsupported: 'desteklenmiyor' }[local] || local, local === 'available' ? 'ok' : 'warn'),
        install,
        h('div.mt-3', null, testMic, devList),
        h('div.callout.info.mt-3', null, icon('info', 18), h('div', null, h('b', null, '"network" hatası alırsanız: '), 'Web konuşma tanıma Chrome\'da Google sunucularına bağlanır. Sayfayı Google Chrome ile açın (uygulama içi tarayıcılar, Brave vb. desteklemez), VPN/güvenlik duvarını kontrol edin. Kayıt her durumda alınır; transkript sonradan eklenebilir.')))),
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('cpu', 18), 'Transkripsiyon')),
      h('div.card-body', null,
        row('Dosyadan Chrome ile tanıma', caps.fileTranscription ? 'kullanılabilir' : 'güncel Chrome gerekir', caps.fileTranscription ? 'ok' : 'warn'),
        row('WebGPU (Whisper hızlandırma)', hasWebGPU() ? 'var' : 'yok — işlemciyle çalışır (daha yavaş)', hasWebGPU() ? 'ok' : 'warn'),
        h('div.mt-2', null, field('Ekibin varsayılan Whisper modeli', whisper, 'Ses dışarı gönderilmez; model ilk kullanımda Hugging Face\'ten indirilir ve bu tarayıcıda saklanır.')),
        h('div.mt-3', { style: { padding: '14px', border: '1px solid var(--border)', borderRadius: '12px' } },
          h('div.row.between', null, h('b.small', null, 'Modeli önceden indir'), cacheBadge),
          h('p.tiny.muted', { style: { margin: '6px 0 10px' } }, 'Bir kez indirip hazırlayın; sonraki seanslarda yazıya dökme beklemeden başlar. Her bilgisayarda/tarayıcıda bir kez gerekir.'),
          h('div.row', { style: { gap: '8px' } }, h('div', { style: { flex: '1 1 220px' } }, preModel), dlBtn),
          pwrap, ptext),
        h('div.callout.warn.mt-3', null, icon('alert', 18), h('div', null, h('b', null, 'Önemli: '), 'Otomatik konuşma tanıma sistemleri afazik konuşmadaki parafazileri çoğu zaman "düzeltir", dolgu ve tekrarları atlar. Klinik ölçümler için transkripti mutlaka dinleyerek kontrol edin ve "Doğrulandı" olarak işaretleyin.')))));
}

// ---------------------------------------------------------------------------
async function lexicon(app) {
  const list = await app.repo.lexicon.list();
  const lex = getLexicon();
  const canEdit = app.can('lexicon.write');
  const rows = list.map((e) => {
    const del = h('button.btn.btn-text.btn-sm', { disabled: !canEdit, style: { color: 'var(--danger)' } }, icon('trash', 14));
    del.addEventListener('click', async () => {
      await app.repo.lexicon.remove(e.id);
      setOverrides(await app.repo.lexicon.map());
      toast(`"${e.word}" ekip sözlüğünden çıkarıldı.`, 'success');
      app.navigate('/ayarlar?tab=sozluk');
    });
    return h('tr', null, h('td', null, h('b', null, e.word)), h('td', null, chips(e.analysis)), h('td', null, posTag(e.analysis.pos, e.analysis.posLabel)),
      h('td.num', null, e.analysis.morphemeCount), h('td.small.muted', null, fmtDateTime(e.updatedAt)), h('td', { style: { textAlign: 'right' } }, del));
  });
  return h('div.stack', null,
    h('div.grid.grid-4', null,
      ...[['Temel sözlük', num(lex.size, 0), 'kök girdisi (Zemberek-NLP)'], ['Gövde biçimi', num(lex.stems.size, 0), 'ses olaylı yüzey biçimleri'],
        ['Özel ad havuzu', num(lex.proper.size, 0), 'kişi, yer ve kurum adı'], ['Ekip düzeltmesi', num(list.length, 0), 'bu ekibe özel']]
        .map(([k, v, n]) => h('div.card.stat', null, h('div', null, h('div.label', null, k), h('div.value', null, v), h('div.hint', null, n))))),
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('book', 18), 'Ekip sözlüğü'), h('span.sub', null, 'Seans ekranında "Düzelt → Ekip sözlüğüne kaydet" ile eklenir; tüm seanslarda önceliklidir')),
      h('div.card-body.tight', null, rows.length ? h('div.table-wrap', null, h('table.table', null,
        h('thead', null, h('tr', null, h('th', null, 'Sözcük'), h('th', null, 'Çözümleme'), h('th', null, 'Tür'), h('th.num', null, 'Biçimbirim'), h('th', null, 'Güncelleme'), h('th'))),
        h('tbody', null, rows))) : emptyState({ icon: 'book', title: 'Ekip sözlüğü boş', text: 'Bir seansın Biçimbirim sekmesinde bir sözcüğü düzeltip "Ekip sözlüğüne kaydet" seçeneğini işaretlediğinizde burada görünür.' }))),
    h('p.tiny.muted', null, `Motor: ${ENGINE_ID} · Kaynaklar: ${lex.sources.join(', ')}`));
}

// ---------------------------------------------------------------------------
async function ai() {
  const key = h('input.input', { type: 'password', placeholder: 'AIza…', disabled: true });
  const model = h('input.input', { value: GEMINI_CONFIG.model, disabled: true });
  return h('div.grid.grid-main', null,
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('sparkles', 18), 'Gemini ile yapay zekâ yorumu'), badge(AI_ENABLED ? 'Etkin' : 'Yakında — pasif', AI_ENABLED ? 'ok' : 'outline')),
      h('div.card-body', null,
        h('p.small', null, 'Bu entegrasyon; seans sesini ve transkriptini Google Gemini modeline göndererek nitel klinik yorum (akıcılık, dilbilgisi, sözcük erişimi gözlemleri, olası parafazi adayları, terapi hedefi önerileri) almak için hazırlandı. Yanıt yapılandırılmış (JSON) olarak alınır ve seans raporuna eklenebilir.'),
        h('div.form-grid.mt-2', null, field('API anahtarı', key, 'Etkinleştirildiğinde anahtar tarayıcıda değil, Vercel sunucu işlevinde (ortam değişkeni) tutulacaktır.'), field('Model', model)),
        h('div.callout.warn.mt-3', null, icon('shield', 18), h('div', null,
          h('b', null, 'Etkinleştirmeden önce: '), 'Sağlık verisinin yurt dışındaki bir hizmete aktarımı KVKK kapsamında açık rıza ve kurum/etik kurul onayı gerektirir. Bu nedenle özellik şimdilik kapalıdır ve hiçbir veri gönderilmez.')))),
    h('div.card', null, h('div.card-head', null, h('h3', null, icon('info', 17), 'Hazır altyapı')),
      h('div.card-body.small', null, h('ul', { style: { paddingLeft: '18px', display: 'grid', gap: '6px' } },
        h('li', null, h('code.mono', null, 'js/ai/gemini.js'), ' — istem, yanıt şeması, istek gövdesi'),
        h('li', null, h('code.mono', null, 'api/ai/gemini.js'), ' — anahtarı sunucuda tutan Vercel işlevi (kapalı)'),
        h('li', null, 'Etkinleştirme: ', h('code.mono', null, 'AI_ENABLED = true'), ' ve Vercel\'de ', h('code.mono', null, 'GEMINI_API_KEY'), ' ortam değişkeni')))));
}

// ---------------------------------------------------------------------------
async function data(app) {
  const cloud = app.backend.isCloud;
  const [est, legacy, localOrgs] = await Promise.all([app.repo.usage(), legacyCount(), cloud ? listLocalOrgs() : []]);
  const [patients, sessions] = await Promise.all([app.repo.patients.list({ includeArchived: true }), app.repo.sessions.list()]);
  const demoCount = patients.filter((p) => p.demo).length;
  const includeAudio = h('input', { type: 'checkbox', checked: true });
  const bar = h('span');
  const prog = h('div.progress.mt-2', { hidden: true }, bar);
  const expBtn = h('button.btn.btn-primary.btn-sm', { disabled: !app.can('export') }, icon('download', 14), 'Yedek indir (.zip)');
  expBtn.addEventListener('click', async () => {
    expBtn.disabled = true;
    prog.hidden = false;
    try {
      const { blob, manifest } = await exportBackup(app.repo, { includeAudio: includeAudio.checked, onProgress: (v) => { bar.style.width = `${v * 100}%`; } });
      download(blob, `MorphologAI_yedek_${app.ctx.org.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.zip`);
      toast(`Yedek hazır: ${manifest.counts.patients} danışan, ${manifest.counts.sessions} seans, ${manifest.counts.audio} ses (${fmtBytes(blob.size)}).`, 'success', 7000);
    } catch (err) { toast(`Yedek alınamadı: ${err.message}`, 'error'); }
    expBtn.disabled = false;
    prog.hidden = true;
  });
  const fileIn = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
  const impBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !app.can('session.write') }, icon('upload', 14), 'Yedekten geri yükle');
  impBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    prog.hidden = false;
    try {
      const r = await importBackup(app.repo, f, { onProgress: (v) => { bar.style.width = `${v * 100}%`; } });
      toast(`İçe aktarıldı: ${r.patients} danışan, ${r.sessions} seans, ${r.audio} ses (kaynak ekip: ${r.manifest.org.name})${r.skipped ? ` · ${r.skipped} seans zaten vardı` : ''}.`, 'success', 8000);
      app.refreshCounts();
    } catch (err) { toast(`Geri yüklenemedi: ${err.message}`, 'error'); }
    prog.hidden = true;
    fileIn.value = '';
  });
  const persistBtn = h('button.btn.btn-ghost.btn-sm', null, icon('shield', 14), 'Kalıcı depolama iste');
  persistBtn.addEventListener('click', async () => { const ok = await requestPersistence(); toast(ok ? 'Kalıcı depolama izni verildi.' : 'Tarayıcı izin vermedi (sık ziyaret edilen sitelere otomatik verilir).', ok ? 'success' : 'warning'); });
  const demoBtn = demoCount
    ? h('button.btn.btn-ghost.btn-sm', { on: { click: async () => { const n = await removeDemoData(app.repo); toast(`${n} örnek danışan silindi.`, 'success'); app.refreshCounts(); app.navigate('/ayarlar?tab=veri'); } } }, icon('trash', 14), `Örnek verileri sil (${demoCount})`)
    : h('button.btn.btn-ghost.btn-sm', { disabled: !app.can('session.write'), on: { click: async () => { await app.lexicon(); const c = await createDemoData(app.repo, app.settings); toast(`${c.length} örnek danışan eklendi.`, 'success'); app.refreshCounts(); app.navigate('/ayarlar?tab=veri'); } } }, icon('sparkles', 14), 'Örnek verileri ekle');
  const legacyBtn = legacy ? h('button.btn.btn-soft.btn-sm', { on: { click: async () => { await app.lexicon(); const n = await migrateLegacy(app.repo, app.settings); toast(`${n} eski seans aktarıldı.`, 'success'); app.refreshCounts(); app.navigate('/ayarlar?tab=veri'); } } }, icon('database', 14), `Eski sürümden ${legacy} seansı aktar`) : null;
  const wipe = h('button.btn.btn-danger.btn-sm', null, icon('trash', 14), 'Bu tarayıcıdaki tüm verileri sil');
  wipe.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Tüm yerel veriler silinsin mi?', message: 'Bu tarayıcıdaki TÜM hesaplar, ekipler, danışanlar, seanslar ve ses kayıtları kalıcı olarak silinir. Önce yedek almanız önerilir. Bu işlem geri alınamaz.', confirmText: 'Her şeyi sil', danger: true });
    if (!ok) return;
    await destroyDatabase();
    localStorage.clear();
    sessionStorage.clear();
    location.href = 'app.html';
  });
  const pct = est.quota ? (100 * est.usage) / est.quota : 0;
  const counts = h('div.small.muted.mt-2', null, `${patients.length} danışan · ${sessions.length} seans · ${sessions.filter((s) => s.audioId).length} ses kaydı`);
  const row = (k, v) => h('div.row.between.small', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } }, h('span.muted', null, k), h('b', null, v));

  const storageCard = cloud
    ? h('div.card', null, h('div.card-head', null, h('h2', null, icon('cloud', 18), 'Bulut veritabanı'), badge('Bağlı', 'ok', true)),
      h('div.card-body', null,
        row('Altyapı', 'Supabase (Postgres + Storage)'),
        row('Proje', app.backend.projectHost || '—'),
        row('Ekip', app.ctx.org.name),
        row('Bu ekibin ses verisi', fmtBytes(est.usage)),
        counts,
        h('p.tiny.muted.mt-2', null, 'Ücretsiz Supabase planı: 500 MB veritabanı ve 1 GB dosya deposu. 10 dakikalık kayıpsız (WAV) kayıt yaklaşık 55 MB tutar; büyük ekipler için Pro plan önerilir. Erişim satır düzeyi güvenlik kurallarıyla yalnızca ekip üyeleriyle sınırlıdır.')))
    : h('div.card', null, h('div.card-head', null, h('h2', null, icon('database', 18), 'Depolama (bu tarayıcı)')),
      h('div.card-body', null,
        h('div.row.between.small', null, h('span', null, `${fmtBytes(est.usage)} kullanılıyor`), h('span.muted', null, est.quota ? `${fmtBytes(est.quota)} kota` : '')),
        h('div.progress.mt-1', null, h('span', { style: { width: `${Math.max(1, Math.min(100, pct))}%` } })),
        h('div.small.mt-2', null, est.persisted ? badge('Kalıcı depolama etkin', 'ok', true) : badge('Kalıcı değil — tarayıcı yer açmak için silebilir', 'warn', true)),
        counts,
        h('div.row.mt-2', null, persistBtn),
        h('div.callout.info.mt-3', null, icon('cloud', 18), h('div', null, h('b', null, 'Bulut veritabanı bağlı değil. '),
          'Ekip arkadaşlarınızla farklı cihazlardan ortak çalışmak için Supabase bağlayın (DEPLOY.md → "Supabase"). Bağlandıktan sonra buradaki veriler tek tıkla buluta aktarılabilir.'))));

  // Bulut modu: bu tarayıcıdaki yerel ekip verilerini aktar
  let migrateCard = null;
  if (cloud && localOrgs.length) {
    const mprog = h('span');
    const mbar = h('div.progress.mt-2', { hidden: true }, mprog);
    const mlabel = h('div.tiny.muted');
    const rows = localOrgs.map((o) => {
      const btn = h('button.btn.btn-soft.btn-sm', { disabled: !app.can('session.write') }, icon('upload', 14), 'Buluta aktar');
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Yerel veriler buluta aktarılsın mı?',
          message: `"${o.name}" (bu tarayıcı) ekibindeki ${o.patients} danışan, ${o.sessions} seans ve ${o.audio} ses kaydı, bulut ekibiniz "${app.ctx.org.name}" içine kopyalanacak. Yerel veriler silinmez. Aynı kayıtlar ikinci kez aktarılmaz.`,
          confirmText: 'Aktar',
        });
        if (!ok) return;
        btn.disabled = true;
        mbar.hidden = false;
        try {
          const r = await copyLocalToCloud(app.repo, o.id, { onProgress: (v, t) => { mprog.style.width = `${v * 100}%`; if (t) mlabel.textContent = t; } });
          toast(`Buluta aktarıldı: ${r.patients} danışan, ${r.sessions} seans, ${r.audio} ses kaydı${r.skipped ? ` (${r.skipped} seans zaten vardı)` : ''}.`, 'success', 8000);
          app.refreshCounts();
        } catch (err) {
          toast(`Aktarılamadı: ${err.message}`, 'error', 8000);
        }
        btn.disabled = false;
        mbar.hidden = true;
        mlabel.textContent = '';
      });
      return h('div.row.between', { style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } },
        h('div', null, h('b', null, o.name), o.demoOnly ? h('span.badge', { style: { marginLeft: '6px' } }, 'yalnız örnek veri') : null,
          h('div.tiny.muted', null, `${o.patients} danışan · ${o.sessions} seans · ${o.audio} ses kaydı`)), btn);
    });
    migrateCard = h('div.card', null, h('div.card-head', null, h('h2', null, icon('hardDrive', 18), 'Bu tarayıcıdaki yerel veriler')),
      h('div.card-body', null,
        h('p.small.muted', null, 'Bulut bağlanmadan önce bu tarayıcıda oluşturduğunuz ekipler aşağıda. Aktarım, aktif bulut ekibine kopyalar; önce doğru ekibin seçili olduğundan emin olun.'),
        ...rows, mbar, mlabel));
  }

  return h('div.stack', null,
    h('div.grid.grid-2', null,
      h('div.card', null, h('div.card-head', null, h('h2', null, icon('download', 18), 'Yedekleme')),
        h('div.card-body', null,
          h('p.small.muted', null, `Aktif ekibin (${app.ctx.org.name}) tüm danışanları, seansları, ses kayıtları ve sözlüğü tek bir ZIP dosyasına yazılır. Parolalar yedeğe yazılmaz. ${cloud ? 'Bulut verilerinin ayrıca yerel bir kopyasını tutmak için düzenli yedek almanız önerilir.' : 'Başka bir bilgisayara taşımak ya da ekip arkadaşınızla paylaşmak için de kullanılır.'}`),
          h('label.check.mt-2', null, includeAudio, 'Ses kayıtlarını dahil et'),
          h('div.row.mt-2', null, expBtn, impBtn, fileIn), prog)),
      storageCard),
    migrateCard,
    h('div.card', null, h('div.card-head', null, h('h2', null, icon('sparkles', 18), 'Örnek veriler ve eski sürüm')),
      h('div.card-body', null, h('p.small.muted', null, 'Örnek veriler uygulamayı tanımak içindir: kurgusal kontrol, akıcı olmayan, anomik, parafazili ve kekemelik örnekleri. Araştırmada kullanılmamalıdır.'),
        h('div.row.mt-2', null, demoBtn, legacyBtn))),
    cloud ? null : h('div.card', { style: { borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--border))' } }, h('div.card-head', null, h('h2', null, icon('alert', 18), 'Tehlikeli bölge')),
      h('div.card-body', null, h('p.small.muted', null, 'Bu tarayıcıdaki MorphologAI veritabanını tamamen siler. Diğer bilgisayarlardaki ve yedek dosyalarındaki veriler etkilenmez.'), h('div.row.mt-2', null, wipe))));
}
