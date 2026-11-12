-- =============================================================================
-- MorphologAI — Supabase veritabanı şeması (çok kiracılı, satır düzeyi güvenlikli)
-- =============================================================================
-- Kurulum: Supabase panelinde  SQL Editor → New query  → bu dosyanın tamamını
-- yapıştırın → Run. Dosya tekrar çalıştırılabilir (mevcut verileri silmez).
--
-- Model
--   profiles     kullanıcı profili (auth.users ile 1:1)
--   orgs         ekipler (kiracı)
--   members      ekip üyelikleri ve roller: owner > admin > clinician > viewer
--   patients     danışanlar                       ┐
--   sessions     seanslar (+ sözcük tablosu ayrı)  │  hepsi org_id ile ayrılır;
--   acoustic     seansın ağır akustik dizileri     │  yalnızca o ekibin etkin
--   audio_files  ses kayıtlarının üst verisi       │  üyeleri görebilir
--   lexicon      ekip sözlüğü düzeltmeleri         │
--   audit        işlem günlüğü (değiştirilemez)    ┘
--   storage: "recordings" (gizli kova) → <org_id>/<session_id>/<audio_id>.<uzantı>
--
-- Yetki kuralları uygulamadaki ile aynıdır:
--   görüntüleme ≥ viewer · danışan/seans/sözlük yazma ≥ clinician
--   üye yönetimi ve ekip ayarları ≥ admin · sahiplik verme yalnız owner
-- Üyelik değişiklikleri doğrudan tabloya değil, aşağıdaki fonksiyonlarla yapılır.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tablolar
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null default '' check (char_length(email) <= 320),
  name          text not null default '' check (char_length(name) <= 120),
  title         text not null default '' check (char_length(title) <= 60),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 160),
  settings   jsonb not null default '{}'::jsonb check (octet_length(settings::text) <= 65536),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete cascade,
  email      text not null check (char_length(email) <= 320),
  role       text not null default 'clinician' check (role in ('owner', 'admin', 'clinician', 'viewer')),
  status     text not null default 'invited' check (status in ('active', 'invited')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at  timestamptz,
  constraint members_active_has_user check (status = 'invited' or user_id is not null)
);
create unique index if not exists members_org_email_key on public.members (org_id, lower(email));
create unique index if not exists members_org_user_key on public.members (org_id, user_id) where user_id is not null;
create index if not exists members_user_idx on public.members (user_id) where status = 'active';
create index if not exists members_invite_idx on public.members (lower(email)) where status = 'invited';

create table if not exists public.patients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  code       text not null check (char_length(code) between 1 and 60),
  archived   boolean not null default false,
  demo       boolean not null default false,
  data       jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 262144),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_org_id_key unique (org_id, id)
);
create unique index if not exists patients_org_code_key on public.patients (org_id, lower(code));

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  patient_id  uuid not null,
  module      text not null default 'aphasia',
  task_type   text,
  status      text not null default 'draft',
  source      text,
  recorded_at timestamptz not null default now(),
  audio_id    uuid,
  demo        boolean not null default false,
  data        jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 6291456),   -- seans kaydı (sözcük tablosu hariç)
  word_table  jsonb check (word_table is null or octet_length(word_table::text) <= 12582912), -- sözcük düzeyi çözümleme (yalnız seans açılınca okunur)
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sessions_org_id_key unique (org_id, id),
  constraint sessions_patient_fk foreign key (org_id, patient_id)
    references public.patients (org_id, id) on delete cascade
);
create index if not exists sessions_org_recorded_idx on public.sessions (org_id, recorded_at desc);
create index if not exists sessions_patient_idx on public.sessions (patient_id);

create table if not exists public.acoustic (
  session_id uuid primary key,
  org_id     uuid not null,
  data       jsonb not null check (octet_length(data::text) <= 12582912),
  updated_at timestamptz not null default now(),
  constraint acoustic_session_fk foreign key (org_id, session_id)
    references public.sessions (org_id, id) on delete cascade
);

