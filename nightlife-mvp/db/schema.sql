-- ============================================================================
--  NOCHE · Esquema PostgreSQL / Supabase
--  MVP hackathon 36 h · Postgres 15+, PostGIS, pgcrypto
--
--  Ejecutar en un proyecto Supabase NUEVO (SQL Editor) o con `supabase db reset`.
--  Convenciones:
--    · dinero en céntimos (integer / bigint), nunca float
--    · timestamps siempre timestamptz
--    · escaneos append-only
--    · RLS activo en todas las tablas; el service role salta RLS
-- ============================================================================

set search_path = public, extensions;

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- 0. Tipos
-- ---------------------------------------------------------------------------
create type public.event_status     as enum ('draft','on_sale','sold_out','live','ended','cancelled');
create type public.ticket_status    as enum ('issued','listed','used','void');
create type public.order_status     as enum ('pending','paid','cancelled','refunded','failed');
create type public.listing_status   as enum ('active','sold','cancelled','expired','settled');
create type public.scan_direction   as enum ('in','out');
create type public.scan_result      as enum ('ok','duplicate','invalid','expired','wrong_event','capacity_full','revoked','not_found');
create type public.queue_status     as enum ('waiting','called','entered','expired','cancelled');
create type public.fastpass_status  as enum ('purchased','used','expired','refunded');
create type public.bar_status       as enum ('pending','preparing','ready','delivered','cancelled');
create type public.media_kind       as enum ('photo','video');
create type public.moderation_status as enum ('pending','approved','rejected');
create type public.album_status     as enum ('collecting','sealed','revealed','archived');
create type public.recap_status     as enum ('queued','rendering','ready','failed');
create type public.ride_status      as enum ('draft','scheduled','searching','assigned','arriving','in_progress','completed','cancelled');
create type public.split_mode       as enum ('organizer','equal');
create type public.ride_pay_status  as enum ('pending','paid','waived');
create type public.payment_kind     as enum ('ticket','resale','fast_pass','bar','ride');
create type public.payment_status   as enum ('requires_capture','captured','refunded','failed','cancelled');
create type public.account_type     as enum ('user','platform','escrow');

-- ---------------------------------------------------------------------------
-- 1. Configuración y reloj de demo
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                     int primary key default 1 check (id = 1),
  demo_offset            interval not null default interval '0',
  demo_geofence_override boolean  not null default false,
  updated_at             timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- Reloj de aplicación: permite demostrar el "revelado matutino" sin esperar.
create or replace function public.app_now()
returns timestamptz
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select now() + coalesce((select demo_offset from public.app_settings where id = 1), interval '0');
$$;

-- Próxima 10:00 en la timezone del local.
-- Si la noche acaba de madrugada (antes de las 10:00), el álbum se abre
-- esa misma mañana; si se crea por la tarde, se abre al día siguiente.
create or replace function public.next_reveal(p_from timestamptz, p_tz text default 'Europe/Madrid')
returns timestamptz
language sql
immutable
as $$
  select case
    when (p_from at time zone p_tz)::time < time '10:00'
      then ((date_trunc('day', p_from at time zone p_tz) + interval '10 hours') at time zone p_tz)
    else ((date_trunc('day', p_from at time zone p_tz) + interval '1 day 10 hours') at time zone p_tz)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Identidad
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  handle            text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name      text not null check (char_length(display_name) between 1 and 40),
  avatar_url        text,
  birth_date        date not null,
  home_city         text,
  is_demo           boolean not null default false,
  stripe_account_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.profiles (id, handle, display_name, birth_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'handle', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'Invitado'),
    coalesce((new.raw_user_meta_data->>'birth_date')::date, date '2000-01-01')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Locales y eventos
-- ---------------------------------------------------------------------------
create table public.venues (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  address           text,
  city              text not null,
  timezone          text not null default 'Europe/Madrid',
  location          geography(point, 4326) not null,
  geofence_radius_m int not null default 150 check (geofence_radius_m between 50 and 1000),
  capacity_legal    int not null check (capacity_legal > 0),
  logo_url          text,
  created_at        timestamptz not null default now()
);

create table public.events (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  name           text not null,
  description    text,
  doors_at       timestamptz not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  capacity_total int not null check (capacity_total > 0),
  status         public.event_status not null default 'draft',
  cover_url      text,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.events (venue_id, starts_at desc);

-- Proyección de aforo: una fila por evento, actualizada de forma atómica.
create table public.venue_live (
  event_id      uuid primary key references public.events(id) on delete cascade,
  occupancy     int not null default 0 check (occupancy >= 0),
  capacity      int not null,
  waiting_count int not null default 0,
  wait_minutes  int not null default 0,
  service_rate  numeric(6,2) not null default 0,
  trend         numeric(6,2) not null default 0,
  updated_at    timestamptz not null default now()
);

create or replace function public.init_venue_live()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.venue_live (event_id, capacity)
  values (new.id, new.capacity_total)
  on conflict (event_id) do nothing;
  return new;
end;
$$;

create trigger events_init_live
  after insert on public.events
  for each row execute function public.init_venue_live();

-- ---------------------------------------------------------------------------
-- 4. Entradas
-- ---------------------------------------------------------------------------
create table public.ticket_tiers (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  name             text not null,
  description      text,
  face_value_cents int not null check (face_value_cents >= 0),
  currency         char(3) not null default 'EUR',
  quantity         int not null check (quantity > 0),
  sold_count       int not null default 0 check (sold_count >= 0),
  max_per_user     int not null default 4 check (max_per_user between 1 and 10),
  sales_start      timestamptz,
  sales_end        timestamptz,
  created_at       timestamptz not null default now(),
  check (sold_count <= quantity)
);
create index on public.ticket_tiers (event_id);

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  buyer_id       uuid not null references public.profiles(id) on delete restrict,
  event_id       uuid not null references public.events(id) on delete restrict,
  status         public.order_status not null default 'pending',
  subtotal_cents int not null default 0,
  fees_cents     int not null default 0,
  total_cents    int not null default 0,
  currency       char(3) not null default 'EUR',
  payment_id     uuid,
  created_at     timestamptz not null default now()
);
create index on public.orders (buyer_id, created_at desc);

