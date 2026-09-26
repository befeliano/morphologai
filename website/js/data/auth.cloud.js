/**
 * Bulut kimlik doğrulama ve ekip üyeliği (Supabase Auth + supabase/schema.sql)
 * ==========================================================================
 * Arayüz auth.local.js ile aynıdır. Yetki kuralları veritabanında (RLS ve
 * güvenlikli fonksiyonlar) uygulanır; buradaki denetimler yalnızca kullanıcıya
 * erken ve anlaşılır ileti göstermek içindir.
 */
import { backend, appUrl, setRemember, cloudError } from './backend.js';
import { ROLES, can, defaultOrgSettings, normalizeOrgSettings, normEmail } from './roles.js';
import { clearAudioCache } from './audioCache.js';

const ORG_KEY = 'morphologai.cloud.org';
const sb = () => backend.supabase;

function check(res, fallback) {
  if (res.error) throw cloudError(res.error, fallback);
  return res.data;
}

export const memberFromRow = (r) => ({
  id: r.id, orgId: r.org_id, userId: r.user_id, email: r.email, role: r.role, status: r.status,
  invitedBy: r.invited_by, createdAt: r.created_at, joinedAt: r.joined_at,
});

export const orgFromRow = (r) => ({
  id: r.id, name: r.name, settings: r.settings || {}, createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at,
});

// ---------------------------------------------------------------------------
/** İşlem günlüğüne yazar; kullanıcı ve zaman sunucuda damgalanır. Hata ana işlemi durdurmaz. */
export async function audit(orgId, _userId, action, detail = {}) {
  if (!orgId) return;
  try {
    const res = await sb().from('audit').insert({ org_id: orgId, action, detail });
    if (res.error) console.warn('Günlük yazılamadı:', res.error.message);
  } catch (err) {
    console.warn('Günlük yazılamadı:', err);
  }
}

export async function createOrg(name) {
  const data = check(await sb().rpc('create_org', { p_name: String(name || '').trim(), p_settings: defaultOrgSettings() }), 'Ekip oluşturulamadı.');
  return { org: orgFromRow(Array.isArray(data) ? data[0] : data), member: null };
}

export async function ensureSeed() { return false; }
export async function defaultAccountHint() { return false; }

/** Giriş sonrası: profil + davetler, ilk girişte ekip kurulumu. */
let onboardedThisLoad = false;
async function afterSignIn() {
  const joined = check(await sb().rpc('on_login'), 'Oturum hazırlanamadı.') || 0;
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return { joined, org: null };
  const meta = user.user_metadata || {};
  let org = null;
  if (!meta.onboarded) {
    const mems = check(await sb().from('members').select('org_id').eq('user_id', user.id).eq('status', 'active'));
    const orgName = String(meta.org_name || '').trim();
    if (orgName || !(mems || []).length) {
      const fallback = `${String(meta.name || user.email.split('@')[0]).trim()} Ekibi`;
      org = (await createOrg(orgName || fallback)).org;
      try { localStorage.setItem(`${ORG_KEY}.${user.id}`, org.id); } catch { /* yok say */ }
    }
    await sb().auth.updateUser({ data: { onboarded: true } });
  }
  onboardedThisLoad = true;
  return { joined, org };
}

export async function register({ email, password, name, title, orgName }) {
  if (!String(name || '').trim()) throw new Error('Ad soyad girin.');
  if (!password || password.length < 8) throw new Error('Parola en az 8 karakter olmalı.');
  const e = normEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Geçerli bir e-posta girin.');
  const res = await sb().auth.signUp({
    email: e,
    password,
    options: {
      emailRedirectTo: appUrl(),
      data: { name: name.trim(), title: String(title || '').trim(), org_name: String(orgName || '').trim() },
    },
  });
  if (res.error) throw cloudError(res.error, 'Hesap oluşturulamadı.');
  const { user, session } = res.data;
  // E-posta doğrulaması açıkken var olan adres için Supabase boş kimlik listesi döndürür
  if (user && Array.isArray(user.identities) && user.identities.length === 0) {
    throw new Error('Bu e-posta adresiyle kayıtlı bir hesap zaten var. Giriş yapın ya da "Parolamı unuttum" bağlantısını kullanın.');
  }
  if (!session) return { user, joined: 0, org: null, needsConfirmation: true, email: e };
  setRemember(true);
  const r = await afterSignIn();
  return { user, joined: r.joined, org: r.org, needsConfirmation: false };
}

export async function login(email, password, remember = true) {
  const res = await sb().auth.signInWithPassword({ email: normEmail(email), password });
  if (res.error) throw cloudError(res.error, 'Giriş yapılamadı.');
  setRemember(remember);
  const r = await afterSignIn();
  const ctx = await loadContext();
  if (ctx?.org) await audit(ctx.org.id, ctx.user.id, 'auth.login', {});
  return { ...ctx?.user, joined: r.joined };
}

export async function logout() {
  try { await sb().auth.signOut(); } catch { /* ağ yoksa yerel oturum yine de silinir */ }
  setRemember(true);
  onboardedThisLoad = false;
  await clearAudioCache();
}

export async function requestPasswordReset(email) {
  const e = normEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Geçerli bir e-posta girin.');
  const res = await sb().auth.resetPasswordForEmail(e, { redirectTo: appUrl() });
  if (res.error) throw cloudError(res.error, 'Sıfırlama e-postası gönderilemedi.');
}

