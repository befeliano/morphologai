/**
 * Yerel kimlik doğrulama ve ekip üyeliği (bulut bağlantısı yokken)
 * ================================================================
 * Hesaplar bu tarayıcının veritabanında tutulur; parolalar PBKDF2 (210.000 tur) ile özetlenir.
 * Bu, paylaşılan bir cihazda kullanıcıları birbirinden ayırır; ancak cihaza erişimi olan
 * birine karşı gerçek bir güvenlik sınırı değildir (tarayıcı verisi cihazda şifresiz durur).
 * Bulut modunda bunun yerine auth.cloud.js (Supabase Auth) kullanılır.
 */
import * as db from './db.js';
import { uuid, hashPassword, verifyPassword } from './crypto.js';
import { ROLES, can, defaultOrgSettings, normalizeOrgSettings, normEmail } from './roles.js';

const AUTH_KEY = 'morphologai.auth.v5';

export const DEFAULT_ACCOUNT = {
  email: 'sevval@morphologai.local',
  password: 'Morpholog2026!',
  name: 'Şevval Şahin',
  title: 'Dkt.',
  orgName: 'Şevval Şahin Ekibi',
};

/** Eski sürümlerde oluşturulan varsayılan ekip adı (kurum/klinik izlenimi vermemesi için yeniden adlandırılır). */
const LEGACY_ORG_NAMES = ['Şevval Şahin Klinik Ekibi'];

// ---------------------------------------------------------------------------
export async function audit(orgId, userId, action, detail = {}) {
  await db.put('audit', { id: uuid(), orgId, userId, action, detail, at: new Date().toISOString() });
}

export async function createOrg(name, ownerUserId, ownerEmail) {
  const org = { id: uuid(), name: name.trim() || 'Yeni ekip', createdAt: new Date().toISOString(), createdBy: ownerUserId, settings: defaultOrgSettings() };
  const member = { id: uuid(), orgId: org.id, userId: ownerUserId, email: ownerEmail, role: 'owner', status: 'active', createdAt: org.createdAt };
  await db.batch([{ op: 'put', store: 'orgs', value: org }, { op: 'put', store: 'members', value: member }]);
  await audit(org.id, ownerUserId, 'org.create', { name: org.name });
  return { org, member };
}

/** E-postayla hesap bulur (eski sürümün Türkçe küçük harf biçimini de dener). */
async function findUser(email) {
  const e = normEmail(email);
  const [u] = await db.byIndex('users', 'email', e);
  if (u) return u;
  const legacy = String(email || '').trim().toLocaleLowerCase('tr-TR');
  if (legacy !== e) return (await db.byIndex('users', 'email', legacy))[0] || null;
  return null;
}

async function createUser({ email, password, name, title }) {
  const e = normEmail(email);
  if (await findUser(e)) throw new Error('Bu e-posta adresiyle kayıtlı bir hesap zaten var.');
  if (!password || password.length < 8) throw new Error('Parola en az 8 karakter olmalı.');
  const { hash, salt, iterations } = await hashPassword(password);
  const user = {
    id: uuid(), email: e, name: name.trim(), title: (title || '').trim(), passwordHash: hash, salt, iterations,
    createdAt: new Date().toISOString(), lastLoginAt: null, mustChangePassword: false,
  };
  await db.put('users', user);
  return user;
}

/** İlk çalıştırmada varsayılan hesabı ve ekibi oluşturur. */
export async function ensureSeed() {
  await db.openDB();
  const seeded = await db.get('meta', 'seed');
  if (seeded) {
    if (!(await db.get('meta', 'rename-default-org-v1'))) {
      for (const o of await db.getAll('orgs')) {
        if (LEGACY_ORG_NAMES.includes(o.name)) await db.put('orgs', { ...o, name: DEFAULT_ACCOUNT.orgName });
      }
      await db.put('meta', { key: 'rename-default-org-v1', at: new Date().toISOString() });
    }
    return false;
  }
  const users = await db.count('users');
  if (users === 0) {
    const u = await createUser(DEFAULT_ACCOUNT);
    u.defaultPassword = true;
    await db.put('users', u);
    await createOrg(DEFAULT_ACCOUNT.orgName, u.id, u.email);
  }
  await db.put('meta', { key: 'seed', at: new Date().toISOString(), version: 5 });
  return true;
}

/** Bekleyen davetleri (e-postaya göre) hesaba bağlar. */
async function claimInvites(user) {
  const invites = (await db.byIndex('members', 'email', user.email)).filter((m) => m.status === 'invited');
  for (const m of invites) {
    m.userId = user.id;
    m.status = 'active';
    m.joinedAt = new Date().toISOString();
    await db.put('members', m);
    await audit(m.orgId, user.id, 'member.join', { email: user.email });
  }
  return invites.length;
}

