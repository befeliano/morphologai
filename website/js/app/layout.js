/** Uygulama kabuğu: kenar menü + üst çubuk + içerik alanı. */
import { h, mount, icon, initials, popover, closePopovers, modal, field, toast } from './ui/dom.js';
import { ROLES, createOrg } from '../data/auth.js';

const NAV = [
  { group: 'Çalışma alanı' },
  { id: 'dashboard', label: 'Genel bakış', icon: 'dashboard', href: '#/' },
  { id: 'patients', label: 'Danışanlar', icon: 'users', href: '#/danisanlar', count: 'patients' },
  { id: 'sessions', label: 'Geçmiş seanslar', icon: 'folder', href: '#/seanslar', count: 'sessions' },
  { id: 'analytics', label: 'Analiz', icon: 'pieChart', href: '#/analiz' },
  { id: 'study', label: 'Öngörü çalışması', icon: 'target', href: '#/ongoru' },
  { group: 'Ekip' },
  { id: 'team', label: 'Ekip ve üyeler', icon: 'team', href: '#/ekip' },
  { id: 'settings', label: 'Ayarlar', icon: 'settings', href: '#/ayarlar' },
  { group: 'Kaynaklar' },
  { id: 'methods', label: 'Yöntem ve ölçütler', icon: 'book', href: '#/yontem' },
];

export function brandMark(size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.innerHTML = '<path d="M4 12h2M8 7v10M12 4v16M16 8v8M20 11v2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
  return s;
}