create table if not exists public.audio_files (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  session_id uuid not null,
  bucket     text not null default 'recordings',
  path       text not null,                         -- tek parça: nesne yolu · çok parça: ön ek (+ .part000 …)
  parts      integer not null default 1 check (parts between 1 and 500),
  -- Yalnız ses/video türü: başka tür (ör. text/html) tarayıcıda betik olarak açılabilirdi
  mime_type  text not null default 'audio/wav'
             check (mime_type ~ '^(audio|video)/[a-z0-9.+-]{1,40}$' or mime_type = 'application/octet-stream'),
  size_bytes bigint not null default 0 check (size_bytes between 0 and 10737418240),
  meta       jsonb not null default '{}'::jsonb check (octet_length(meta::text) <= 8192), -- fileName, durationSec, sampleRate, channels, bitsPerSample, format
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint audio_session_fk foreign key (org_id, session_id)
    references public.sessions (org_id, id) on delete cascade
);
create index if not exists audio_files_session_idx on public.audio_files (session_id);
create index if not exists audio_files_org_idx on public.audio_files (org_id);

create table if not exists public.lexicon (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  word       text not null check (char_length(word) between 1 and 80),
  analysis   jsonb not null check (octet_length(analysis::text) <= 65536),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lexicon_org_word_key unique (org_id, word)
);

-- Materyal Atölyesi: sözcük bankası (ekibin eklediği/etiketlediği sözcükler), görseller, üretilen materyaller
create table if not exists public.words (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  word       text not null check (char_length(word) between 1 and 60),
  data       jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 4096), -- category, ageBand, mediaId, hidden
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint words_org_word_key unique (org_id, word)
);

create table if not exists public.media_files (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  bucket     text not null default 'media',
  path       text not null,
  -- Yalnız raster görsel: SVG/HTML betik taşıyabilir
  mime_type  text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null default 0 check (size_bytes between 0 and 5242880),
  meta       jsonb not null default '{}'::jsonb check (octet_length(meta::text) <= 4096), -- label, width, height
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_files_org_idx on public.media_files (org_id);

create table if not exists public.materials (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs (id) on delete cascade,
  patient_id uuid,
  kind       text not null check (char_length(kind) between 1 and 40),
  title      text not null default '' check (char_length(title) <= 160),
  data       jsonb not null check (octet_length(data::text) <= 262144), -- params, content
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists materials_org_idx on public.materials (org_id, created_at desc);

create table if not exists public.audit (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.orgs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action  text not null check (char_length(action) <= 60),
  detail  jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 16384),
  at      timestamptz not null default now()
);
create index if not exists audit_org_at_idx on public.audit (org_id, at desc);

-- -----------------------------------------------------------------------------
-- 2) Yardımcı fonksiyonlar (RLS kuralları bunları kullanır)
-- -----------------------------------------------------------------------------
create or replace function public.role_rank(p_role text)
returns integer language sql immutable set search_path = public, pg_temp as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'clinician' then 2 when 'viewer' then 1 else 0 end
$$;

-- Oturumdaki kullanıcının en az p_min_rank rolüyle etkin üyesi olduğu ekipler
create or replace function public.my_orgs(p_min_rank integer default 1)
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.org_id from public.members m
  where m.user_id = auth.uid() and m.status = 'active' and public.role_rank(m.role) >= p_min_rank
$$;

-- Oturumdaki kullanıcının bir ekipteki rol düzeyi (üye değilse 0)
create or replace function public.my_rank(p_org uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(public.role_rank(m.role)), 0) from public.members m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

-- İki kullanıcı ortak bir ekipte mi? (profil görünürlüğü için)
create or replace function public.shares_org(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.members a join public.members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user
  )
$$;

-- -----------------------------------------------------------------------------
-- 3) Tetikleyiciler: zaman damgaları, oluşturan/güncelleyen, değişmez alanlar
-- -----------------------------------------------------------------------------
create or replace function public.tg_stamp()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    if new.org_id is distinct from old.org_id then
      raise exception 'Kayıt başka bir ekibe taşınamaz.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  if tg_table_name in ('patients', 'sessions', 'lexicon', 'words', 'materials') then
    new.updated_at := now();
  end if;
  if tg_table_name = 'sessions' and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create or replace function public.tg_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'Kayıt başka bir ekibe taşınamaz.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.tg_org_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  return new;
