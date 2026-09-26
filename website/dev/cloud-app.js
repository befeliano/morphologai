// YALNIZ YEREL TEST: uygulamayı PGlite + sahte Supabase istemcisiyle bulut modunda açar.
import { createMockSupabase, SUPABASE_PRELUDE } from './sbmock.js';

window.__morphologaiTestClient = (async () => {
  const { PGlite } = await import('https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js');
  const pg = new PGlite();
  await pg.exec(SUPABASE_PRELUDE);
  await pg.exec(await (await fetch('/__supabase/schema.sql', { cache: 'no-store' })).text());
  const client = createMockSupabase(pg);
  window.__sbmock = client;
  return client;
})();

await import('../js/app/main.js');
