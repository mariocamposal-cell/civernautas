# 02 · Modelo de datos

## 1. Vista general

El modelo se organiza en 6 dominios que comparten `profiles` y `events` como ejes:

```
                         ┌────────────┐
                         │  profiles  │
                         └─────┬──────┘
        ┌──────────┬───────────┼───────────┬───────────┬──────────┐
        │          │           │           │           │          │
   ┌────▼────┐ ┌───▼────┐ ┌────▼─────┐ ┌───▼────┐ ┌────▼────┐ ┌──▼──────┐
   │ orders  │ │ queue  │ │ listings │ │ groups │ │ social  │ │  rides  │
   │ tickets │ │ fastpass│ │  P2P     │ │ albums │ │ matches │ │ split   │
   └────┬────┘ └───┬────┘ └────┬─────┘ └───┬────┘ └────┬────┘ └──┬──────┘
        │          │           │           │           │          │
        └──────────┴───────────┴─────┬─────┴───────────┴──────────┘
                                      │
                                 ┌────▼────┐        ┌─────────────┐
                                 │ events  │◄───────┤   venues    │
                                 └────┬────┘        │  PostGIS    │
                                      │             └─────────────┘
                     ┌────────────────┼────────────────┐
                ┌────▼─────┐    ┌─────▼──────┐   ┌─────▼──────────┐
                │venue_live│    │ scan_events│   │ticket_listings │
                │ aforo    │    │  append    │   │    reventa     │
                └──────────┘    └────────────┘   └────────────────┘
```

## 2. Catálogo de tablas

### Identidad y local

| Tabla | Propósito | Campos clave |
|---|---|---|
| `profiles` | 1:1 con `auth.users` | `handle`, `display_name`, `birth_date`, `is_demo` |
| `venues` | Local físico | `location geography(Point)`, `geofence_radius_m`, `capacity_legal`, `timezone` |
| `events` | Noche concreta | `venue_id`, `doors_at`, `starts_at`, `ends_at`, `capacity_total`, `status` |
| `app_settings` | Singleton de config | `demo_offset interval`, `demo_geofence_override` |

### Entradas y dinero

| Tabla | Propósito | Campos clave |
|---|---|---|
| `ticket_tiers` | Lote (General, VIP…) | `face_value_cents`, `quantity`, `sold_count`, `max_per_user` |
| `orders` | Compra inicial | `buyer_id`, `total_cents`, `payment_id`, `status` |
| `tickets` | Entrada individual | `owner_id`, `tier_id`, `status`, `totp_secret`, `qr_version`, `face_value_cents` |
| `ticket_listings` | Reventa P2P | `price_cents`, `face_value_cents`, `status`, `expires_at` |
| `payments` | Abstracción de proveedor | `kind`, `ref_id`, `amount_cents`, `provider`, `provider_ref`, `status` |
| `ledger_entries` | Libro mayor | `account_type`, `user_id`, `amount_cents`, `ref_type`, `ref_id` |

### Aforo y acceso

| Tabla | Propósito | Campos clave |
|---|---|---|
| `scan_events` | **Append-only** de cada escaneo | `ticket_id`, `code_counter`, `result`, `direction`, `device_id`, `idempotency_key` |
| `venue_live` | Proyección 1:1 del evento | `occupancy`, `capacity`, `waiting_count`, `wait_minutes`, `service_rate`, `updated_at` |
| `queue_entries` | Cola virtual | `queue_position`, `priority`, `party_size`, `status`, `joined_at`, `called_at` |
| `fast_passes` | Pase prioritario | `price_cents`, `status`, `payment_id` |

### Dentro del local

| Tabla | Propósito | Campos clave |
|---|---|---|
| `social_optins` | Radar opt-in | `geohash7`, `vibe`, `expires_at`, `visible` |
| `social_matches` | Match recíproco | `user_a`, `user_b`, `event_id`, `expires_at` |

### Grupo, álbum y recap

| Tabla | Propósito | Campos clave |
|---|---|---|
| `groups` | Grupo de amigos | `invite_code`, `owner_id`, `event_id` |
| `group_members` | Membresía | `role`, `joined_at` |
| `albums` | Álbum privado | `group_id`, `event_id`, `unlock_at`, `status` |
| `album_members` | Quién ve/sube | `role`, `can_upload` |
| `media_assets` | Foto/vídeo | `storage_path`, `kind`, `captured_at`, `moderation_status` |
| `recaps` | Vídeo generado | `status`, `video_url`, `template`, `ai_caption` |

### Movilidad

| Tabla | Propósito | Campos clave |
|---|---|---|
| `ride_bookings` | Grupo y reserva de VTC | `scheduled_at`, `pickup_point`, `dropoff_point`, `party_size`, `join_code`, `safety_pin`, `fare_estimate_cents`, `split_mode`, `status` |
| `ride_participants` | Reparto y paradas | `dropoff_point`, `pickup_order`, `share_cents`, `payment_status` |

## 3. Invariantes que la base de datos hace cumplir