end $$;

-- Günlük kaydı her zaman oturumdaki kullanıcı ve sunucu saatiyle yazılır
create or replace function public.tg_audit_stamp()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.at := now();
  return new;
end $$;

drop trigger if exists stamp on public.patients;
create trigger stamp before insert or update on public.patients for each row execute function public.tg_stamp();
drop trigger if exists stamp on public.sessions;
create trigger stamp before insert or update on public.sessions for each row execute function public.tg_stamp();
drop trigger if exists stamp on public.lexicon;
create trigger stamp before insert or update on public.lexicon for each row execute function public.tg_stamp();
drop trigger if exists stamp on public.audio_files;
create trigger stamp before insert or update on public.audio_files for each row execute function public.tg_stamp();
drop trigger if exists stamp on public.words;
create trigger stamp before insert or update on public.words for each row execute function public.tg_stamp();
drop trigger if exists stamp on public.media_files;
create trigger stamp before insert or update on public.media_files for each row execute function public.tg_stamp();
drop trigger if exists stamp on public.materials;
create trigger stamp before insert or update on public.materials for each row execute function public.tg_stamp();
drop trigger if exists touch on public.acoustic;
create trigger touch before insert or update on public.acoustic for each row execute function public.tg_touch();
drop trigger if exists touch on public.orgs;
create trigger touch before update on public.orgs for each row execute function public.tg_org_touch();
drop trigger if exists stamp on public.audit;
create trigger stamp before insert on public.audit for each row execute function public.tg_audit_stamp();

-- Yeni kullanıcı → profil
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, name, title)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(trim(new.raw_user_meta_data ->> 'title'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4) Uygulama fonksiyonları (RPC)
-- -----------------------------------------------------------------------------

-- Girişte çağrılır: profili garanti eder, son giriş zamanını yazar,
-- e-postası doğrulanmış kullanıcının bekleyen davetlerini üyeliğe çevirir.
create or replace function public.on_login()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_joined integer := 0;
begin
  if v_uid is null then raise exception 'Oturum bulunamadı.' using errcode = '28000'; end if;
  select * into v_user from auth.users where id = v_uid;
  insert into public.profiles (id, email, name, title)
  values (v_uid, lower(coalesce(v_user.email, '')),
          coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(v_user.email, ''), '@', 1)),
          coalesce(trim(v_user.raw_user_meta_data ->> 'title'), ''))
  on conflict (id) do update set email = excluded.email;
  update public.profiles set last_login_at = now() where id = v_uid;

  if v_user.email_confirmed_at is not null and coalesce(v_user.email, '') <> '' then
    with claimed as (
      update public.members m
         set user_id = v_uid, status = 'active', joined_at = now()
       where m.status = 'invited'
         and lower(m.email) = lower(v_user.email)
         and not exists (select 1 from public.members x where x.org_id = m.org_id and x.user_id = v_uid)
      returning m.org_id
    )
    insert into public.audit (org_id, user_id, action, detail)
    select c.org_id, v_uid, 'member.join', jsonb_build_object('email', lower(v_user.email)) from claimed c;
    get diagnostics v_joined = row_count;
  end if;
  return v_joined;
end $$;

-- Yeni ekip: çağıran kişi sahip olur
create or replace function public.create_org(p_name text, p_settings jsonb default '{}'::jsonb)
returns public.orgs language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org public.orgs;
begin
  if v_uid is null then raise exception 'Oturum bulunamadı.' using errcode = '28000'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if (select count(*) from public.members where user_id = v_uid and role = 'owner') >= 20 then
    raise exception 'En fazla 20 ekibin sahibi olabilirsiniz.' using errcode = '54000';
  end if;
  insert into public.orgs (name, settings, created_by)
  values (left(coalesce(nullif(trim(p_name), ''), 'Yeni ekip'), 160), coalesce(p_settings, '{}'::jsonb), v_uid)
  returning * into v_org;
  insert into public.members (org_id, user_id, email, role, status, joined_at)
  values (v_org.id, v_uid, coalesce(v_email, ''), 'owner', 'active', now());
  insert into public.audit (org_id, user_id, action, detail)
  values (v_org.id, v_uid, 'org.create', jsonb_build_object('name', v_org.name));
  return v_org;
