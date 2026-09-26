/** Ekip ve üyeler: ekip bilgisi, üye ekleme/davet, roller, ekip değiştirme, işlem günlüğü. */
import { h, mount, icon, badge, modal, field, select, toast, confirmDialog, initials, relTime, fmtDateTime, emptyState } from '../ui/dom.js';
import { ROLES, addMember, setMemberRole, removeMember, listMembers, updateOrg } from '../../data/auth.js';
import { tempPassword } from '../../data/crypto.js';
import { newOrgDialog } from '../layout.js';

const ACTION_TR = {
  'org.create': 'ekibi oluşturdu', 'org.update': 'ekip ayarlarını güncelledi', 'member.add': 'üye ekledi', 'member.role': 'rol değiştirdi',
  'member.remove': 'üyeyi çıkardı', 'member.join': 'ekibe katıldı', 'auth.login': 'giriş yaptı', 'patient.create': 'danışan ekledi',
  'patient.update': 'danışanı güncelledi', 'patient.delete': 'danışanı sildi', 'session.create': 'seans oluşturdu', 'session.update': 'seansı güncelledi',
  'session.delete': 'seansı sildi', 'lexicon.save': 'ekip sözlüğüne sözcük ekledi',
};

function roleRows() {
  const matrix = [['viewer', true, false, false, false], ['clinician', true, true, false, false], ['admin', true, true, true, true], ['owner', true, true, true, true]];
  return matrix.map(([r, ...perms]) => {
    const cells = perms.map((v) => h('td', null, v ? h('span', { style: { color: 'var(--accent-600)' } }, icon('check', 16)) : h('span.faint', null, '—')));
    return h('tr', null, h('td', null, h('b', null, ROLES[r].label), h('div.tiny.muted', null, ROLES[r].description)), ...cells);
  });
}