create table public.tickets (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  event_id         uuid not null references public.events(id) on delete cascade,
  tier_id          uuid not null references public.ticket_tiers(id) on delete restrict,
  owner_id         uuid not null references public.profiles(id) on delete restrict,
  status           public.ticket_status not null default 'issued',
  face_value_cents int not null check (face_value_cents >= 0),
  totp_secret      bytea not null default gen_random_bytes(20),
  qr_version       int not null default 1,
  used_at          timestamptz,
  exited_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index on public.tickets (owner_id, status);
create index on public.tickets (event_id, status);

create or replace function public.count_sold_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.ticket_tiers
     set sold_count = sold_count + 1
   where id = new.tier_id;
  if not found then
    raise exception 'TIER_NOT_FOUND';
  end if;
  return new;
end;
$$;

create trigger tickets_count_sold
  after insert on public.tickets
  for each row execute function public.count_sold_ticket();

-- ---------------------------------------------------------------------------
-- 5. Reventa P2P
-- ---------------------------------------------------------------------------
create table public.ticket_listings (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references public.tickets(id) on delete cascade,
  seller_id        uuid not null references public.profiles(id) on delete restrict,
  buyer_id         uuid references public.profiles(id) on delete set null,
  price_cents      int not null check (price_cents > 0),
  face_value_cents int not null check (face_value_cents >= 0),
  status           public.listing_status not null default 'active',
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  sold_at          timestamptz,
  -- tope duro: 110 % del nominal
  constraint listing_price_cap check (price_cents <= floor(face_value_cents * 1.10)),
  constraint listing_distinct_parties check (buyer_id is null or buyer_id <> seller_id)
);

create unique index one_active_listing_per_ticket
  on public.ticket_listings (ticket_id)
  where status = 'active';
create index on public.ticket_listings (status, expires_at);

create or replace function public.validate_listing()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_face   int;
  v_owner  uuid;
  v_status public.ticket_status;
begin
  select face_value_cents, owner_id, status
    into v_face, v_owner, v_status
    from public.tickets where id = new.ticket_id;

  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_owner <> new.seller_id then raise exception 'NOT_TICKET_OWNER'; end if;
  if v_status <> 'issued' then raise exception 'TICKET_NOT_TRANSFERABLE'; end if;

  new.face_value_cents := v_face;
  if new.price_cents > floor(v_face * 1.10) then
    raise exception 'PRICE_CAP_EXCEEDED';
  end if;
  if new.expires_at is null then
    new.expires_at := now() + interval '6 hours';
  end if;
  return new;
end;
$$;

create trigger ticket_listings_validate
  before insert on public.ticket_listings
  for each row execute function public.validate_listing();

-- ---------------------------------------------------------------------------
-- 6. Pagos y libro mayor
-- ---------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete restrict,
  kind         public.payment_kind not null,
  ref_type     text not null,
  ref_id       uuid,
  amount_cents int not null check (amount_cents > 0),
  currency     char(3) not null default 'EUR',
  provider     text not null default 'stripe',
  provider_ref text,
  status       public.payment_status not null default 'requires_capture',
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index on public.payments (user_id, created_at desc);

-- Asientos con signo: débito negativo, crédito positivo. La suma por transacción = 0.
create table public.ledger_entries (
  id           bigint generated always as identity primary key,
  ref_type     text not null,
  ref_id       uuid not null,
  account_type public.account_type not null,
  user_id      uuid references public.profiles(id) on delete set null,
  amount_cents bigint not null,
  currency     char(3) not null default 'EUR',
  memo         text,
  created_at   timestamptz not null default now(),
  check (amount_cents <> 0),
  check ((account_type = 'user') = (user_id is not null))
);
create index on public.ledger_entries (ref_type, ref_id);
create index on public.ledger_entries (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Aforo y escaneos
-- ---------------------------------------------------------------------------
create table public.scan_events (
  id              bigint generated always as identity primary key,
  ticket_id       uuid not null references public.tickets(id) on delete restrict,
  event_id        uuid not null references public.events(id) on delete restrict,
  scanner_id      uuid references public.profiles(id) on delete set null,
  direction       public.scan_direction not null default 'in',
  result          public.scan_result not null,
  code_counter    bigint not null,
  device_id       text,
  idempotency_key uuid,
  scanned_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);
create unique index scan_once_per_code
  on public.scan_events (ticket_id, code_counter)
  where result = 'ok';
create unique index scan_idempotency
  on public.scan_events (idempotency_key)
  where idempotency_key is not null;
create index on public.scan_events (event_id, scanned_at desc);

-- ---------------------------------------------------------------------------
-- 8. Cola virtual y Fast-Pass
-- ---------------------------------------------------------------------------
create table public.queue_entries (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  group_id       uuid,
  party_size     int not null default 1 check (party_size between 1 and 10),
  priority       int not null default 0 check (priority between 0 and 100),
  queue_position int,
  status         public.queue_status not null default 'waiting',
  joined_at      timestamptz not null default now(),
  called_at      timestamptz,
  expires_at     timestamptz,
  entered_at     timestamptz
);
create unique index one_active_queue_entry
  on public.queue_entries (event_id, user_id)
  where status in ('waiting','called');
create index on public.queue_entries (event_id, status, priority desc, joined_at);

create table public.fast_passes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  payment_id  uuid references public.payments(id) on delete set null,
  price_cents int not null check (price_cents > 0),
  status      public.fastpass_status not null default 'purchased',
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- 9. Grupos
-- ---------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  event_id    uuid references public.events(id) on delete set null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_at  timestamptz not null default now(),
  dissolved_at timestamptz
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 10. Barra
-- ---------------------------------------------------------------------------
create table public.bar_items (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null,
  category    text not null default 'drink',
  price_cents int not null check (price_cents >= 0),
  stock       int check (stock is null or stock >= 0),
  active      boolean not null default true
);

create table public.bar_orders (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete restrict,
  group_id    uuid references public.groups(id) on delete set null,
  status      public.bar_status not null default 'pending',
  pickup_code text not null,
  qr_table    text,
  total_cents int not null default 0,
  created_at  timestamptz not null default now(),
  ready_at    timestamptz,
  delivered_at timestamptz
);
create index on public.bar_orders (event_id, status, created_at);

create table public.bar_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.bar_orders(id) on delete cascade,
  item_id          uuid not null references public.bar_items(id) on delete restrict,
  name_snapshot    text not null,
  qty              int not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0)
);