end $$;

-- Ekibe üye ekler: doğrulanmış hesabı varsa hemen etkin, yoksa davet
create or replace function public.add_member(p_org uuid, p_email text, p_role text default 'clinician')
returns public.members language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_rank integer := public.my_rank(p_org);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target uuid;
  v_m public.members;
begin
  if v_rank < 3 then raise exception 'Üye ekleme yetkiniz yok.' using errcode = '42501'; end if;
  if public.role_rank(p_role) = 0 then raise exception 'Geçersiz rol.' using errcode = '22023'; end if;
  if p_role = 'owner' and v_rank < 4 then
    raise exception 'Sahiplik yalnızca bir sahip tarafından verilebilir.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Geçerli bir e-posta girin.' using errcode = '22023'; end if;
  if exists (select 1 from public.members where org_id = p_org and lower(email) = v_email) then
    raise exception 'Bu kişi zaten ekipte ya da davetli.' using errcode = '23505';
  end if;
  select id into v_target from auth.users
   where lower(email) = v_email and email_confirmed_at is not null
   limit 1;
  insert into public.members (org_id, user_id, email, role, status, invited_by, joined_at)
  values (p_org, v_target, v_email, p_role,
          case when v_target is null then 'invited' else 'active' end,
          v_uid, case when v_target is null then null else now() end)
  returning * into v_m;
  insert into public.audit (org_id, user_id, action, detail)
  values (p_org, v_uid, 'member.add', jsonb_build_object('email', v_email, 'role', p_role, 'status', v_m.status));
  return v_m;
end $$;

create or replace function public.set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_m public.members;
  v_rank integer;
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'Üye bulunamadı.' using errcode = 'P0002'; end if;
  v_rank := public.my_rank(v_m.org_id);
  if v_rank < 3 then raise exception 'Yetkiniz yok.' using errcode = '42501'; end if;
  if public.role_rank(p_role) = 0 then raise exception 'Geçersiz rol.' using errcode = '22023'; end if;
  if v_m.user_id = v_uid then raise exception 'Kendi rolünüzü değiştiremezsiniz.' using errcode = '42501'; end if;
  if (v_m.role = 'owner' or p_role = 'owner') and v_rank < 4 then
    raise exception 'Sahiplik yalnızca bir sahip tarafından verilebilir ya da geri alınabilir.' using errcode = '42501';
  end if;
  if v_m.role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.members where org_id = v_m.org_id and role = 'owner' and status = 'active') < 2 then
    raise exception 'Ekipte en az bir sahip kalmalı.' using errcode = '42501';
  end if;
  update public.members set role = p_role where id = p_member;
  insert into public.audit (org_id, user_id, action, detail)
  values (v_m.org_id, v_uid, 'member.role', jsonb_build_object('email', v_m.email, 'role', p_role));
end $$;

create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_m public.members;
  v_rank integer;
begin
  select * into v_m from public.members where id = p_member;
  if not found then return; end if;
  v_rank := public.my_rank(v_m.org_id);
  if v_rank < 3 then raise exception 'Yetkiniz yok.' using errcode = '42501'; end if;
  if v_m.user_id = v_uid then raise exception 'Kendinizi ekipten çıkaramazsınız.' using errcode = '42501'; end if;
  if v_m.role = 'owner' and v_rank < 4 then
    raise exception 'Bir sahibi yalnızca başka bir sahip çıkarabilir.' using errcode = '42501';
  end if;
  if v_m.role = 'owner'
     and (select count(*) from public.members where org_id = v_m.org_id and role = 'owner' and status = 'active') < 2 then
    raise exception 'Son sahip ekipten çıkarılamaz.' using errcode = '42501';
  end if;
  delete from public.members where id = p_member;
  insert into public.audit (org_id, user_id, action, detail)
  values (v_m.org_id, v_uid, 'member.remove', jsonb_build_object('email', v_m.email));