export function renderShell(root, app) {
  const { user, org, member } = app.ctx;
  const counts = {};
  const navEls = {};
  const nav = h('nav.nav', { 'aria-label': 'Ana menü' });
  nav.appendChild(h('a.nav-cta', { href: '#/seans/yeni', on: { click: () => shell.classList.remove('nav-open') } }, icon('plus', 18), 'Yeni seans başlat'));
  for (const item of NAV) {
    if (item.group) { nav.appendChild(h('div.nav-label', null, item.group)); continue; }
    const c = item.count ? h('span.count', null, '') : null;
    if (c) counts[item.count] = c;
    const a = h('a', { href: item.href, on: { click: () => shell.classList.remove('nav-open') } }, icon(item.icon, 18), item.label, c);
    navEls[item.id] = a;
    nav.appendChild(a);
  }

  const orgBtn = h('button.org-switch', { type: 'button', 'aria-label': 'Ekip değiştir' },
    h('span.org-ic', null, icon('team', 16)),
    h('div', null, h('div.org-name', null, org ? org.name : 'Ekip yok'), h('div.org-role', null, member ? ROLES[member.role]?.label : '—')),
    icon('chevronDown', 16));
  orgBtn.addEventListener('click', () => {
    const list = h('div', null,
      h('div.tiny.muted', { style: { fontWeight: 600, marginBottom: '6px' } }, 'EKİPLERİM'),
      ...app.ctx.orgs.map((o) => {
        const m = app.ctx.memberships.find((x) => x.orgId === o.id);
        return h('button.alt-item', { style: { width: '100%' }, on: { click: () => { closePopovers(); if (o.id !== org?.id) app.switchOrg(o.id); } } },
          h('div', { style: { textAlign: 'left' } }, h('b', null, o.name), h('div.tiny.muted', null, ROLES[m?.role]?.label || '')),
          o.id === org?.id ? icon('check', 16) : null);
      }),
      h('button.btn.btn-soft.btn-sm', { style: { width: '100%', marginTop: '10px' }, on: { click: () => { closePopovers(); newOrgDialog(app); } } }, icon('plus', 15), 'Yeni ekip oluştur'));
    popover(orgBtn, list, { width: 280 });
  });

  const themeBtn = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Tema değiştir', 'aria-label': 'Tema değiştir' }, icon(app.theme() === 'dark' ? 'sun' : 'moon', 16));
  themeBtn.addEventListener('click', () => { const t = app.toggleTheme(); mount(themeBtn, icon(t === 'dark' ? 'sun' : 'moon', 16)); });
  const logoutBtn = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Çıkış yap', 'aria-label': 'Çıkış yap', on: { click: () => app.logout() } }, icon('logout', 16));

  const sidebar = h('aside.sidebar', null,
    h('a.brand', { href: '#/', style: { textDecoration: 'none' } }, h('span.brand-mark', null, brandMark(20)),
      h('div', null, 'MorphologAI', h('small', null, 'Klinik konuşma ve dil analizi'))),
    orgBtn,
    nav,
    h('div.sidebar-foot', null,
      h('a.data-mode', { href: '#/ayarlar?tab=veri', title: app.backend.isCloud ? `Supabase · ${app.backend.projectHost}` : 'Veriler yalnızca bu tarayıcıda' },
        h(`span.dot${app.backend.isCloud ? '.on' : ''}`), icon(app.backend.isCloud ? 'cloud' : 'hardDrive', 14),
        app.backend.isCloud ? 'Bulut veritabanı' : 'Yerel veritabanı'),
      h('div.user-card', null,
        h('div.avatar', null, initials(user.name)),
        h('div.who', null, h('b', null, `${user.title ? user.title + ' ' : ''}${user.name}`), h('span', null, user.email)),
        h('div.foot-actions', null, themeBtn, logoutBtn))));

  const crumbs = h('div.crumbs');
  const actions = h('div.row');
  const menuBtn = h('button.btn.btn-ghost.btn-icon.btn-sm.menu-btn', { 'aria-label': 'Menü', on: { click: () => shell.classList.toggle('nav-open') } }, icon('menu', 18));
  const topbar = h('header.topbar', null, menuBtn, crumbs, h('div.spacer'), actions);
  const outlet = h('div.content', { id: 'outlet' });
  const main = h('main.main', null, topbar, outlet);
  const shell = h('div.shell', null, sidebar, main);
  shell.addEventListener('click', (e) => { if (shell.classList.contains('nav-open') && e.target === shell) shell.classList.remove('nav-open'); });
  mount(root, h('div.bg-blobs', null, h('span.b1'), h('span.b2'), h('span.b3')), shell);

  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });

  const api = {
    outlet,
    navEls,
    setCrumbs(items) {
      mount(crumbs, ...items.flatMap((it, i) => {
        const node = it.href ? h('a', { href: it.href }, it.label) : h('b', null, it.label);
        return i ? [icon('chevronRight', 14), node] : [node];
      }));
      document.title = `${items.length ? items[items.length - 1].label + ' · ' : ''}MorphologAI`;
    },
    setActions(nodes) { mount(actions, ...(nodes || [])); },
    async refreshCounts() {
      if (!app.repo) return;
      const [p, s] = await Promise.all([app.repo.patients.list(), app.repo.sessions.list()]);
      counts.patients.textContent = p.length || '';
      counts.sessions.textContent = s.length || '';
    },
  };
  api.refreshCounts();
  return api;
}

export function updateShellActive(api, id) {
  if (!api) return;
  for (const [k, el] of Object.entries(api.navEls)) el.classList.toggle('active', k === id);
}

export function newOrgDialog(app) {
  const name = h('input.input', { placeholder: 'ör. Ankara Afazi Araştırma Grubu' });
  modal({
    title: 'Yeni ekip oluştur',
    body: h('div.stack', null,
      h('p.muted.small', null, 'Her ekibin danışanları, seansları ve sözlüğü ayrıdır. Siz bu ekibin sahibi olursunuz; daha sonra üye ekleyebilirsiniz.'),
      field('Ekip adı', name)),
    actions: [
      { label: 'Vazgeç' },
      {
        label: 'Oluştur', variant: 'btn-primary', icon: 'plus',
        onClick: async () => {
          if (!name.value.trim()) { toast('Ekip adı girin.', 'warning'); return false; }
          const { org } = await createOrg(name.value, app.ctx.user.id, app.ctx.user.email);
          await app.switchOrg(org.id);
          return true;
        },
      },
    ],
  });
}
