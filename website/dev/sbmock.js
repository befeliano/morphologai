/**
 * TEST AMAÇLI sahte Supabase istemcisi — PGlite (tarayıcıda gerçek Postgres) üzerinde.
 * Uygulamanın kullandığı supabase-js alt kümesini taklit eder: auth, from().select/insert/upsert/
 * update/delete + eq/in/order/range/limit/single/maybeSingle, rpc, storage.
 * Her istek, oturumdaki kullanıcıyla "authenticated" rolüne geçilerek çalışır; böylece
 * supabase/schema.sql içindeki RLS kuralları ve izinler gerçekten sınanır.
 * Yalnızca dev/cloud-test.html tarafından kullanılır; yayına alınmaz.
 */
export const SUPABASE_PRELUDE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts,1)-1]; end $$;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const RPC_KIND = { create_org: 'row', add_member: 'row', set_member_role: 'void', remove_member: 'void', on_login: 'scalar', org_storage_bytes: 'scalar', my_rank: 'scalar' };
const ident = (c) => { const s = String(c).trim(); if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`bad identifier ${s}`); return `"${s}"`; };
const val = (v) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v);
function norm(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = norm(x); return o; }
  return v;
}
const errOf = (e) => ({ message: e.message, code: e.code || null, details: e.detail || null });

