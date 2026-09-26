/** Genel bakış paneli. */
import { h, mount, icon, num, fmtDur, fmtBytes, toast, emptyState, badge, initials } from '../ui/dom.js';
import { MODULES } from '../constants.js';
import { sessionTable, sessionDuration } from '../components/sessionTable.js';
import { legacyCount, migrateLegacy } from '../../data/backup.js';
import { createDemoData } from '../../data/demo.js';
import { listMembers } from '../../data/auth.js';

const isSafari = () => /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);

function greeting() {
  const hr = new Date().getHours();
  return hr < 6 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
}

export async function render(root, _p, app) {
  const { user, org } = app.ctx;
  app.setCrumbs([{ label: 'Genel bakış' }]);
  app.setActions([
    h('a.btn.btn-ghost.btn-sm', { href: '#/seans/yeni?mode=upload' }, icon('upload', 15), 'Ses yükle'),
    h('a.btn.btn-primary.btn-sm', { href: '#/seans/yeni?mode=live' }, icon('mic', 15), 'Canlı seans'),
  ]);

  const [patients, sessions, legacy, storage, members] = await Promise.all([
    app.repo.patients.list(), app.repo.sessions.list(), legacyCount(), app.repo.usage(), listMembers(org.id),
  ]);
  const byId = new Map(patients.map((p) => [p.id, p]));
  const now = new Date();
  const thisMonth = sessions.filter((s) => { const d = new Date(s.recordedAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const totalSec = sessions.reduce((t, s) => t + (sessionDuration(s) || 0), 0);
  const withAudio = sessions.filter((s) => s.audioId).length;

  const callouts = [];
  if (user.defaultPassword) {
    callouts.push(h('div.callout.warn', null, icon('lock', 18), h('div', null,
      h('b', null, 'Varsayılan parola kullanılıyor. '), 'Güvenliğiniz için ', h('a', { href: '#/ayarlar?tab=profil' }, 'Ayarlar → Profil'), ' bölümünden parolanızı değiştirin.')));
  }
  if (legacy > 0 && app.can('session.write')) {
    const btn = h('button.btn.btn-soft.btn-sm', null, icon('database', 15), `${legacy} seansı aktar`);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await app.lexicon();
      const n = await migrateLegacy(app.repo, app.settings);
      toast(`${n} eski seans aktarıldı.`, 'success');
      app.refreshCounts();
      app.navigate('/seanslar');
    });
    callouts.push(h('div.callout.info', null, icon('database', 18), h('div', { style: { flex: 1 } },
      h('b', null, 'Eski sürümden kayıtlar bulundu. '), `Bu tarayıcıdaki önceki MorphologAI sürümünde ${legacy} seans var. Ekibinize aktarabilirsiniz (ses kayıtları dahil).`), btn));
  }

  const stat = (ic, tone, label, value, hint) => h('div.card.stat', null, h(`div.ic.${tone}`, null, icon(ic, 20)),
    h('div', null, h('div.label', null, label), h('div.value', null, value), hint ? h('div.hint', null, hint) : null));

  const modCards = MODULES.map((m) => {
    const n = sessions.filter((s) => (s.module || 'aphasia') === m.id).length;
    return h('a.choice', { href: `#/seans/yeni?module=${m.id}`, style: { textDecoration: 'none', color: 'inherit' } },
      h('div.row.between', null, h(`div.c-ic.ic.${m.tone}`, null, icon(m.icon, 22)), badge(`${n} seans`, 'outline')),
      h('h4', null, m.label),
      h('p', null, m.description),
      h('span.btn.btn-text.btn-sm', { style: { alignSelf: 'flex-start', marginLeft: '-8px' } }, 'Seans başlat', icon('arrowRight', 15)));
  });

  let recent;
  if (!sessions.length) {
    const demoBtn = h('button.btn.btn-ghost', null, icon('sparkles', 16), 'Örnek verilerle dene');
    demoBtn.addEventListener('click', async () => {
      demoBtn.disabled = true;
      await app.lexicon();
      const created = await createDemoData(app.repo, app.settings);
      toast(`${created.length} örnek danışan ve seanslarını içeren veri eklendi (Ayarlar → Veri'den silebilirsiniz).`, 'success', 6000);
      app.refreshCounts();
      render(root, _p, app);
    });
    recent = emptyState({
      icon: 'mic', title: 'Henüz seans yok',
      text: 'İlk seansınızı canlı kayıtla başlatın, profesyonel mikrofonla aldığınız bir ses dosyasını yükleyin ya da bir transkripti yapıştırın.',
      action: h('div.row', { style: { justifyContent: 'center' } }, h('a.btn.btn-primary', { href: '#/seans/yeni' }, icon('plus', 16), 'Yeni seans'), app.can('session.write') ? demoBtn : null),
    });
  } else {
    recent = sessionTable(sessions.slice(0, 8), byId);
  }

  const pctUsed = storage.quota ? (100 * storage.usage) / storage.quota : 0;
  mount(root,
    h('div.page-head', null,
      h('div', null,
        h('div.eyebrow', null, icon('sparkles', 14), org.name),
        h('h1', null, `${greeting()}, ${user.title ? user.title + ' ' : ''}${user.name.split(' ')[0]}`),
        h('p', null, new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · Seanslarınız, danışanlarınız ve ekip çalışmanız tek bakışta.'))),
    callouts.length ? h('div.stack', { style: { marginBottom: '18px', gap: '10px' } }, callouts) : null,
    h('div.stats', null,
      stat('users', 'indigo', 'Danışan', num(patients.length, 0), `${patients.filter((p) => p.group === 'control').length} kontrol grubu`),
      stat('folder', 'teal', 'Toplam seans', num(sessions.length, 0), `${withAudio} ses kaydıyla`),
      stat('calendar', 'coral', 'Bu ay', num(thisMonth.length, 0), 'seans'),
      stat('clock', 'lavender', 'Kayıt süresi', fmtDur(totalSec), 'toplam ses')),
    h('div.grid.grid-main.mt-3', null,
      h('div.stack', null,
        h('div.card', null,
          h('div.card-head', null, h('h2', null, icon('folder', 18), 'Son seanslar'), sessions.length ? h('a.btn.btn-text.btn-sm', { href: '#/seanslar' }, 'Tümü', icon('arrowRight', 14)) : null),
          h('div.card-body.tight', null, recent)),
        h('div', null,
          h('div.row.between', { style: { margin: '6px 2px 12px' } }, h('h2', { style: { fontSize: '16px', fontWeight: 600 } }, 'Klinik modüller'), h('span.small.muted', null, 'Her modülün kendi görevleri ve ölçütleri vardır')),
          h('div.choice-grid', { style: { gridTemplateColumns: 'repeat(2, minmax(0,1fr))' } }, modCards))),
      h('div.stack', null,
        h('div.card', null,
          h('div.card-head', null, h('h3', null, icon('team', 17), 'Ekibiniz'), h('a.btn.btn-text.btn-sm', { href: '#/ekip' }, 'Yönet')),
          h('div.card-body', null,
            h('div.stack', { style: { gap: '10px' } }, members.slice(0, 6).map((m) => h('div.row', null,
              h('div.avatar', { style: { width: '30px', height: '30px', fontSize: '11px' } }, initials(m.user?.name || m.email)),
              h('div', { style: { minWidth: 0, flex: 1 } }, h('div.strong.small', null, m.user?.name || m.email), h('div.tiny.muted', null, m.status === 'invited' ? 'Davet bekliyor' : m.email)),
              badge(m.role === 'owner' ? 'Sahip' : m.role === 'admin' ? 'Yönetici' : m.role === 'viewer' ? 'Gözlemci' : 'Klinisyen', m.role === 'owner' ? 'info' : '')))),
            app.can('member.manage') ? h('a.btn.btn-soft.btn-sm', { href: '#/ekip?add=1', style: { marginTop: '14px', width: '100%' } }, icon('userPlus', 15), 'Üye ekle') : null)),
        storage.kind === 'cloud'
          ? h('div.card', null,
            h('div.card-head', null, h('h3', null, icon('cloud', 17), 'Bulut veritabanı'), badge('Bağlı', 'ok', true)),
            h('div.card-body', null,
              h('div.small', null, 'Ekip verileri Supabase\'te; aynı hesapla her cihazdan erişilir.'),
              h('div.row.between.small.mt-2', null, h('span.muted', null, 'Ses verisi'), h('b', null, fmtBytes(storage.usage))),
              h('div.tiny.faint.mt-1', null, app.backend.projectHost),
              h('a.btn.btn-ghost.btn-sm.mt-2', { href: '#/ayarlar?tab=veri' }, icon('download', 15), 'Yedek al')))
          : h('div.card', null,
            h('div.card-head', null, h('h3', null, icon('database', 17), 'Yerel depolama')),
            h('div.card-body', null,
              h('div.row.between.small', null, h('span', null, fmtBytes(storage.usage), ' kullanılıyor'), h('span.muted', null, storage.quota ? `${fmtBytes(storage.quota)} kota` : '')),
              h('div.progress.mt-1', null, h('span', { style: { width: `${Math.max(1, Math.min(100, pctUsed))}%` } })),
              h('div.small.muted.mt-2', null, storage.persisted ? '✓ Kalıcı depolama izni verildi.' : 'Tarayıcı, disk dolduğunda verileri silebilir. Düzenli yedek alın.'),
              isSafari() ? h('div.callout.warn.mt-2', null, icon('alert', 16), h('div.small', null, h('b', null, 'Safari kullanıyorsunuz. '), 'Safari, 7 gün açılmayan sitelerin tarayıcı verilerini silebilir. Verileri korumak için bulut veritabanını kullanın ya da Safari menüsünden Dosya → Dock\'a Ekle ile uygulamayı ekleyin ve düzenli yedek alın.')) : null,
              h('a.btn.btn-ghost.btn-sm.mt-2', { href: '#/ayarlar?tab=veri' }, icon('download', 15), 'Yedek al'))),
        h('div.card', null,
          h('div.card-head', null, h('h3', null, icon('info', 17), 'İpuçları')),
          h('div.card-body.small', null,
            h('ul', { style: { paddingLeft: '18px', display: 'grid', gap: '8px', color: 'var(--text-2)' } },
              h('li', null, 'Canlı kayıtta ses ', h('b', null, 'kayıpsız WAV'), ' olarak saklanır; transkript sonradan düzeltilebilir.'),
              h('li', null, 'Transkriptte ', h('code.mono', null, 'T:'), ' ile başlayan satırlar terapist sözcesidir ve ölçütlere katılmaz.'),
              h('li', null, 'Parafazileri ', h('code.mono', null, 'kelime [* p]'), ' biçiminde kodlayın; tarama göstergesi bunları kullanır.'),
              h('li', null, 'Kontrol grubu danışanlarının seanslarıyla ekibinize özel norm oluşur.')))))));
}