export async function register({ email, password, name, title, orgName }) {
  const user = await createUser({ email, password, name, title });
  const joined = await claimInvites(user);
  let org = null;
  if (orgName && orgName.trim()) org = (await createOrg(orgName, user.id, user.email)).org;
  else if (!joined) org = (await createOrg(`${name.trim()} Ekibi`, user.id, user.email)).org;
  await login(email, password, true);
  return { user, joined, org, needsConfirmation: false };
}

// Kaba kuvvet denemelerine karşı: 5 hatalı denemeden sonra artan bekleme (15 sn → en çok 10 dk)
const FAIL_KEY = 'morphologai.auth.fail';
const readFails = () => { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{}'); } catch { return {}; } };
const writeFails = (v) => { try { localStorage.setItem(FAIL_KEY, JSON.stringify(v)); } catch { /* yok say */ } };

export async function login(email, password, remember = true) {
  const key = normEmail(email);
  const fails = readFails();
  const f = fails[key];
  if (f && f.until && f.until > Date.now()) {
    throw new Error(`Çok fazla hatalı deneme. ${Math.ceil((f.until - Date.now()) / 1000)} saniye sonra tekrar deneyin.`);
  }
  const user = await findUser(email);
  if (!user || !(await verifyPassword(password, user))) {
    const n = (f?.n || 0) + 1;
    fails[key] = { n, until: n >= 5 ? Date.now() + Math.min(600, 15 * 2 ** (n - 5)) * 1000 : 0 };
    writeFails(fails);
    throw new Error('E-posta veya parola hatalı.');
  }
  if (fails[key]) { delete fails[key]; writeFails(fails); }
  await claimInvites(user);
  user.lastLoginAt = new Date().toISOString();
  await db.put('users', user);
  const memberships = await activeMemberships(user.id);
  const prev = readAuth();
  const orgId = prev && prev.userId === user.id && memberships.some((m) => m.orgId === prev.orgId) ? prev.orgId : memberships[0]?.orgId || null;
  writeAuth({ userId: user.id, orgId, at: Date.now() }, remember);
  if (orgId) await audit(orgId, user.id, 'auth.login', {});
  return user;
}

export async function logout() {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

function readAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeAuth(v, remember) {
  const s = JSON.stringify(v);
  try {
    if (remember) { localStorage.setItem(AUTH_KEY, s); sessionStorage.removeItem(AUTH_KEY); }
    else { sessionStorage.setItem(AUTH_KEY, s); localStorage.removeItem(AUTH_KEY); }
  } catch { /* yok say */ }
}

async function activeMemberships(userId) {
  return (await db.byIndex('members', 'userId', userId)).filter((m) => m.status === 'active');
}

/** Oturum bağlamı: kullanıcı, aktif ekip ve üyelik; oturum yoksa null. */
export async function loadContext() {
  const a = readAuth();
  if (!a || !a.userId) return null;
  const user = await db.get('users', a.userId);
  if (!user) { logout(); return null; }
  const memberships = await activeMemberships(user.id);
  const orgs = (await Promise.all(memberships.map((m) => db.get('orgs', m.orgId)))).filter(Boolean);
  const orgId = a.orgId && orgs.some((o) => o.id === a.orgId) ? a.orgId : orgs[0]?.id || null;
  if (orgId !== a.orgId) writeAuth({ ...a, orgId }, !!localStorage.getItem(AUTH_KEY));
  const org = orgs.find((o) => o.id === orgId) || null;
  if (org) org.settings = normalizeOrgSettings(org.settings);
  const member = memberships.find((m) => m.orgId === orgId) || null;
  return { user, org, member, orgs, memberships };
}

export async function switchOrg(orgId) {
  const a = readAuth();
  if (!a) return;
  writeAuth({ ...a, orgId }, !!localStorage.getItem(AUTH_KEY));
}

export async function changePassword(userId, oldPw, newPw) {
  const user = await db.get('users', userId);
  if (!(await verifyPassword(oldPw, user))) throw new Error('Mevcut parola hatalı.');
  if (!newPw || newPw.length < 8) throw new Error('Yeni parola en az 8 karakter olmalı.');
  const { hash, salt, iterations } = await hashPassword(newPw);
  Object.assign(user, { passwordHash: hash, salt, iterations, defaultPassword: false, mustChangePassword: false });
  await db.put('users', user);
}

export async function updateProfile(userId, { name, title }) {
  const user = await db.get('users', userId);
  user.name = (name || user.name).trim();
  user.title = (title ?? user.title).trim();
  await db.put('users', user);
  return user;
}

/** Varsayılan hesap bu tarayıcıda hâlâ varsayılan parolayla mı? (giriş ekranı ipucu için) */
export async function defaultAccountHint() {
  const u = await findUser(DEFAULT_ACCOUNT.email);
  return !!(u && u.defaultPassword);
}

/** Ekibe üye ekler: hesap varsa hemen, yoksa davet olarak (o e-postayla kayıt olunca katılır). */
export async function addMember(ctx, { email, role, name, password }) {
  if (!can(ctx.member, 'member.manage')) throw new Error('Üye ekleme yetkiniz yok.');
  const e = normEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Geçerli bir e-posta girin.');
  const existing = (await db.byIndex('members', 'orgId', ctx.org.id)).find((m) => normEmail(m.email) === e);
  if (existing) throw new Error('Bu kişi zaten ekipte ya da davetli.');
  let user = await findUser(e);
  if (!user && password) user = await createUser({ email: e, password, name: name || e.split('@')[0], title: '' });
  const m = {
    id: uuid(), orgId: ctx.org.id, email: user ? user.email : e, role: role || 'clinician', userId: user ? user.id : null,
    status: user ? 'active' : 'invited', invitedBy: ctx.user.id, createdAt: new Date().toISOString(),
  };
  await db.put('members', m);
  await audit(ctx.org.id, ctx.user.id, 'member.add', { email: e, role: m.role, status: m.status });
  return m;
}

export async function setMemberRole(ctx, memberId, role) {
  if (!can(ctx.member, 'member.manage')) throw new Error('Yetkiniz yok.');
  const m = await db.get('members', memberId);
  if (!m || m.orgId !== ctx.org.id) throw new Error('Üye bulunamadı.');
  if (m.role === 'owner' && role !== 'owner') {
    const owners = (await db.byIndex('members', 'orgId', ctx.org.id)).filter((x) => x.role === 'owner' && x.status === 'active');
    if (owners.length < 2) throw new Error('Ekipte en az bir sahip kalmalı.');
  }
  if ((role === 'owner' || m.role === 'owner') && ctx.member.role !== 'owner') throw new Error('Sahiplik yalnızca bir sahip tarafından verilebilir ya da geri alınabilir.');
  m.role = role;
  await db.put('members', m);
  await audit(ctx.org.id, ctx.user.id, 'member.role', { email: m.email, role });
}

export async function removeMember(ctx, memberId) {
  if (!can(ctx.member, 'member.manage')) throw new Error('Yetkiniz yok.');
  const m = await db.get('members', memberId);
  if (!m || m.orgId !== ctx.org.id) return;
  if (m.role === 'owner') {
    if (ctx.member.role !== 'owner') throw new Error('Bir sahibi yalnızca başka bir sahip çıkarabilir.');
    const owners = (await db.byIndex('members', 'orgId', ctx.org.id)).filter((x) => x.role === 'owner' && x.status === 'active');
    if (owners.length < 2) throw new Error('Son sahip ekipten çıkarılamaz.');
  }
  await db.del('members', memberId);
  await audit(ctx.org.id, ctx.user.id, 'member.remove', { email: m.email });
}

export async function listMembers(orgId) {
  const members = await db.byIndex('members', 'orgId', orgId);
  const users = await Promise.all(members.map((m) => (m.userId ? db.get('users', m.userId) : null)));
  return members.map((m, i) => ({ ...m, user: users[i] ? { id: users[i].id, name: users[i].name, title: users[i].title, lastLoginAt: users[i].lastLoginAt } : null }))
    .sort((a, b) => (ROLES[b.role]?.rank || 0) - (ROLES[a.role]?.rank || 0));
}

export async function updateOrg(ctx, patch) {
  if (!can(ctx.member, 'org.manage')) throw new Error('Ekip ayarlarını değiştirme yetkiniz yok.');
  const org = await db.get('orgs', ctx.org.id);
  Object.assign(org, patch, { updatedAt: new Date().toISOString() });
  await db.put('orgs', org);
  await audit(ctx.org.id, ctx.user.id, 'org.update', { keys: Object.keys(patch) });
  return org;
}

/** Parola sıfırlama e-postası yerel modda yoktur. */
export async function requestPasswordReset() {
  throw new Error('Yerel modda parola sıfırlama e-postası gönderilemez. Ekip yöneticiniz size yeni bir hesap açabilir.');
}
