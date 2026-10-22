-- ============================================================================
--  NOCHE · Seed de demo (36 h)
--  Ejecutar DESPUÉS de schema.sql.
--
--  Crea 3 locales de Madrid, 2 eventos y tiers.
--  Los usuarios NO se crean aquí (van por auth.users / Auth API).
--  Para el demo:
--    · crear usuarios lucia@noche.app / mario@noche.app / portero@noche.app
--    · marcar app_settings.demo_geofence_override = true
-- ============================================================================

set search_path = public, extensions;

update public.app_settings
   set demo_geofence_override = true, demo_offset = interval '0'
 where id = 1;

-- ---------------------------------------------------------------------------
-- Locales
-- ---------------------------------------------------------------------------
insert into public.venues (id, name, slug, address, city, location, geofence_radius_m, capacity_legal, logo_url)
values
  ('a0000000-0000-0000-0000-000000000001', 'Fabrik', 'fabrik',
   'Av. de la Industria, 82', 'Madrid', st_setsrid(st_makepoint(-3.7357, 40.3329), 4326)::geography, 300, 5000, null),
  ('a0000000-0000-0000-0000-000000000002', 'Teatro Barceló', 'teatro-barcelo',
   'C. de Barceló, 11', 'Madrid', st_setsrid(st_makepoint(-3.6985, 40.4268), 4326)::geography, 150, 1800, null),
  ('a0000000-0000-0000-0000-000000000003', 'Input', 'input',
   'C. de Valverde, 32', 'Madrid', st_setsrid(st_makepoint(-3.7003, 40.4211), 4326)::geography, 150, 1200, null)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Evento de esta noche (en vivo) y evento de mañana (venta)
-- ---------------------------------------------------------------------------
insert into public.events (id, venue_id, name, description, doors_at, starts_at, ends_at, capacity_total, status, cover_url)
values
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'Fabrik · Sábado de techno', 'Tres salas, seis horas, una noche.',
   now() - interval '2 hours', now() - interval '1 hour', now() + interval '5 hours',
   475, 'live', null),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002',
   'Barceló · Pop & Indie', 'Clásicos que no fallan.',
   now() + interval '22 hours', now() + interval '23 hours', now() + interval '29 hours',
   1800, 'on_sale', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tiers
-- ---------------------------------------------------------------------------
insert into public.ticket_tiers (id, event_id, name, description, face_value_cents, quantity, max_per_user)
values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'General', 'Acceso a las 3 salas', 2500, 4200, 4),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'VIP', 'Acceso prioritario + zona VIP', 4500, 600, 2),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'General', null, 1800, 1500, 4),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Fast-Pass', 'Entra sin cola antes de la 1:00', 2800, 300, 2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Aforo de arranque del demo (para que el panel no empiece en 0)
-- ---------------------------------------------------------------------------
update public.venue_live
   set occupancy = 412, wait_minutes = 14, waiting_count = 38, service_rate = 2.7, trend = 6
 where event_id = 'b0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Nota: usuarios de demo
-- ---------------------------------------------------------------------------
-- Crear con la Admin API (service role) o en el dashboard:
--   lucia@noche.app   · Lucía   · is_demo = true
--   mario@noche.app   · Mario   · is_demo = true
--   portero@noche.app · Portero  (rol staff, fuera de la app de invitado)
--
-- El trigger `handle_new_user` crea el perfil automáticamente con
-- raw_user_meta_data = {"handle":"lucia","display_name":"Lucía","birth_date":"1998-04-12"}.