| # | Invariante | Implementación |
|---|---|---|
| 1 | Una entrada no se vende por encima del 110 % | `CHECK` en `ticket_listings` + trigger que copia el nominal |
| 2 | Una entrada solo tiene un listing activo | Índice único parcial `(ticket_id) WHERE status='active'` |
| 3 | Un QR no se usa dos veces | Índice único `(ticket_id, code_counter) WHERE result='ok'` |
| 4 | Un escaneo no se duplica al sincronizar | `idempotency_key` único |
| 5 | No se supera el aforo | Lock por evento + comprobación en `commit_scan()` |
| 6 | Una persona, una entrada activa en cola | Índice único parcial `(event_id, user_id) WHERE status IN ('waiting','called')` |
| 7 | El álbum no se ve antes de las 10:00 | RLS con `unlock_at <= app_now()`; el bucket es privado |
| 8 | Un match requiere reciprocidad | `social_matches` con par ordenado `user_a < user_b` único |
| 9 | El vendedor no cobra hasta cerrar el evento | `ledger_entries` en `escrow` + job de liquidación |
| 10 | Los escaneos no se editan | Sin políticas de `UPDATE/DELETE`; solo `INSERT` vía RPC |

## 4. Flujos transaccionales

### 4.1 Compra inicial

```sql
begin;
  select ... from ticket_tiers where id = $tier for update;
  -- valida stock y max_per_user
  insert into orders (...) values (...);
  insert into tickets (order_id, event_id, tier_id, owner_id, face_value_cents, totp_secret)
    select ..., gen_random_bytes(20) from generate_series(1, $qty);
  update ticket_tiers set sold_count = sold_count + $qty;
  update venue_live ...; -- no: el aforo solo cuenta escaneos, no ventas
commit;
```

**Decisión:** el aforo mostrado es *ocupación real*, no entradas vendidas. Se muestran ambos: "412 dentro · 87 %" y "quedan 34 entradas".

### 4.2 Escaneo

```
POST /scan {qr: "NLV1|ticket|12345678|code", event_id, device_id, direction}
  → parse + verificar TOTP (Edge Function, ±1 ventana)
  → commit_scan(ticket, counter, event, device, direction, idempotency)
      ├─ advisory lock por evento
      ├─ ticket FOR UPDATE
      ├─ ¿ya existe (ticket, counter, ok)? → duplicate
      ├─ ¿status válido? → revoked / already_used
      ├─ ¿capacidad? → capacity_full
      ├─ insert scan_events
      ├─ update tickets (used/exited_at)
      └─ update venue_live (+1 / −1) RETURNING occupancy
```

### 4.3 Reventa

Ver `purchase_listing()` en `db/schema.sql`: bloquea listing y ticket, valida tope, exige pago capturado, reemite el secreto TOTP, incrementa `qr_version` y escribe el libro mayor.

### 4.4 Desbloqueo del álbum

No hace falta job para desbloquear: la política RLS compara `unlock_at` con `app_now()`. El job de las 10:05 solo **renderiza** los recaps de los álbumes recién abiertos.

### 4.5 Taxi de vuelta en grupo

```sql
-- 1. El organizador crea el grupo (party_size ≤ 4). El código y el PIN se generan en servidor.
select public.create_ride_group(event_id, scheduled_at, pickup_point, 3, dropoff_point, 1400, 'equal', group_id);

-- 2. Cada amigo se une con el código; el servidor bloquea la fila y valida plazas.
select public.join_ride('NOCHE-247');

-- 3. El organizador pide el taxi. El proveedor (Edge Function) asigna coche por service role.
select public.book_ride(ride_id);
select public.dispatch_ride(ride_id, 'Javier M.', '4821 KTM', 4, 'uber_abc123');

-- 4. Al llegar a casa se cierra el viaje y queda el reparto en ride_participants.
select public.complete_ride(ride_id);
```

Invariantes: `party_size` entre 1 y 4, código de grupo único, PIN de 4 dígitos, reparto recalculado tras cada incorporación (`recalc_ride_split`) y solo el organizador puede reservar o completar. El conductor y la matrícula se escriben desde el service role, nunca desde el cliente.

## 5. RLS: las tres reglas que importan

```sql
-- 1. El secreto TOTP nunca llega al cliente
revoke select (totp_secret) on public.tickets from anon, authenticated;

-- 2. El álbum solo existe para sus miembros y después de las 10:00
create policy album_read on public.albums for select to authenticated
using (
  unlock_at <= app_now()
  and exists (select 1 from album_members m where m.album_id = id and m.user_id = auth.uid())
);

-- 3. El aforo es público; los escaneos, no
create policy live_read on public.venue_live for select to anon, authenticated using (true);
-- scan_events: solo staff del venue, y solo lectura agregada
```

**Storage:** bucket privado `albums`. Política de lectura con el mismo predicado que `albums`; política de subida solo para miembros con `can_upload`. Las URLs se firman a 60 min.

## 6. Índices críticos

```sql
create index on tickets (owner_id, status);
create index on tickets (event_id, status);
create index on scan_events (event_id, scanned_at desc);
create index on ticket_listings (event_id, status) where status = 'active';
create index on queue_entries (event_id, status, priority desc, joined_at);
create index on media_assets (album_id, captured_at);
create index on social_optins (event_id, geohash7) where visible;
create index on venues using gist (location);
```

## 7. Retención y privacidad

| Dato | Retención | Nota |
|---|---|---|
| Ubicación del radar | 4 h | Solo geohash, nunca lat/lng exactas |
| `scan_events` | 13 meses | Auditoría / obligación fiscal |
| Media del álbum | 90 días | Borrado automático; export disponible |
| Recaps | 90 días | Se puede guardar en el móvil |
| Ledger | 6 años | Requisito contable |
| Cuenta | Baja en cascada | `on delete cascade` + purga de Storage |