/** Parola sıfırlama bağlantısıyla gelen kullanıcı için yeni parola. */
export async function setNewPassword(newPw) {
  if (!newPw || newPw.length < 8) throw new Error('Yeni parola en az 8 karakter olmalı.');
  const res = await sb().auth.updateUser({ password: newPw });
  if (res.error) throw cloudError(res.error, 'Parola değiştirilemedi.');
  backend.recovery = false;
}

/** Oturum bağlamı: kullanıcı, aktif ekip ve üyelik; oturum yoksa null. */
export async function loadContext() {
  const { data: { session } } = await sb().auth.getSession();
  if (!session) return null;
  if (!onboardedThisLoad) await afterSignIn();
  const uid = session.user.id;
  const [prof, mems] = await Promise.all([
    sb().from('profiles').select('id,email,name,title,created_at,last_login_at').eq('id', uid).maybeSingle(),
    sb().from('members').select('*').eq('user_id', uid).eq('status', 'active'),
  ]);
  const p = check(prof);
  const memberships = (check(mems) || []).map(memberFromRow);
  const ids = memberships.map((m) => m.orgId);
  const orgs = ids.length ? (check(await sb().from('orgs').select('*').in('id', ids)) || []).map(orgFromRow) : [];
  orgs.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  let stored = null;
  try { stored = localStorage.getItem(`${ORG_KEY}.${uid}`); } catch { /* yok say */ }
  const orgId = stored && orgs.some((o) => o.id === stored) ? stored : orgs[0]?.id || null;
  const org = orgs.find((o) => o.id === orgId) || null;
  if (org) org.settings = normalizeOrgSettings(org.settings);
  const member = memberships.find((m) => m.orgId === orgId) || null;
  const user = {
    id: uid,
    email: session.user.email,
    name: p?.name || session.user.user_metadata?.name || session.user.email.split('@')[0],
    title: p?.title ?? session.user.user_metadata?.title ?? '',
    createdAt: p?.created_at || session.user.created_at,
    lastLoginAt: p?.last_login_at || null,
    defaultPassword: false,
  };
  return { user, org, member, orgs, memberships };
}

export async function switchOrg(orgId) {
  const { data: { session } } = await sb().auth.getSession();
  if (!session) return;
  try { localStorage.setItem(`${ORG_KEY}.${session.user.id}`, orgId); } catch { /* yok say */ }
}

export async function changePassword(_userId, oldPw, newPw) {
  if (!newPw || newPw.length < 8) throw new Error('Yeni parola en az 8 karakter olmalı.');
  const { data: { user } } = await sb().auth.getUser();
  const re = await sb().auth.signInWithPassword({ email: user.email, password: oldPw });
  if (re.error) throw new Error('Mevcut parola hatalı.');
  const res = await sb().auth.updateUser({ password: newPw });
  if (res.error) throw cloudError(res.error, 'Parola değiştirilemedi.');
}

export async function updateProfile(userId, { name, title }) {
  const patch = { name: String(name || '').trim(), title: String(title ?? '').trim() };
  if (!patch.name) throw new Error('Ad soyad boş olamaz.');
  const data = check(await sb().from('profiles').update(patch).eq('id', userId).select('id'), 'Profil güncellenemedi.');
  if (!data?.length) throw new Error('Profil güncellenemedi.');
  await sb().auth.updateUser({ data: patch }).catch(() => {});
  return { id: userId, ...patch };
}

export async function addMember(ctx, { email, role }) {
  if (!can(ctx.member, 'member.manage')) throw new Error('Üye ekleme yetkiniz yok.');
  const data = check(await sb().rpc('add_member', { p_org: ctx.org.id, p_email: normEmail(email), p_role: role || 'clinician' }), 'Üye eklenemedi.');
  return memberFromRow(Array.isArray(data) ? data[0] : data);
}

export async function setMemberRole(ctx, memberId, role) {
  if (!can(ctx.member, 'member.manage')) throw new Error('Yetkiniz yok.');
  check(await sb().rpc('set_member_role', { p_member: memberId, p_role: role }), 'Rol değiştirilemedi.');
}

export async function removeMember(ctx, memberId) {
  if (!can(ctx.member, 'member.manage')) throw new Error('Yetkiniz yok.');
  check(await sb().rpc('remove_member', { p_member: memberId }), 'Üye çıkarılamadı.');
}

export async function listMembers(orgId) {
  const members = (check(await sb().from('members').select('*').eq('org_id', orgId)) || []).map(memberFromRow);
  const ids = members.filter((m) => m.userId).map((m) => m.userId);
  const profiles = ids.length ? check(await sb().from('profiles').select('id,name,title,last_login_at').in('id', ids)) || [] : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return members.map((m) => {
    const p = byId.get(m.userId);
    return { ...m, user: p ? { id: p.id, name: p.name, title: p.title, lastLoginAt: p.last_login_at } : null };
  }).sort((a, b) => (ROLES[b.role]?.rank || 0) - (ROLES[a.role]?.rank || 0) || (a.email || '').localeCompare(b.email || ''));
}

export async function updateOrg(ctx, patch) {
  if (!can(ctx.member, 'org.manage')) throw new Error('Ekip ayarlarını değiştirme yetkiniz yok.');
  const row = {};
  if (patch.name !== undefined) row.name = String(patch.name).trim();
  if (patch.settings !== undefined) row.settings = patch.settings;
  const data = check(await sb().from('orgs').update(row).eq('id', ctx.org.id).select('*'), 'Ekip güncellenemedi.');
  if (!data?.length) throw new Error('Ekip güncellenemedi (yetkiniz olmayabilir).');
  await audit(ctx.org.id, ctx.user.id, 'org.update', { keys: Object.keys(row) });
  return orgFromRow(data[0]);
}