export async function render(root, { query }, app) {
  app.setCrumbs([{ label: 'Ekip ve üyeler' }]);
  if (!app.ctx.org) {
    mount(root, h('div', { style: { maxWidth: '560px', margin: '40px auto' } }, h('div.card', null, h('div.card-body', null,
      emptyState({ icon: 'team', title: 'Henüz bir ekibe üye değilsiniz', text: 'Yeni bir ekip oluşturun ya da ekip yöneticinizden sizi e-posta adresinizle eklemesini isteyin.', action: h('button.btn.btn-primary', { on: { click: () => newOrgDialog(app) } }, icon('plus', 16), 'Ekip oluştur') })))));
    return;
  }
  const { org, member, user } = app.ctx;
  const cloud = app.backend.isCloud;
  const canManage = app.can('member.manage');
  const [members, log] = await Promise.all([listMembers(org.id), app.repo.audit.list(60)]);
  const usersById = new Map(members.filter((m) => m.user).map((m) => [m.userId, m.user]));

  const addBtn = h('button.btn.btn-primary.btn-sm', { disabled: !canManage }, icon('userPlus', 15), 'Üye ekle');
  addBtn.addEventListener('click', () => openAdd());
  app.setActions([h('button.btn.btn-ghost.btn-sm', { on: { click: () => newOrgDialog(app) } }, icon('plus', 15), 'Yeni ekip'), addBtn]);

  const signupUrl = `${location.origin}${location.pathname}#/kayit`;
  const copyLink = () => {
    navigator.clipboard?.writeText(signupUrl).then(() => toast('Kayıt bağlantısı kopyalandı.', 'success'), () => toast(signupUrl, 'info', 10000));
  };

  function openAdd() {
    const email = h('input.input', { type: 'email', placeholder: 'ad.soyad@ornek.com' });
    const name = h('input.input', { placeholder: 'Ad Soyad' });
    const role = select(Object.entries(ROLES).filter(([k]) => k !== 'owner' || member.role === 'owner').map(([id, r]) => ({ id, label: r.label })), 'clinician');
    const create = h('input', { type: 'checkbox', checked: !cloud });
    const pw = h('input.input', { value: tempPassword(), style: { fontFamily: 'var(--mono)' } });
    const pwWrap = h('div', null, field('Geçici parola', pw, 'Üyeye iletin; ilk girişte Ayarlar → Profil\'den değiştirmesi önerilir.'));
    create.addEventListener('change', () => { pwWrap.hidden = !create.checked; });
    const info = cloud
      ? h('div.callout.info', null, icon('cloud', 18), h('div', null,
        h('b', null, 'Ekip verileri bulutta ortaktır. '), 'Kişinin MorphologAI hesabı varsa hemen ekibe eklenir. Hesabı yoksa davet oluşturulur; bu e-postayla kayıt olup e-postasını doğruladığında ekibe otomatik katılır. Uygulama e-posta göndermez, kayıt bağlantısını kendiniz iletin.',
        h('div.row.mt-2', null, h('code.mono.small', { style: { wordBreak: 'break-all' } }, signupUrl), h('button.btn.btn-soft.btn-sm', { type: 'button', on: { click: copyLink } }, icon('copy', 14), 'Kopyala'))))
      : h('div.callout.info', null, icon('info', 18), h('div', null,
        h('b', null, 'Yerel modda veriler bu tarayıcıda tutulur. '), 'Eklenen üye bu bilgisayardaki MorphologAI\'ye kendi hesabıyla giriş yapıp aynı ekip verileriyle çalışır. Farklı bilgisayarlar arasında ortak çalışma için bulut veritabanını (Supabase) bağlayın; bkz. DEPLOY.md.'));
    modal({
      title: 'Ekibe üye ekle',
      body: h('div.stack', null,
        info,
        h('div.form-grid', null, field('E-posta', email), cloud ? null : field('Ad Soyad', name), field('Rol', role, ROLES[role.value]?.description)),
        cloud ? null : h('label.check', null, create, h('span', null, h('b', null, 'Bu cihazda hesabını oluştur'), h('span.muted', null, ' — işaretlemezseniz davet oluşturulur; kişi bu e-postayla kayıt olduğunda ekibe otomatik katılır.'))),
        cloud ? null : pwWrap),
      actions: [
        { label: 'Vazgeç' },
        {
          label: 'Ekle', variant: 'btn-primary', icon: 'userPlus', onClick: async () => {
            const withAccount = !cloud && create.checked;
            const m = await addMember(app.ctx, { email: email.value, role: role.value, name: name.value, password: withAccount ? pw.value : null });
            toast(m.status === 'active' ? `${email.value} ekibe eklendi.` : `${email.value} için davet oluşturuldu.${cloud ? ' Kayıt bağlantısını kişiye iletin.' : ''}`, 'success', 7000);
            if (withAccount) {
              modal({ title: 'Giriş bilgileri', body: h('div.stack', null, h('p.small.muted', null, 'Bu bilgileri üyeye güvenli bir yoldan iletin:'),
                h('div.hint-card', null, 'E-posta: ', h('b', null, email.value.trim().toLocaleLowerCase('tr-TR')), h('br'), 'Parola: ', h('b', null, pw.value))), actions: [{ label: 'Tamam', variant: 'btn-primary' }] });
            }
            render(root, { query: {} }, app);
          },
        },
      ],
    });
    role.addEventListener('change', () => {
      const help = role.closest('.field')?.querySelector('.help');
      if (help) help.textContent = ROLES[role.value]?.description || '';
    });
  }

  const orgName = h('input.input', { value: org.name, disabled: !app.can('org.manage') });
  const saveOrg = h('button.btn.btn-soft.btn-sm', { disabled: !app.can('org.manage') }, icon('save', 14), 'Kaydet');
  saveOrg.addEventListener('click', async () => {
    if (!orgName.value.trim()) return;
    await updateOrg(app.ctx, { name: orgName.value.trim() });
    await app.refreshContext();
    toast('Ekip adı güncellendi.', 'success');
    app.navigate('/ekip');
    location.reload();
  });

  const rows = members.map((m) => {
    const isMe = m.userId === user.id;
    const roleSel = select(Object.entries(ROLES).map(([id, r]) => ({ id, label: r.label })), m.role, { disabled: !canManage || isMe || (m.role === 'owner' && member.role !== 'owner'), style: { height: '34px', width: '200px' } });
    roleSel.addEventListener('change', async () => {
      try { await setMemberRole(app.ctx, m.id, roleSel.value); toast('Rol güncellendi.', 'success'); } catch (err) { toast(err.message, 'error'); roleSel.value = m.role; }
    });
    const rm = h('button.btn.btn-text.btn-sm', { disabled: !canManage || isMe, style: { color: 'var(--danger)' } }, icon('trash', 14));
    rm.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Üye çıkarılsın mı?', message: `${m.user?.name || m.email} ekipten çıkarılacak. Hesabı silinmez; ekip verilerine erişimi kalkar.`, confirmText: 'Çıkar', danger: true }))) return;
      try { await removeMember(app.ctx, m.id); toast('Üye çıkarıldı.', 'success'); render(root, { query: {} }, app); } catch (err) { toast(err.message, 'error'); }
    });
    return h('tr', null,
      h('td', null, h('div.row', { style: { flexWrap: 'nowrap' } }, h('div.avatar', { style: { width: '34px', height: '34px' } }, initials(m.user?.name || m.email)),
        h('div', null, h('div.strong', null, `${m.user?.title ? m.user.title + ' ' : ''}${m.user?.name || '—'}`, isMe ? h('span.badge.info', { style: { marginLeft: '6px' } }, 'siz') : null), h('div.tiny.muted', null, m.email)))),
      h('td', null, roleSel),
      h('td', null, m.status === 'active' ? badge('Etkin', 'ok', true) : badge('Davet bekliyor', 'warn', true)),
      h('td.small.muted', null, m.user?.lastLoginAt ? relTime(m.user.lastLoginAt) : '—'),
      h('td', { style: { textAlign: 'right' } }, rm));
  });

  const logRows = log.map((e) => {
    const who = usersById.get(e.userId);
    const detail = e.detail?.email || e.detail?.code || e.detail?.name || e.detail?.word || '';
    return h('div.row', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap', alignItems: 'flex-start' } },
      h('div.avatar', { style: { width: '28px', height: '28px', fontSize: '10.5px' } }, initials(who?.name || '?')),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('div.small', null, h('b', null, who?.name || 'Kullanıcı'), ' ', ACTION_TR[e.action] || e.action, detail ? h('span.muted', null, ` · ${detail}`) : null),
        h('div.tiny.faint', null, fmtDateTime(e.at))));
  });

  mount(root,
    h('div.page-head', null, h('div', null, h('div.eyebrow', null, icon('team', 14), 'Çok kiracılı çalışma alanı'), h('h1', null, org.name),
      h('p', null, 'Her ekibin danışanları, seansları, sözlüğü ve ayarları birbirinden ayrıdır. Üyeler rollerine göre görüntüler, düzenler ya da yönetir.'))),
    h('div.grid.grid-main', null,
      h('div.stack', null,
        h('div.card', null, h('div.card-head', null, h('h2', null, icon('users', 18), `Üyeler (${members.length})`)),
          h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table', null,
            h('thead', null, h('tr', null, h('th', null, 'Üye'), h('th', null, 'Rol'), h('th', null, 'Durum'), h('th', null, 'Son giriş'), h('th'))),
            h('tbody', null, rows))))),
        h('div.card', null, h('div.card-head', null, h('h2', null, icon('shield', 18), 'Roller ve yetkiler')),
          h('div.card-body', null, h('div.table-wrap', null, h('table.table', null,
            h('thead', null, h('tr', null, h('th', null, 'Rol'), h('th', null, 'Görüntüleme'), h('th', null, 'Danışan / seans'), h('th', null, 'Üye yönetimi'), h('th', null, 'Ekip ayarları'))),
            h('tbody', null, roleRows())))))),
      h('div.stack', null,
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('settings', 17), 'Ekip bilgisi')),
          h('div.card-body', null, field('Ekip adı', orgName), h('div.row.mt-2', null, saveOrg),
            h('div.divider'),
            h('div.small.muted', null, `Oluşturulma: ${fmtDateTime(org.createdAt)}`, h('br'), `Rolünüz: ${ROLES[member.role]?.label}`),
            app.ctx.orgs.length > 1 ? h('div.mt-2', null, h('div.tiny.muted', { style: { fontWeight: 600, marginBottom: '6px' } }, 'DİĞER EKİPLERİNİZ'),
              ...app.ctx.orgs.filter((o) => o.id !== org.id).map((o) => h('button.alt-item', { style: { width: '100%' }, on: { click: () => app.switchOrg(o.id) } }, h('b', null, o.name), icon('arrowRight', 15)))) : null)),
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('clock', 17), 'Son etkinlikler')),
          h('div.card-body', { style: { maxHeight: '520px', overflowY: 'auto' } }, logRows.length ? logRows : h('p.small.muted', null, 'Henüz etkinlik yok.'))))));
  if (query.add && canManage) openAdd();
}