end $$;

-- Ekibin buluttaki ses verisi toplamı (bayt)
create or replace function public.org_storage_bytes(p_org uuid)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.my_rank(p_org) >= 1
              then (select coalesce(sum(size_bytes), 0)::bigint from public.audio_files where org_id = p_org)
                 + (select coalesce(sum(size_bytes), 0)::bigint from public.media_files where org_id = p_org)
              else 0::bigint end
$$;

-- -----------------------------------------------------------------------------
-- 5) Satır düzeyi güvenlik (RLS)
-- -----------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.orgs        enable row level security;
alter table public.members     enable row level security;
alter table public.patients    enable row level security;
alter table public.sessions    enable row level security;
alter table public.acoustic    enable row level security;
alter table public.audio_files enable row level security;
alter table public.lexicon     enable row level security;
alter table public.audit       enable row level security;
alter table public.words       enable row level security;
alter table public.media_files enable row level security;
alter table public.materials   enable row level security;

-- profiles: kendi profiliniz + ortak ekipteki kişiler; yalnızca kendi ad/unvanınızı değiştirebilirsiniz
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- orgs: üyeler görür, yöneticiler ad/ayar değiştirir (oluşturma create_org ile)
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs for select to authenticated
  using (id in (select public.my_orgs(1)));
drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs for update to authenticated
  using (id in (select public.my_orgs(3))) with check (id in (select public.my_orgs(3)));

-- members: üyeler listeyi görür (değişiklikler yalnızca fonksiyonlarla)
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (org_id in (select public.my_orgs(1)) or user_id = (select auth.uid()));

-- Klinik veriler: görüntüleme ≥ viewer, yazma ≥ clinician
do $$
declare t text;
begin
  foreach t in array array['patients', 'sessions', 'acoustic', 'audio_files', 'lexicon', 'words', 'media_files', 'materials'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (org_id in (select public.my_orgs(1)))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (org_id in (select public.my_orgs(2)))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (org_id in (select public.my_orgs(2))) with check (org_id in (select public.my_orgs(2)))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (org_id in (select public.my_orgs(2)))', t || '_delete', t);
  end loop;
end $$;

-- audit: üyeler okur ve kendi adına yazar; kimse değiştiremez/silemez
drop policy if exists audit_select on public.audit;
create policy audit_select on public.audit for select to authenticated
  using (org_id in (select public.my_orgs(1)));
drop policy if exists audit_insert on public.audit;
create policy audit_insert on public.audit for insert to authenticated
  with check (org_id in (select public.my_orgs(1)));

-- -----------------------------------------------------------------------------
-- 6) Erişim izinleri (anonim erişim yok; güncellenebilir sütunlar sınırlı)
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.orgs, public.members, public.patients, public.sessions,
              public.acoustic, public.audio_files, public.lexicon, public.audit,
              public.words, public.media_files, public.materials from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.orgs, public.members, public.patients, public.sessions,
                public.acoustic, public.audio_files, public.lexicon, public.audit,
                public.words, public.media_files, public.materials to authenticated;
grant insert, update, delete on public.patients, public.sessions, public.acoustic,
                                public.audio_files, public.lexicon,
                                public.words, public.media_files, public.materials to authenticated;
grant insert on public.audit to authenticated;
grant update (name, title) on public.profiles to authenticated;
grant update (name, settings) on public.orgs to authenticated;

revoke execute on function public.on_login(), public.create_org(text, jsonb), public.add_member(uuid, text, text),
  public.set_member_role(uuid, text), public.remove_member(uuid), public.org_storage_bytes(uuid),
  public.my_orgs(integer), public.my_rank(uuid), public.shares_org(uuid), public.role_rank(text)
  from public, anon;