-- ---------------------------------------------------------------------------
-- 11. Radar social efímero
-- ---------------------------------------------------------------------------
create table public.social_optins (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  geohash7   text not null check (char_length(geohash7) = 7),
  vibe       text[] not null default '{}',
  visible    boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index on public.social_optins (event_id, geohash7) where visible;

create table public.social_matches (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (user_a < user_b)
);
create unique index one_match_per_pair on public.social_matches (event_id, user_a, user_b);

-- ---------------------------------------------------------------------------
-- 12. Álbum y recap
-- ---------------------------------------------------------------------------
create table public.albums (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.groups(id) on delete set null,
  event_id    uuid not null references public.events(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  title       text not null default 'Nuestra noche',
  cover_asset_id uuid,
  status      public.album_status not null default 'collecting',
  unlock_at   timestamptz not null,
  created_at  timestamptz not null default now()
);

create or replace function public.albums_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tz text;
begin
  select v.timezone into v_tz
    from public.events e join public.venues v on v.id = e.venue_id
   where e.id = new.event_id;

  if new.unlock_at is null then
    new.unlock_at := public.next_reveal(now(), coalesce(v_tz, 'Europe/Madrid'));
  end if;
  return new;
end;
$$;

create trigger albums_set_unlock
  before insert on public.albums
  for each row execute function public.albums_before_insert();

create table public.album_members (
  album_id   uuid not null references public.albums(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  can_upload boolean not null default true,
  added_at   timestamptz not null default now(),
  primary key (album_id, user_id)
);

create table public.media_assets (
  id                uuid primary key default gen_random_uuid(),
  album_id          uuid not null references public.albums(id) on delete cascade,
  uploader_id       uuid not null references public.profiles(id) on delete cascade,
  kind              public.media_kind not null,
  storage_path      text not null unique,
  thumb_path        text,
  width             int,
  height            int,
  duration_ms       int,
  size_bytes        bigint,
  captured_at       timestamptz not null default now(),
  uploaded_at       timestamptz not null default now(),
  moderation_status public.moderation_status not null default 'pending',
  phash             text
);
create index on public.media_assets (album_id, captured_at);

create table public.recaps (
  id           uuid primary key default gen_random_uuid(),
  album_id     uuid not null unique references public.albums(id) on delete cascade,
  status       public.recap_status not null default 'queued',
  video_url    text,
  thumb_url    text,
  template     text not null default 'night-v1',
  ai_caption   text,
  duration_ms  int,
  error        text,
  created_at   timestamptz not null default now(),
  published_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 13. Movilidad
-- ---------------------------------------------------------------------------
create table public.ride_bookings (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  group_id            uuid references public.groups(id) on delete set null,
  organizer_id        uuid not null references public.profiles(id) on delete restrict,
  provider            text not null default 'uber',
  scheduled_at        timestamptz not null,
  pickup_point        text not null,
  pickup_lat          double precision,
  pickup_lng          double precision,
  dropoff_point       text,
  party_size          int not null default 1 check (party_size between 1 and 4),
  fare_estimate_cents int not null check (fare_estimate_cents >= 0),
  split_mode          public.split_mode not null default 'equal',
  status              public.ride_status not null default 'scheduled',
  join_code           text not null unique
                      default 'NOCHE-' || lpad(((floor(random() * 900) + 100)::int)::text, 3, '0'),
  safety_pin          char(4) not null
                      default lpad(((floor(random() * 9000) + 1000)::int)::text, 4, '0'),
  driver_name         text,
  vehicle_plate       text,
  eta_minutes         int check (eta_minutes is null or eta_minutes >= 0),
  external_ref        text,
  created_at          timestamptz not null default now()
);

create table public.ride_participants (
  ride_id        uuid not null references public.ride_bookings(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  dropoff_point  text,
  pickup_order   int not null default 1 check (pickup_order >= 1),
  share_cents    int not null default 0 check (share_cents >= 0),
  payment_status public.ride_pay_status not null default 'pending',
  joined_at      timestamptz not null default now(),
  primary key (ride_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 14. Notificaciones y auditoría
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15. Funciones de negocio
-- ---------------------------------------------------------------------------

-- 15.1 Entrar en la cola (valida geofence en servidor)
create or replace function public.join_queue(
  p_event uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default 50,
  p_party_size int default 1
)
returns table (status public.queue_status, queue_position int, wait_minutes int, priority int)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_venue  public.venues%rowtype;
  v_prio   int := 0;
  v_entry  public.queue_entries%rowtype;
  v_pos    int;
  v_wait   int;
  v_demo   boolean;
  v_bypass boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select v.* into v_venue
    from public.events e join public.venues v on v.id = e.venue_id
   where e.id = p_event and e.status in ('on_sale','live');
  if not found then raise exception 'EVENT_NOT_AVAILABLE'; end if;

  select is_demo into v_demo from public.profiles where id = v_uid;
  select demo_geofence_override into v_bypass from public.app_settings where id = 1;

  if not (coalesce(v_demo,false) or coalesce(v_bypass,false)) then
    if p_accuracy is null or p_accuracy > 100 then raise exception 'GPS_ACCURACY_LOW'; end if;
    if not st_dwithin(
      v_venue.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      v_venue.geofence_radius_m
    ) then
      raise exception 'OUTSIDE_GEOFENCE';
    end if;
  end if;

  -- serializa por (evento, usuario) para evitar doble tap
  perform pg_advisory_xact_lock(hashtextextended(p_event::text || v_uid::text, 0));

  select * into v_entry
    from public.queue_entries q
   where q.event_id = p_event and q.user_id = v_uid and q.status in ('waiting','called')
   for update;

  if not found then
    if exists (select 1 from public.fast_passes fp
                where fp.event_id = p_event and fp.user_id = v_uid and fp.status = 'purchased') then
      v_prio := 10;
    end if;

    insert into public.queue_entries (event_id, user_id, party_size, priority)
    values (p_event, v_uid, greatest(1, least(p_party_size, 10)), v_prio)
    returning * into v_entry;
  end if;

  select count(*) + 1 into v_pos
    from public.queue_entries q
   where q.event_id = p_event
     and q.status = 'waiting'
     and (q.priority > v_entry.priority
          or (q.priority = v_entry.priority and q.joined_at < v_entry.joined_at));

  update public.queue_entries set queue_position = v_pos where id = v_entry.id;

  select coalesce(vl.wait_minutes, 15) into v_wait
    from public.venue_live vl where vl.event_id = p_event;

  return query select v_entry.status, v_pos, coalesce(v_wait, 15), v_entry.priority;
end;
$$;

create or replace function public.leave_queue(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.queue_entries
     set status = 'cancelled'
   where event_id = p_event and user_id = auth.uid() and status in ('waiting','called');
end;
$$;

-- 15.2 Crear listing P2P (valida propiedad y tope)
create or replace function public.create_listing(
  p_ticket uuid,
  p_price_cents int,
  p_ttl interval default interval '6 hours'
)
returns public.ticket_listings
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_t   public.tickets%rowtype;
  v_l   public.ticket_listings%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_t from public.tickets where id = p_ticket for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_t.owner_id <> v_uid then raise exception 'NOT_TICKET_OWNER'; end if;
  if v_t.status <> 'issued' then raise exception 'TICKET_NOT_TRANSFERABLE'; end if;
  if p_price_cents > floor(v_t.face_value_cents * 1.10) then
    raise exception 'PRICE_CAP_EXCEEDED';
  end if;

  insert into public.ticket_listings
    (ticket_id, seller_id, price_cents, face_value_cents, expires_at)
  values
    (p_ticket, v_uid, p_price_cents, v_t.face_value_cents, now() + p_ttl)
  returning * into v_l;

  update public.tickets set status = 'listed' where id = p_ticket;

  return v_l;
end;
$$;

create or replace function public.cancel_listing(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_l   public.ticket_listings%rowtype;
begin
  select * into v_l from public.ticket_listings where id = p_listing for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_l.seller_id <> v_uid then raise exception 'NOT_SELLER'; end if;
  if v_l.status <> 'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;

  update public.ticket_listings set status = 'cancelled' where id = p_listing;
  update public.tickets set status = 'issued' where id = v_l.ticket_id;
end;
$$;

-- 15.3 Comprar listing (atómico + reemisión de secreto TOTP)
create or replace function public.purchase_listing(
  p_listing uuid,
  p_payment uuid
)
returns table (ticket_id uuid, qr_version int, price_cents int)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_l    public.ticket_listings%rowtype;
  v_t    public.tickets%rowtype;
  v_pay  public.payments%rowtype;
  v_fee  int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_l from public.ticket_listings where id = p_listing for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_l.status <> 'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;
  if v_l.expires_at <= now() then raise exception 'LISTING_EXPIRED'; end if;
  if v_l.seller_id = v_uid then raise exception 'CANNOT_BUY_OWN_TICKET'; end if;

  select * into v_t from public.tickets where id = v_l.ticket_id for update;
  if v_t.owner_id <> v_l.seller_id or v_t.status <> 'listed' then
    raise exception 'TICKET_STATE_CHANGED';
  end if;
  if v_l.price_cents > floor(v_t.face_value_cents * 1.10) then
    raise exception 'PRICE_CAP_EXCEEDED';
  end if;

  select * into v_pay from public.payments where id = p_payment;
  if not found or v_pay.user_id <> v_uid or v_pay.status <> 'captured'
     or v_pay.kind <> 'resale' or v_pay.amount_cents < v_l.price_cents then
    raise exception 'PAYMENT_NOT_VALID';
  end if;

  -- el QR anterior muere aquí: nuevo secreto + versión
  update public.tickets t
     set owner_id = v_uid,
         status = 'issued',
         totp_secret = gen_random_bytes(20),
         qr_version = t.qr_version + 1,
         used_at = null,
         exited_at = null
   where t.id = v_t.id
  returning * into v_t;

  update public.ticket_listings
     set status = 'sold', buyer_id = v_uid, sold_at = now()
   where id = v_l.id;

  insert into public.ledger_entries (ref_type, ref_id, account_type, user_id, amount_cents, memo)
  values
    ('listing', v_l.id, 'user',  v_uid,       -v_l.price_cents, 'compra reventa'),
    ('listing', v_l.id, 'escrow', null,        v_l.price_cents, 'fondos retenidos');

  return query select v_t.id, v_t.qr_version, v_l.price_cents;
end;
$$;

-- 15.4 Liquidar al vendedor tras el evento (service role / cron)
create or replace function public.settle_listing(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_l   public.ticket_listings%rowtype;
  v_fee int;
begin
  select * into v_l from public.ticket_listings where id = p_listing for update;
  if not found or v_l.status <> 'sold' then raise exception 'LISTING_NOT_SETTLED'; end if;

  if not exists (
    select 1 from public.events e
     where e.id = (select event_id from public.tickets where id = v_l.ticket_id)
       and e.ends_at < now()
  ) then
    raise exception 'EVENT_NOT_ENDED';
  end if;

  v_fee := floor(v_l.price_cents * 0.08); -- comisión plataforma 8 %

  insert into public.ledger_entries (ref_type, ref_id, account_type, user_id, amount_cents, memo)
  values
    ('listing', v_l.id, 'escrow',   null,          -v_l.price_cents, 'liberación escrow'),
    ('listing', v_l.id, 'user',     v_l.seller_id,  v_l.price_cents - v_fee, 'venta reventa'),
    ('listing', v_l.id, 'platform', null,           v_fee, 'comisión 8 %');

  update public.ticket_listings set status = 'settled' where id = v_l.id;
end;
$$;

-- 15.5 Escaneo atómico (SOLO service role; el TOTP se verifica en la Edge Function)
create or replace function public.commit_scan(
  p_ticket uuid,
  p_event uuid,
  p_counter bigint,
  p_direction public.scan_direction default 'in',
  p_device text default null,
  p_idempotency uuid default null,
  p_scanner uuid default null
)
returns table (ok boolean, reason text, occupancy int, capacity int)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_t     public.tickets%rowtype;
  v_occ   int;
  v_cap   int;
  v_prev  public.scan_events%rowtype;
begin
  -- fast path idempotente
  if p_idempotency is not null then
    select * into v_prev from public.scan_events where idempotency_key = p_idempotency;
    if found then
      select vl.occupancy, vl.capacity into v_occ, v_cap
        from public.venue_live vl where vl.event_id = v_prev.event_id;
      return query select (v_prev.result = 'ok'), v_prev.result::text, v_occ, v_cap;
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event::text, 0));

  -- re-check tras el lock (dos peticiones idénticas)
  if p_idempotency is not null then
    select * into v_prev from public.scan_events where idempotency_key = p_idempotency;
    if found then
      select vl.occupancy, vl.capacity into v_occ, v_cap
        from public.venue_live vl where vl.event_id = v_prev.event_id;
      return query select (v_prev.result = 'ok'), v_prev.result::text, v_occ, v_cap;
      return;
    end if;
  end if;

  select * into v_t from public.tickets where id = p_ticket for update;
  if not found then
    return query select false, 'not_found'::text, null::int, null::int;
    return;
  end if;

  if v_t.event_id <> p_event then
    insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
    values (p_ticket, p_event, p_scanner, p_direction, 'wrong_event', p_counter, p_device, p_idempotency);
    return query select false, 'wrong_event'::text, null::int, null::int;
    return;
  end if;

  insert into public.venue_live (event_id, capacity)
  values (p_event, (select capacity_total from public.events where id = p_event))
  on conflict (event_id) do nothing;

  select vl.occupancy, vl.capacity into v_occ, v_cap
    from public.venue_live vl where vl.event_id = p_event for update;

  -- replay del mismo código
  if exists (
    select 1 from public.scan_events
     where ticket_id = p_ticket and code_counter = p_counter and result = 'ok'
  ) then
    insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
    values (p_ticket, p_event, p_scanner, p_direction, 'duplicate', p_counter, p_device, p_idempotency);
    return query select false, 'duplicate_code'::text, v_occ, v_cap;
    return;
  end if;

  if p_direction = 'in' then
    if v_t.status = 'void' then
      insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
      values (p_ticket, p_event, p_scanner, p_direction, 'revoked', p_counter, p_device, p_idempotency);
      return query select false, 'revoked'::text, v_occ, v_cap;
      return;
    end if;

    if v_t.status = 'used' then
      insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
      values (p_ticket, p_event, p_scanner, p_direction, 'duplicate', p_counter, p_device, p_idempotency);
      return query select false, 'already_used'::text, v_occ, v_cap;
      return;
    end if;

    if v_t.status <> 'issued' then
      insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
      values (p_ticket, p_event, p_scanner, p_direction, 'invalid', p_counter, p_device, p_idempotency);
      return query select false, 'invalid_state'::text, v_occ, v_cap;
      return;
    end if;

    if v_occ >= v_cap then
      insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
      values (p_ticket, p_event, p_scanner, p_direction, 'capacity_full', p_counter, p_device, p_idempotency);
      return query select false, 'capacity_full'::text, v_occ, v_cap;
      return;
    end if;

    insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
    values (p_ticket, p_event, p_scanner, p_direction, 'ok', p_counter, p_device, p_idempotency);

    update public.tickets set status = 'used', used_at = now() where id = p_ticket;

    update public.venue_live vl
       set occupancy = vl.occupancy + 1, updated_at = now()
     where vl.event_id = p_event
    returning vl.occupancy into v_occ;

    return query select true, 'ok'::text, v_occ, v_cap;

  else -- salida
    if v_t.status <> 'used' or v_t.exited_at is not null then
      insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
      values (p_ticket, p_event, p_scanner, p_direction, 'invalid', p_counter, p_device, p_idempotency);
      return query select false, 'invalid_exit'::text, v_occ, v_cap;
      return;
    end if;

    insert into public.scan_events (ticket_id, event_id, scanner_id, direction, result, code_counter, device_id, idempotency_key)
    values (p_ticket, p_event, p_scanner, p_direction, 'ok', p_counter, p_device, p_idempotency);

    update public.tickets set exited_at = now() where id = p_ticket;
    update public.venue_live vl
       set occupancy = greatest(vl.occupancy - 1, 0), updated_at = now()
     where vl.event_id = p_event
    returning vl.occupancy into v_occ;

    return query select true, 'ok'::text, v_occ, v_cap;
  end if;
end;
$$;

-- 15.6 Recalcular espera y posiciones (cron cada 30 s)
create or replace function public.recalc_venue_live(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_in      int;
  v_out     int;
  v_waiting int;
  v_rate    numeric;
  v_wait    int;
begin
  select count(*) filter (where direction = 'in' and result = 'ok'),
         count(*) filter (where direction = 'out' and result = 'ok')
    into v_in, v_out
    from public.scan_events
   where event_id = p_event and scanned_at > now() - interval '15 minutes';

  select count(*) into v_waiting
    from public.queue_entries
   where event_id = p_event and status = 'waiting';

  v_rate := round(v_in::numeric / 15.0, 2);
  v_wait := ceil(v_waiting / greatest(v_rate, 0.5));

  with ranked as (
    select id, row_number() over (order by priority desc, joined_at) as rn
      from public.queue_entries
     where event_id = p_event and status = 'waiting'
  )
  update public.queue_entries q
     set queue_position = r.rn
    from ranked r
   where q.id = r.id;

  update public.venue_live
     set waiting_count = v_waiting,
         service_rate  = v_rate,
         wait_minutes  = v_wait,
         trend         = v_in - v_out,
         updated_at    = now()
   where event_id = p_event;
end;
$$;

-- 15.7 Helpers de RLS
create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_album_member(aid uuid)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.album_members where album_id = aid and user_id = auth.uid());
$$;

create or replace function public.can_view_album(aid uuid)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.albums a
     where a.id = aid
       and a.unlock_at <= public.app_now()
       and public.is_album_member(a.id)
  );
$$;

create or replace function public.is_album_admin(aid uuid)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.albums where id = aid and created_by = auth.uid());
$$;

create or replace function public.can_upload_album(aid uuid)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.album_members m
     where m.album_id = aid and m.user_id = auth.uid() and m.can_upload
  );
$$;

create or replace function public.is_ride_participant(rid uuid)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.ride_participants where ride_id = rid and user_id = auth.uid());
$$;

-- 15.8 Taxi de vuelta: crear grupo, unirse por código y repartir la tarifa.

-- Reparte la tarifa a partes iguales; el organizador absorbe el céntimo restante.
create or replace function public.recalc_ride_split(p_ride uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_fare      int;
  v_organizer uuid;
  v_count     int;
  v_share     int;
  v_rem       int;
begin
  select fare_estimate_cents, organizer_id
    into v_fare, v_organizer
    from public.ride_bookings
   where id = p_ride;
  if not found then raise exception 'RIDE_NOT_FOUND'; end if;

  select count(*) into v_count
    from public.ride_participants
   where ride_id = p_ride;
  if v_count = 0 then return; end if;

  v_share := floor(v_fare::numeric / v_count)::int;
  v_rem   := v_fare - v_share * v_count;

  update public.ride_participants
     set share_cents = v_share
   where ride_id = p_ride;

  update public.ride_participants
     set share_cents = share_cents + v_rem
   where ride_id = p_ride and user_id = v_organizer;
end;
$$;

create or replace function public.create_ride_group(
  p_event uuid,
  p_scheduled_at timestamptz,
  p_pickup_point text,
  p_party_size int default 2,
  p_dropoff_point text default null,
  p_fare_cents int default 1400,
  p_split public.split_mode default 'equal',
  p_group uuid default null
)
returns public.ride_bookings
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_ride public.ride_bookings%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_party_size < 2 then raise exception 'PARTY_TOO_SMALL'; end if;
  if p_party_size > 4 then raise exception 'PARTY_TOO_LARGE'; end if;
  if p_fare_cents < 0 then raise exception 'INVALID_FARE'; end if;
  if not exists (
    select 1 from public.events
     where id = p_event and status in ('on_sale','live')
  ) then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;
  if p_group is not null and not public.is_group_member(p_group) then
    raise exception 'NOT_GROUP_MEMBER';
  end if;

  insert into public.ride_bookings (
    event_id, group_id, organizer_id, provider, scheduled_at,
    pickup_point, dropoff_point, party_size, fare_estimate_cents, split_mode, status
  ) values (
    p_event, p_group, v_uid, 'uber', p_scheduled_at,
    p_pickup_point, p_dropoff_point, p_party_size, p_fare_cents, p_split, 'scheduled'
  )
  returning * into v_ride;

  insert into public.ride_participants (ride_id, user_id, dropoff_point, pickup_order)
  values (v_ride.id, v_uid, p_dropoff_point, 1);

  perform public.recalc_ride_split(v_ride.id);
  return v_ride;
end;
$$;

create or replace function public.join_ride(p_code text)
returns public.ride_bookings
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_ride  public.ride_bookings%rowtype;
  v_count int;
  v_order int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_ride
    from public.ride_bookings
   where join_code = upper(trim(p_code))
   for update;
  if not found then raise exception 'RIDE_NOT_FOUND'; end if;
  if v_ride.status in ('completed','cancelled') then raise exception 'RIDE_CLOSED'; end if;

  if v_ride.organizer_id = v_uid
     or exists (
       select 1 from public.ride_participants
        where ride_id = v_ride.id and user_id = v_uid
     ) then
    return v_ride;
  end if;

  select count(*) into v_count
    from public.ride_participants
   where ride_id = v_ride.id;
  if v_count >= v_ride.party_size then raise exception 'RIDE_FULL'; end if;

  select coalesce(max(pickup_order), 0) + 1 into v_order
    from public.ride_participants
   where ride_id = v_ride.id;

  insert into public.ride_participants (ride_id, user_id, pickup_order)
  values (v_ride.id, v_uid, v_order);

  perform public.recalc_ride_split(v_ride.id);
  return v_ride;
end;
$$;

create or replace function public.book_ride(p_ride uuid)
returns public.ride_bookings
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_ride public.ride_bookings%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_ride from public.ride_bookings where id = p_ride for update;
  if not found then raise exception 'RIDE_NOT_FOUND'; end if;
  if v_ride.organizer_id <> v_uid then raise exception 'NOT_ORGANIZER'; end if;
  if v_ride.status not in ('draft','scheduled') then raise exception 'RIDE_NOT_BOOKABLE'; end if;

  update public.ride_bookings
     set status = 'searching'
   where id = p_ride
  returning * into v_ride;

  return v_ride;
end;
$$;

-- Solo service role: el proveedor externo asigna coche y conductor.
create or replace function public.dispatch_ride(
  p_ride uuid,
  p_driver text,
  p_plate text,
  p_eta_minutes int,
  p_external_ref text default null
)
returns public.ride_bookings
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ride public.ride_bookings%rowtype;
begin
  update public.ride_bookings
     set status        = 'assigned',
         driver_name   = p_driver,
         vehicle_plate = p_plate,
         eta_minutes   = p_eta_minutes,
         external_ref  = coalesce(p_external_ref, external_ref)
   where id = p_ride
     and status in ('draft','scheduled','searching')
  returning * into v_ride;

  if not found then raise exception 'RIDE_NOT_DISPATCHABLE'; end if;
  return v_ride;
end;
$$;

create or replace function public.complete_ride(p_ride uuid)
returns public.ride_bookings
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_ride public.ride_bookings%rowtype;
begin
  select * into v_ride from public.ride_bookings where id = p_ride for update;
  if not found then raise exception 'RIDE_NOT_FOUND'; end if;
  if v_uid is not null
     and v_ride.organizer_id <> v_uid
     and not exists (
       select 1 from public.ride_participants
        where ride_id = p_ride and user_id = v_uid
     ) then
    raise exception 'NOT_RIDE_PARTICIPANT';
  end if;

  update public.ride_bookings
     set status = 'completed'
   where id = p_ride
  returning * into v_ride;

  return v_ride;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'app_settings','profiles','venues','events','venue_live','ticket_tiers',
    'orders','tickets','ticket_listings','payments','ledger_entries',
    'scan_events','queue_entries','fast_passes','groups','group_members',
    'bar_items','bar_orders','bar_order_items','social_optins','social_matches',
    'albums','album_members','media_assets','recaps','ride_bookings',
    'ride_participants','notifications','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Catálogo público
create policy venues_read on public.venues for select to anon, authenticated using (true);
create policy events_read on public.events for select to anon, authenticated using (true);
create policy tiers_read  on public.ticket_tiers for select to anon, authenticated using (true);
create policy live_read   on public.venue_live for select to anon, authenticated using (true);
create policy bar_items_read on public.bar_items for select to authenticated using (active);

-- Perfil: visible para usuarios autenticados (sin datos de pago)
revoke select (stripe_account_id) on public.profiles from anon, authenticated;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Entradas: el dueño ve su entrada, nunca el secreto TOTP
revoke select on public.tickets from anon, authenticated;
grant select (id, order_id, event_id, tier_id, owner_id, status, qr_version,
              face_value_cents, used_at, exited_at, created_at)
  on public.tickets to authenticated;
create policy tickets_read_own on public.tickets for select to authenticated
  using (owner_id = auth.uid());

create policy orders_read_own on public.orders for select to authenticated
  using (buyer_id = auth.uid());

create policy listings_read on public.ticket_listings for select to authenticated
  using (status = 'active' or seller_id = auth.uid() or buyer_id = auth.uid());

create policy payments_read_own on public.payments for select to authenticated
  using (user_id = auth.uid());

create policy ledger_read_own on public.ledger_entries for select to authenticated
  using (account_type = 'user' and user_id = auth.uid());

create policy queue_read_own on public.queue_entries for select to authenticated
  using (user_id = auth.uid());

create policy fastpass_read_own on public.fast_passes for select to authenticated
  using (user_id = auth.uid());

-- Grupos
create policy groups_read on public.groups for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update_owner on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy group_members_read on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));
create policy group_members_insert_self on public.group_members for insert to authenticated
  with check (user_id = auth.uid());

-- Barra
create policy bar_orders_read_own on public.bar_orders for select to authenticated
  using (user_id = auth.uid());
create policy bar_items_read_own on public.bar_order_items for select to authenticated
  using (exists (select 1 from public.bar_orders o where o.id = order_id and o.user_id = auth.uid()));

-- Radar
create policy social_optin_own on public.social_optins for select to authenticated
  using (user_id = auth.uid());
create policy social_optin_upsert on public.social_optins for insert to authenticated
  with check (user_id = auth.uid());
create policy social_optin_update on public.social_optins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy matches_read on public.social_matches for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- Álbum: la regla del "revelado matutino" vive aquí
create policy albums_read on public.albums for select to authenticated
  using (public.can_view_album(id) or created_by = auth.uid());
create policy albums_insert on public.albums for insert to authenticated
  with check (created_by = auth.uid());
create policy albums_update_creator on public.albums for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy album_members_read on public.album_members for select to authenticated
  using (user_id = auth.uid() or public.is_album_member(album_id) or public.is_album_admin(album_id));
create policy album_members_insert_admin on public.album_members for insert to authenticated
  with check (public.is_album_admin(album_id));

create policy media_read on public.media_assets for select to authenticated
  using (uploader_id = auth.uid() or public.can_view_album(album_id));
create policy media_insert on public.media_assets for insert to authenticated
  with check (uploader_id = auth.uid() and public.can_upload_album(album_id));
create policy media_delete_own on public.media_assets for delete to authenticated
  using (uploader_id = auth.uid());

create policy recaps_read on public.recaps for select to authenticated
  using (public.can_view_album(album_id));

-- Movilidad
create policy rides_read on public.ride_bookings for select to authenticated
  using (organizer_id = auth.uid() or public.is_ride_participant(id));
create policy rides_insert on public.ride_bookings for insert to authenticated
  with check (organizer_id = auth.uid());
create policy ride_participants_read on public.ride_participants for select to authenticated
  using (user_id = auth.uid() or public.is_ride_participant(ride_id));

create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- Sin políticas = solo service role: scan_events, audit_log, app_settings.

-- ---------------------------------------------------------------------------
-- 17. Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function public.commit_scan(uuid, uuid, bigint, public.scan_direction, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_scan(uuid, uuid, bigint, public.scan_direction, text, uuid, uuid) to service_role;

revoke execute on function public.settle_listing(uuid) from public, anon, authenticated;
grant execute on function public.settle_listing(uuid) to service_role;

revoke execute on function public.recalc_venue_live(uuid) from public, anon, authenticated;
grant execute on function public.recalc_venue_live(uuid) to service_role;

grant execute on function public.join_queue(uuid, double precision, double precision, double precision, int) to authenticated;
grant execute on function public.leave_queue(uuid) to authenticated;
grant execute on function public.create_listing(uuid, int, interval) to authenticated;
grant execute on function public.cancel_listing(uuid) to authenticated;
grant execute on function public.purchase_listing(uuid, uuid) to authenticated;

-- Taxi compartido
grant execute on function public.create_ride_group(uuid, timestamptz, text, int, text, int, public.split_mode, uuid) to authenticated;
grant execute on function public.join_ride(text) to authenticated;
grant execute on function public.book_ride(uuid) to authenticated;
grant execute on function public.complete_ride(uuid) to authenticated;

revoke execute on function public.recalc_ride_split(uuid) from public, anon, authenticated;
grant execute on function public.recalc_ride_split(uuid) to service_role;

revoke execute on function public.dispatch_ride(uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.dispatch_ride(uuid, text, text, int, text) to service_role;

revoke execute on function public.app_now() from anon;
grant execute on function public.app_now() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 18. Storage (ejecutar aparte en Supabase, el schema storage ya existe)
-- ---------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('albums','albums', false, 52428800,
--         array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
-- on conflict (id) do nothing;
--
-- create policy "albums read" on storage.objects for select to authenticated
--   using (bucket_id = 'albums' and public.can_view_album(((storage.foldername(name))[1])::uuid));
--
-- create policy "albums upload" on storage.objects for insert to authenticated
--   with check (bucket_id = 'albums' and public.can_upload_album(((storage.foldername(name))[1])::uuid));
--
-- create policy "albums delete own" on storage.objects for delete to authenticated
--   using (bucket_id = 'albums' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- 19. Jobs (pg_cron + pg_net, ajustar project ref y service key en Vault)
-- ---------------------------------------------------------------------------
-- select cron.schedule('recalc-live', '30 seconds', $$
--   select public.recalc_venue_live(id) from public.events where status = 'live';
-- $$);
--
-- select cron.schedule('expire-listings', '*/5 * * * *', $$
--   update public.ticket_listings set status = 'expired'
--    where status = 'active' and expires_at < now();
-- $$);
--
-- select cron.schedule('render-recaps', '5 10 * * *', $$
--   select net.http_post(
--     url := 'https://<project>.supabase.co/functions/v1/render-recap',
--     headers := jsonb_build_object('Authorization','Bearer <service_role_key>'),
--     body := '{}'::jsonb
--   );
-- $$);

-- ---------------------------------------------------------------------------
-- 20. Realtime
-- ---------------------------------------------------------------------------
--alter publication supabase_realtime add table public.venue_live;
--alter publication supabase_realtime add table public.tickets;
-- (el aforo se emite por Broadcast desde un trigger/Edge Function, no por cambios)

-- Fin.
