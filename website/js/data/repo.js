/**
 * Ekip (kiracı) kapsamlı veri deposu — altyapıdan bağımsız giriş noktası.
 * Bulut bağlantısı varsa Supabase (repo.cloud.js), yoksa IndexedDB (repo.local.js).
 * İki depo da aynı arayüzü sağlar: patients, sessions, audio, acoustic, lexicon, audit, usage().
 */
import { backend } from './backend.js';
import { createLocalRepo } from './repo.local.js';
import { createCloudRepo } from './repo.cloud.js';

export function createRepo(ctx) {
  return backend.mode === 'cloud' ? createCloudRepo(ctx) : createLocalRepo(ctx);
}