grant execute on function public.on_login(), public.create_org(text, jsonb), public.add_member(uuid, text, text),
  public.set_member_role(uuid, text), public.remove_member(uuid), public.org_storage_bytes(uuid),
  public.my_orgs(integer), public.my_rank(uuid), public.shares_org(uuid), public.role_rank(text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 7) Ses deposu: gizli "recordings" kovası; yol <org_id>/<session_id>/…
--    (ücretsiz planda dosya başına 50 MB sınırı vardır; uygulama büyük
--     kayıtları otomatik olarak parçalara bölerek yükler)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 52428800, array['audio/*', 'video/*', 'application/octet-stream'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists morphologai_recordings_select on storage.objects;
create policy morphologai_recordings_select on storage.objects for select to authenticated
  using (bucket_id = 'recordings'
         and (storage.foldername(name))[1] in (select o::text from public.my_orgs(1) as o));
drop policy if exists morphologai_recordings_insert on storage.objects;
create policy morphologai_recordings_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
              and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o));
drop policy if exists morphologai_recordings_update on storage.objects;
create policy morphologai_recordings_update on storage.objects for update to authenticated
  using (bucket_id = 'recordings'
         and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o))
  with check (bucket_id = 'recordings'
              and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o));
drop policy if exists morphologai_recordings_delete on storage.objects;
create policy morphologai_recordings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recordings'
         and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o));

-- -----------------------------------------------------------------------------
-- 9) Ev programı: şifresiz danışan bağlantısı ve günlük kayıtlar
--    Danışan / aile tarafı oturum açmaz (anon). Tablolara anon erişimi YOKTUR; yalnızca iki
--    "security definer" işlev çağrılabilir: link_get ve link_log. Bağlantı anahtarı 128 bit
--    rastgeledir; veritabanında yalnızca SHA-256 özeti tutulur. İşlevler ad, tanı, seans ya da
--    ses verisi döndürmez; yalnızca klinisyenin paylaşmak üzere yazdığı ev programını döndürür.
-- -----------------------------------------------------------------------------
create table if not exists public.patient_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  patient_id  uuid not null,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  hits        integer not null default 0,
  hits_window timestamptz not null default now(),
  last_seen_at timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint patient_links_patient_fk foreign key (org_id, patient_id)
    references public.patients (org_id, id) on delete cascade
);
create index if not exists patient_links_patient_idx on public.patient_links (patient_id);

create table if not exists public.home_logs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  patient_id uuid not null,
  day        date not null,
  done       boolean not null,
  slot       text not null default '' check (slot in ('', 'sabah', 'ogle', 'aksam')),
  note       text not null default '' check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  constraint home_logs_patient_day_key unique (patient_id, day),
  constraint home_logs_patient_fk foreign key (org_id, patient_id)
    references public.patients (org_id, id) on delete cascade
);

drop trigger if exists stamp on public.patient_links;
create trigger stamp before insert or update on public.patient_links for each row execute function public.tg_stamp();

alter table public.patient_links enable row level security;
alter table public.home_logs     enable row level security;
drop policy if exists patient_links_select on public.patient_links;
create policy patient_links_select on public.patient_links for select to authenticated using (org_id in (select public.my_orgs(1)));
drop policy if exists patient_links_insert on public.patient_links;
create policy patient_links_insert on public.patient_links for insert to authenticated with check (org_id in (select public.my_orgs(2)));
drop policy if exists patient_links_update on public.patient_links;
create policy patient_links_update on public.patient_links for update to authenticated
  using (org_id in (select public.my_orgs(2))) with check (org_id in (select public.my_orgs(2)));
drop policy if exists patient_links_delete on public.patient_links;
create policy patient_links_delete on public.patient_links for delete to authenticated using (org_id in (select public.my_orgs(2)));
drop policy if exists home_logs_select on public.home_logs;
create policy home_logs_select on public.home_logs for select to authenticated using (org_id in (select public.my_orgs(1)));
drop policy if exists home_logs_delete on public.home_logs;
create policy home_logs_delete on public.home_logs for delete to authenticated using (org_id in (select public.my_orgs(2)));

