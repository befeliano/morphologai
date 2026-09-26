/**
 * Kimlik doğrulama ve ekip üyeliği — altyapıdan bağımsız arayüz.
 * Bulut bağlantısı varsa Supabase Auth (auth.cloud.js), yoksa bu tarayıcıdaki
 * yerel hesaplar (auth.local.js) kullanılır. Ekranlar yalnızca bu dosyayı içe aktarır.
 */
import { backend } from './backend.js';
import * as local from './auth.local.js';
import * as cloud from './auth.cloud.js';

export { ROLES, can, defaultOrgSettings } from './roles.js';
export { DEFAULT_ACCOUNT } from './auth.local.js';

const impl = () => (backend.mode === 'cloud' ? cloud : local);

export const ensureSeed = (...a) => impl().ensureSeed(...a);
export const register = (...a) => impl().register(...a);
export const login = (...a) => impl().login(...a);
export const logout = (...a) => impl().logout(...a);
export const loadContext = (...a) => impl().loadContext(...a);
export const switchOrg = (...a) => impl().switchOrg(...a);
export const changePassword = (...a) => impl().changePassword(...a);
export const updateProfile = (...a) => impl().updateProfile(...a);
export const defaultAccountHint = (...a) => impl().defaultAccountHint(...a);
export const addMember = (...a) => impl().addMember(...a);
export const setMemberRole = (...a) => impl().setMemberRole(...a);
export const removeMember = (...a) => impl().removeMember(...a);
export const listMembers = (...a) => impl().listMembers(...a);
export const updateOrg = (...a) => impl().updateOrg(...a);
export const createOrg = (...a) => impl().createOrg(...a);
export const audit = (...a) => impl().audit(...a);
export const requestPasswordReset = (...a) => impl().requestPasswordReset(...a);
export const setNewPassword = (...a) => cloud.setNewPassword(...a);