export function createMockSupabase(pg, opts = {}) {
  const cfg = { autoConfirm: true, ...opts };
  let session = null;
  const listeners = new Set();
  const files = new Map();
  const emit = (ev) => listeners.forEach((fn) => fn(ev, session));

  async function asUser(fn) {
    return pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [session ? session.user.id : '']);
      await tx.exec(session ? 'set local role authenticated' : 'set local role anon');
      return fn(tx);
    });
  }

  const userObj = (r) => ({
    id: r.id, email: r.email, user_metadata: norm(r.raw_user_meta_data || {}), email_confirmed_at: r.email_confirmed_at ? norm(r.email_confirmed_at) : null,
    created_at: norm(r.created_at), identities: [{ provider: 'email' }],
  });
  const getUserRow = async (id) => (await pg.query('select * from auth.users where id = $1', [id])).rows[0];
  const startSession = async (id) => { session = { user: userObj(await getUserRow(id)), access_token: `tok-${id}` }; emit('SIGNED_IN'); };

  const auth = {
    async signUp({ email, password, options = {} }) {
      const e = String(email).toLowerCase();
      const ex = (await pg.query('select * from auth.users where email = $1', [e])).rows[0];
      if (ex) {
        if (cfg.autoConfirm) return { data: { user: null, session: null }, error: { message: 'User already registered', status: 422 } };
        return { data: { user: { ...userObj(ex), identities: [] }, session: null }, error: null };
      }
      const r = (await pg.query('insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4) returning *',
        [e, password, JSON.stringify(options.data || {}), cfg.autoConfirm ? new Date().toISOString() : null])).rows[0];
      if (cfg.autoConfirm) { await startSession(r.id); return { data: { user: session.user, session }, error: null }; }
      return { data: { user: userObj(r), session: null }, error: null };
    },
    async signInWithPassword({ email, password }) {
      const r = (await pg.query('select * from auth.users where email = $1', [String(email).toLowerCase()])).rows[0];
      if (!r || r.encrypted_password !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
      if (!r.email_confirmed_at) return { data: { user: null, session: null }, error: { message: 'Email not confirmed', status: 400 } };
      await startSession(r.id);
      return { data: { user: session.user, session }, error: null };
    },
    async signOut() { session = null; emit('SIGNED_OUT'); return { error: null }; },
    async getSession() { return { data: { session }, error: null }; },
    async getUser() { if (!session) return { data: { user: null }, error: null }; return { data: { user: userObj(await getUserRow(session.user.id)) }, error: null }; },
    async updateUser({ password, data }) {
      if (!session) return { data: null, error: { message: 'no session' } };
      if (password) {
        const cur = await getUserRow(session.user.id);
        if (cur.encrypted_password === password) return { data: null, error: { message: 'New password should be different from the old password.' } };
        await pg.query('update auth.users set encrypted_password = $1 where id = $2', [password, session.user.id]);
      }
      if (data) await pg.query('update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb where id = $2', [JSON.stringify(data), session.user.id]);
      session.user = userObj(await getUserRow(session.user.id));
      return { data: { user: session.user }, error: null };
    },
    onAuthStateChange(cb) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
  };

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.cols = '*'; this.filters = []; this.orders = []; this.rng = null; this.lim = null; this.one = null; this.returning = false; }
    select(cols = '*') { if (this.op === 'select') this.cols = cols; else { this.returning = true; this.retCols = cols; } return this; }
    insert(rows) { this.op = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(rows, o = {}) { this.op = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; this.onConflict = o.onConflict; return this; }
    update(patch) { this.op = 'update'; this.patch = patch; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push([c, '=', v]); return this; }
    in(c, arr) { this.filters.push([c, 'in', arr]); return this; }
    order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    then(res, rej) { return this.run().then(res, rej); }
    colList(c) { return c === '*' ? '*' : c.split(',').map(ident).join(', '); }
    where(params) {
      if (!this.filters.length) return '';
      return ` where ${this.filters.map(([c, op, v]) => {
        if (op === 'in') { if (!v.length) return 'false'; return `${ident(c)} in (${v.map((x) => { params.push(val(x)); return `$${params.length}`; }).join(', ')})`; }
        params.push(val(v));
        return `${ident(c)} = $${params.length}`;
      }).join(' and ')}`;
    }
    async run() {
      const t = `public.${ident(this.table)}`;
      const params = [];
      let sql;
      const ret = this.returning ? ` returning ${this.colList(this.retCols || '*')}` : '';
      if (this.op === 'select') {
        sql = `select ${this.colList(this.cols)} from ${t}${this.where(params)}`;
        if (this.orders.length) sql += ` order by ${this.orders.map(([c, a]) => `${ident(c)} ${a ? 'asc' : 'desc'}`).join(', ')}`;
        if (this.rng) sql += ` limit ${this.rng[1] - this.rng[0] + 1} offset ${this.rng[0]}`;
        else if (this.lim != null) sql += ` limit ${Number(this.lim)}`;
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const cols = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
        const values = this.rows.map((r) => `(${cols.map((c) => { params.push(val(r[c] === undefined ? null : r[c])); return `$${params.length}`; }).join(', ')})`).join(', ');
        sql = `insert into ${t} (${cols.map(ident).join(', ')}) values ${values}`;
        if (this.op === 'upsert') {
          const conflict = (this.onConflict || 'id').split(',').map((c) => c.trim());
          const upd = cols.filter((c) => !conflict.includes(c));
          sql += ` on conflict (${conflict.map(ident).join(', ')}) do ${upd.length ? `update set ${upd.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}` : 'nothing'}`;
        }
        sql += ret;
      } else if (this.op === 'update') {
        const sets = Object.entries(this.patch).map(([c, v]) => { params.push(val(v)); return `${ident(c)} = $${params.length}`; });
        sql = `update ${t} set ${sets.join(', ')}${this.where(params)}${ret}`;
      } else if (this.op === 'delete') {
        sql = `delete from ${t}${this.where(params)}${ret}`;
      }
      try {
        const res = await asUser((tx) => tx.query(sql, params));
        let rows = norm(res.rows || []);
        const wantRows = this.op === 'select' || this.returning;
        if (!wantRows) return { data: null, error: null };
        if (this.one) {
          if (rows.length === 1) return { data: rows[0], error: null };
          if (!rows.length && this.one === 'maybe') return { data: null, error: null };
          return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
        }
        return { data: rows, error: null };
      } catch (e) {
        return { data: null, error: errOf(e) };
      }
    }
  }

  async function rpc(fn, args = {}) {
    if (!/^[a-z_]+$/.test(fn)) throw new Error('bad fn');
    const names = Object.keys(args);
    const params = names.map((n) => val(args[n]));
    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
    const kind = RPC_KIND[fn] || 'scalar';
    const sql = kind === 'row' ? `select to_jsonb(r) as j from ${call} as r` : kind === 'void' ? `select ${call}` : `select ${call} as v`;
    try {
      const res = await asUser((tx) => tx.query(sql, params));
      const row = res.rows[0];
      return { data: kind === 'row' ? norm(row?.j ?? null) : kind === 'void' ? null : norm(row?.v ?? null), error: null };
    } catch (e) {
      return { data: null, error: errOf(e) };
    }
  }

  const storage = {
    from(bucket) {
      return {
        async upload(path, body, o = {}) {
          try {
            const b = (await pg.query('select * from storage.buckets where id = $1', [bucket])).rows[0];
            if (!b) return { data: null, error: { message: 'Bucket not found' } };
            const type = o.contentType || body.type || 'application/octet-stream';
            const allowed = b.allowed_mime_types;
            if (allowed && allowed.length && !allowed.some((p) => (p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) : p === type))) {
              return { data: null, error: { message: `mime type ${type} is not supported`, statusCode: '415' } };
            }
            if (b.file_size_limit && body.size > Number(b.file_size_limit)) return { data: null, error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } };
            await asUser((tx) => tx.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, auth.uid(), $3)
              ${o.upsert ? 'on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()' : ''}`, [bucket, path, JSON.stringify({ mimetype: type, size: body.size })]));
            files.set(`${bucket}/${path}`, body);
            return { data: { path }, error: null };
          } catch (e) {
            return { data: null, error: { message: e.code === '42501' ? 'new row violates row-level security policy' : e.message, statusCode: '403' } };
          }
        },
        async download(path) {
          const res = await asUser((tx) => tx.query('select name from storage.objects where bucket_id = $1 and name = $2', [bucket, path]));
          if (!res.rows.length) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
          return { data: files.get(`${bucket}/${path}`), error: null };
        },
        async remove(paths) {
          const ps = paths.map((_, i) => `$${i + 2}`).join(', ');
          const res = await asUser((tx) => tx.query(`delete from storage.objects where bucket_id = $1 and name in (${ps}) returning name`, [bucket, ...paths]));
          for (const r of res.rows) files.delete(`${bucket}/${r.name}`);
          return { data: res.rows, error: null };
        },
      };
    },
  };

  return {
    auth,
    from: (t) => new Query(t),
    rpc,
    storage,
    // test yardımcıları
    _test: {
      pg, files, get session() { return session; },
      setAutoConfirm(v) { cfg.autoConfirm = v; },
      async confirmEmail(email) { await pg.query('update auth.users set email_confirmed_at = now() where email = $1', [email.toLowerCase()]); },
    },
  };
}