revoke all on public.patient_links, public.home_logs from anon, authenticated;
grant select, insert, delete on public.patient_links to authenticated;
grant update (revoked_at) on public.patient_links to authenticated;   -- yalnız iptal edilebilir
grant select, delete on public.home_logs to authenticated;            -- kayıtları yalnız link_log yazar

-- Anahtarı çözer; geçersiz, süresi dolmuş ya da iptal edilmişse NULL. Bağlantı başına saatte 240 istek.
create or replace function public.link_resolve(p_token text)
returns public.patient_links language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.patient_links;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32,64}$' then return null; end if;
  select * into l from public.patient_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found or l.revoked_at is not null or l.expires_at < now() then return null; end if;
  if l.hits_window < now() - interval '1 hour' then
    update public.patient_links set hits = 1, hits_window = now(), last_seen_at = now() where id = l.id;
  elsif l.hits >= 240 then
    raise exception 'Çok fazla istek. Bir süre sonra yeniden deneyin.' using errcode = '54000';
  else
    update public.patient_links set hits = hits + 1, last_seen_at = now() where id = l.id;
  end if;
  return l;
end $$;

-- Danışan ekranının okuduğu veri: paylaşılan ev programı ve son 14 günün kayıtları
create or replace function public.link_get(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.patient_links; v_home jsonb;
begin
  l := public.link_resolve(p_token);
  if l.id is null then return null; end if;
  select coalesce(p.data -> 'plan' -> 'home', '{}'::jsonb) into v_home from public.patients p where p.id = l.patient_id;
  return jsonb_build_object(
    'home', coalesce(v_home, '{}'::jsonb),
    'expiresAt', l.expires_at,
    'today', current_date,
    'logs', (select coalesce(jsonb_agg(jsonb_build_object('day', h.day, 'done', h.done, 'slot', h.slot, 'note', h.note) order by h.day desc), '[]'::jsonb)
               from public.home_logs h where h.patient_id = l.patient_id and h.day >= current_date - 13));
end $$;

-- Günlük kayıt: yalnız bugün ve dün (saat dilimi payıyla yarın) yazılabilir
create or replace function public.link_log(p_token text, p_day date, p_done boolean, p_slot text default '', p_note text default '')
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.patient_links;
begin
  l := public.link_resolve(p_token);
  if l.id is null then return false; end if;
  if p_day is null or p_done is null or p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'Yalnızca bugün ve dün için kayıt girilebilir.' using errcode = '22023';
  end if;
  if coalesce(p_slot, '') not in ('', 'sabah', 'ogle', 'aksam') then
    raise exception 'Geçersiz zaman dilimi.' using errcode = '22023';
  end if;
  insert into public.home_logs (org_id, patient_id, day, done, slot, note)
  values (l.org_id, l.patient_id, p_day, p_done, coalesce(p_slot, ''), left(coalesce(p_note, ''), 500))
  on conflict (patient_id, day) do update
    set done = excluded.done, slot = excluded.slot, note = excluded.note, updated_at = now();
  return true;
end $$;

revoke execute on function public.link_resolve(text), public.link_get(text), public.link_log(text, date, boolean, text, text) from public, anon, authenticated;
grant usage on schema public to anon;
grant execute on function public.link_get(text), public.link_log(text, date, boolean, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8) Görsel deposu: gizli "media" kovası; yol <org_id>/<görsel_id>.<uzantı>
--    (yalnız PNG/JPEG/WebP, dosya başına 5 MB)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists morphologai_media_select on storage.objects;
create policy morphologai_media_select on storage.objects for select to authenticated
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] in (select o::text from public.my_orgs(1) as o));
drop policy if exists morphologai_media_insert on storage.objects;
create policy morphologai_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o));
drop policy if exists morphologai_media_update on storage.objects;
create policy morphologai_media_update on storage.objects for update to authenticated
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o))
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o));
drop policy if exists morphologai_media_delete on storage.objects;
create policy morphologai_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] in (select o::text from public.my_orgs(2) as o));

-- Bitti. Kontrol:  select * from public.orgs;  (henüz boş olmalı)
