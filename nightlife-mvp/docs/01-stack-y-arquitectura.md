# 01 · Stack y arquitectura

## 1. Stack recomendado (y por qué)

### Frontend móvil

| Pieza | Elección | Motivo para un hackathon |
|---|---|---|
| Framework | **Expo SDK (React Native) + TypeScript** | Un código iOS/Android, OTA updates, desarrollo en Expo Go sin builds nativas |
| Navegación | **Expo Router** | Rutas por ficheros, deep links (`noche://evento/:id`) gratis |
| Estado servidor | **TanStack Query** | Cache, retries, optimistic updates para cola y comanda |
| Estado local | **Zustand + MMKV** | Persistencia síncrona del ticket y del modo offline |
| UI | **NativeWind + design tokens propios** | Iterar pantallas en minutos; dark mode "neón" consistente |
| QR propio | `react-native-qrcode-svg` | Render local, sin dependencias nativas |
| Escáner | `expo-camera` (`CameraView`) | Escaneo QR en el móvil del portero |
| Localización | `expo-location` + `expo-task-manager` | Geofencing en foreground y background |
| Anti-captura | `expo-screen-capture` + `FLAG_SECURE` | Detecta/bloquea screenshots además del TOTP |
| Media | `expo-image`, `expo-video`, `expo-image-manipulator` | Compresión antes de subir; grid fluido |
| Push | `expo-notifications` | "Tu mesa está lista", "El álbum se abre a las 10:00" |
| Animación | `react-native-reanimated` + `expo-haptics` | El `+1` del aforo y el confeti del reveal |

**Alternativa descartada:** Flutter. Es excelente, pero obliga a reescribir el panel web y el equipo del hackathon suele tener más velocidad en TS. **Regla:** el stack lo decide el equipo, no la moda; si dominan Flutter, se cambia solo la capa móvil.

### Backend y datos

| Pieza | Elección | Motivo |
|---|---|---|
| BaaS | **Supabase** | Postgres real, RLS, Realtime, Storage, Edge Functions, `pg_cron`, PostGIS en un solo proyecto |
| Auth | **Supabase Auth con OTP por teléfono** | Nadie recuerda una contraseña a las 2:00; `anonymous` para probar el demo |
| Base de datos | **PostgreSQL 15 + PostGIS** | Invariantes de negocio, transacciones, geofencing con índice GiST |
| Realtime | **Supabase Realtime Broadcast + Presence** | Aforo y radar social sin escribir en Postgres en cada latido |
| Storage | **Supabase Storage (S3-compatible)** | Uploads directos con URL firmada; políticas por álbum |
| Funciones | **Edge Functions (Deno)** | TOTP, escaneo, compra P2P, URLs firmadas, webhooks |
| Jobs | **pg_cron + pg_net** | Cierre de colas, generación de recaps, expiración de listings |
| Panel local | **Next.js en Vercel** | Dashboard de aforo/cola para el venue; reutiliza tipos TS |

**Por qué no Firebase:** el tope de precio de reventa es un `CHECK`, la transferencia de una entrada es una transacción con `SELECT … FOR UPDATE`, y la cola se calcula con SQL. En Firestore eso son varias escrituras sin atomicidad real y reglas duplicadas. Firebase gana en presence y notificaciones, pero aquí perdemos la integridad que hace creíble el P2P.

### Servicios externos

| Necesidad | Servicio | Plan hackathon |
|---|---|---|
| Pagos / escrow | **Stripe Connect** (o **Mercado Pago Marketplace** en LatAm) | Test mode, `manual_capture`; el payout se dispara al cerrar el evento |
| Recap IA | **Shotstack** (JSON → MP4) o **Remotion Lambda** | Sandbox; plantilla vertical 1080×1920 con 8 clips + música + títulos |
| Selección de clips | **Gemini 2.5 Flash** | Prompt con duración, brillo y timestamp; devuelve orden y captions |
| Imágenes | **Cloudinary** (o transformaciones de Supabase) | Thumbs 400 px y 1080 px sin pipeline propio |
| Mapas | **Mapbox** / `react-native-maps` | Estilo oscuro; el mapa es parte del "wow" |
| VTC | Deep link a Uber/Cabify | Sin API oficial: `fare_estimate` propio y botón de reserva |
| Observabilidad | **Sentry + PostHog** | 30 min de integración; imprescindible para no depurar a ciegas |

### Coste mensual estimado (post-hackathon, 3 locales piloto)

| Concepto | €/mes |
|---|---|
| Supabase Pro | 25 |
| Vercel Pro | 20 |
| Shotstack / render | 30–70 |
| Cloudinary | 0–50 |
| Stripe | % por transacción |
| **Total fijo** | **~100–170** |

---

## 2. Arquitectura

```
┌──────────────────────┐        ┌──────────────────────┐
│  App invitado (Expo) │        │  App portero (Expo)  │
│  · aforo / cola      │        │  · cámara QR         │
│  · ticket TOTP       │        │  · +1 / -1 aforo     │
│  · comanda / radar   │        │  · modo offline      │
│  · álbum / recap     │        └──────────┬───────────┘
└──────────┬───────────┘                   │
           │ HTTPS / WSS                   │
┌──────────▼───────────────────────────────▼───────────┐
│                     SUPABASE                         │
│  Auth (OTP) · Postgres+RLS · Realtime · Storage      │
│  Edge Functions: totp · scan · resale · album · ai   │
│  pg_cron: expirar listings · recaps · wait recalc    │
└──────┬───────────────┬───────────────┬───────────────┘
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────────┐
│ Stripe      │ │ Shotstack   │ │ Cloudinary / Storage │
│ Connect     │ │ + Gemini    │ │ fotos y vídeos       │
└─────────────┘ └─────────────┘ └─────────────────────┘
```

### Canales en tiempo real

| Canal | Tecnología | Frecuencia | Payload |
|---|---|---|---|
| `venue:{event_id}` | Broadcast | 1 msg/s máx. (throttle) | `{occupancy, capacity, wait_min, trend}` |
| `queue:{event_id}` | Broadcast | 1 msg/5 s | `{called:[], waiting_count, eta}` |
| `radar:{event_id}` | **Presence** | latido 20 s | `{user_id, geohash6, vibe}` — nunca lat/lng exactas |
| `ticket:{ticket_id}` | Postgres Changes | baja | estado `issued → used/transferred` |
| `album:{album_id}` | Broadcast | al subir | `{asset_id, thumb_url, uploader}` |

**Regla anti-colapso:** no usar `postgres_changes` para el aforo. Cada escaneo dispara un trigger que actualiza `venue_live`; un Edge Function o `realtime.broadcast_changes` emite el estado agregado, y el cliente lo recibe como un único mensaje por segundo. Con 3.000 personas, el aforo no genera 3.000 mensajes: genera 1/s.

---

## 3. Entradas: TOTP anti-captura

### Diseño

- Cada ticket tiene un `totp_secret` de 20 bytes **solo accesible por service role**.
- El código es `HOTP(secret, counter)` con `counter = floor(epoch / 10)` y 8 dígitos.
- El móvil **no calcula** el código: pide `GET /ticket-code` a una Edge Function, que devuelve `{code, counter, expires_at}`. Cachea y refresca 2 s antes de expirar.
- QR: `NLV1|<ticket_id>|<counter>|<code>`.
- El escáner valida `±1` ventana (tolerancia 10 s), estado del ticket, evento correcto, y **una sola vez** por `(ticket_id, counter)`.
- Captura de pantalla: el código mostrado caduca en ≤10 s; además `FLAG_SECURE` en Android y detección de captura en iOS. La combinación es lo que hace creíble la promesa, no el QR "animado".

### Secuencia

```
Invitada                    Edge Function                 Postgres
   │  GET /ticket-code          │                            │
   ├───────────────────────────►│  auth.uid + ticket owner   │
   │                            ├───────────────────────────►│ lee secreto (service)
   │  {code, counter, exp}      │◄───────────────────────────┤
   │◄───────────────────────────┤                            │
   │  pinta QR (rota a exp-2s)  │                            │
   │                            │                            │
Portero ── scan ──► POST /scan  │                            │
   │                            │ verifica HMAC ±1           │
   │                            ├── commit_scan() ─────────►│ lock evento
   │                            │                            │ unique(ticket,counter)
   │   {ok, occupancy: 413}     │◄───────────────────────────┤ ocupación +1
   │◄───────────────────────────┤                            │
```

### Modo offline del portero

Un local sin cobertura no puede parar la puerta. Para el MVP: el portero descarga al abrir turno un **manifest firmado** con `ticket_id → HMAC key derivada del evento` válido 12 h; el móvil verifica HMAC localmente y encola los escaneos en MMKV. Al recuperar red, se sincronizan con `idempotency_key` (UUID del escaneo) y el servidor resuelve duplicados. Riesgo asumido y documentado: el dispositivo del portero ve material de verificación; se mitiga con expiración corta y revocación.

---

## 4. Aforo y cola

### Cálculo de ocupación

```
occupancy = Σ entradas (direction='in', result='ok')
          − Σ salidas  (direction='out', result='ok')
          + ajustes manuales del staff
```

- `scan_events` es inmutable (append-only). Nunca se hace `UPDATE` de un escaneo.
- `commit_scan()` toma `pg_advisory_xact_lock(hashtext(event_id))` para serializar por evento y evita sobreaforo en picos.
- Si `occupancy >= capacity`, se rechaza el escaneo salvo override de staff (quedan auditados).
- Semáforo: `verde < 70%`, `ámbar 70–90%`, `rojo > 90%` del aforo legal.

### Espera estimada (Little's Law)

```
service_rate = entradas últimos 15 min / 15        [personas/min]
wait_min     = ceil(waiting_count / max(service_rate, 0.5))
```

Se recalcula cada 30 s con `pg_cron` y también tras cada llamada a la cola. Se muestra como rango ("12–18 min") para no prometer precisión falsa.

### Geofencing

- `venues.location geography(Point,4326)` + `geofence_radius_m` (150 m por defecto).
- El cliente usa geofencing para avisar ("ya puedes unirte"), pero **el servidor valida** `ST_DWithin` al entrar en la cola.
- Se exige `accuracy <= 100 m` y se rechaza si el usuario está fuera.
- Anti-spoof: en Android, `Location.isMock()`; en iOS no hay API fiable → se combina con velocidad imposible y se marca para revisión. **Nunca se usa la ubicación para seguridad física**, solo para activar la cola.
- El radar social usa `geohash` de 6 caracteres (~1,2 km) o 7 (~150 m) y lo difumina aún más; no se expone lat/lng.

---

## 5. Reventa P2P con tope

### Invariantes

1. `price_cents <= face_value_cents * 1.10` (tope del 110 %), garantizado con `CHECK` en base de datos **y** validación en la función de compra.
2. Una entrada solo puede estar en un listing activo a la vez (índice único parcial).
3. La compra es atómica: se bloquea listing + ticket, se cobra, se reemiten secreto y `qr_version`, y se invalida el QR anterior.
4. El vendedor cobra cuando el evento termina y la entrada no fue usada/impugnada (escrow). Si el evento se cancela, se reembolsa.
5. Comisión: 10 % al comprador (o 8 % split). El vendedor nunca recibe más del nominal.

### Flujo

```
Seller lista (≤110%) → estado 'active'
Buyer paga (Stripe manual capture) → estado 'reserved'
purchase_listing() [transacción]
  ├─ valida tope y vigencia
  ├─ ticket.owner_id = buyer
  ├─ ticket.totp_secret = nuevo; qr_version++
  ├─ listing.status = 'sold'
  └─ ledger: buyer −precio, seller +precio−fee, plataforma +fee
Evento termina + 24 h → transfer/capture al seller
```

La entrada original del vendedor queda revocada en el mismo commit; no hay ventana de doble uso.

---

## 6. Galería y recap

### Flujo de subida

1. El álbum se crea al confirmar el grupo (o al hacer check-in 2+ personas del mismo grupo en 30 min).
2. `unlock_at` = próxima 10:00 en la timezone del local.
3. El cliente comprime (`expo-image-manipulator`, máximo 2048 px, 80 % JPEG; vídeo ≤ 60 s).
4. Pide URL firmada → sube directo a Storage (`albums/{album_id}/{asset_id}.jpg`).
5. Edge Function genera thumb, extrae `captured_at` (EXIF si existe; si no, `uploaded_at`) y lo inserta en `media_assets`.
6. Al desbloquear, `pg_cron` llama a la Edge Function `render-recap`: Gemini elige 6–10 clips, Shotstack renderiza 1080×1920, el resultado se guarda en `recaps`.

### Privacidad

- RLS: solo miembros del álbum y solo si `unlock_at <= app_now()`.
- URLs firmadas de 60 min; el bucket es privado.
- El álbum se puede borrar por el owner; los menores de edad se excluyen del radar social.
- Consentimiento explícito al subir: "este álbum es privado del grupo; se abre mañana a las 10:00".

### Modo revelado matutino (truco de demo)

`app_settings.demo_offset` permite mover el reloj de la aplicación sin tocar el del servidor:

```sql
create function app_now() returns timestamptz
language sql stable as $$ select now() + (select demo_offset from app_settings where id = 1) $$;
```

Las políticas RLS usan `app_now()`, así que en el pitch se cambia el offset y el álbum se abre en vivo. En producción el offset es 0 y solo service role puede modificarlo.

---

## 7. Radar social efímero

- **Opt-in explícito** por evento, con edad ≥ 18 y visibilidad de 4 h (`expires_at`).
- Presencia con `geohash7` (~150 m) y un "vibe" (3 tags), nunca foto obligatoria ni ubicación exacta.
- Match solo si ambos dan like; se crea `social_matches` y se abre un chat efímero (24 h) o se comparte Instagram.
- Moderación: report/block, rate limit de likes, y exclusión de usuarios con reportes.
- Métrica clave del demo: "X matches en el local esta noche", no el número de usuarios.

---

## 8. Transporte

- `ride_bookings` con `scheduled_at`, `pickup_point` (no la casa del usuario), `dropoff_point`, `party_size` (máx. 4), `join_code`, `safety_pin` y `split_mode`.
- Estimación de tarifa propia por distancia/tiempo + recargo nocturno; el proveedor real se abre por deep link.
- Taxi compartido: `ride_participants` con `dropoff_point`, `pickup_order` y `share_cents`; el que reserva paga y el resto liquida por Stripe o Bizum (link). Para el MVP, se muestra el reparto y se simula el cobro.
- Flujo: crear grupo → compartir `join_code` → unirse → reservar → conductor asignado por service role → PIN y matrícula visibles → completar al llegar a casa.
- Seguridad: botón "compartir mi viaje" con enlace temporal, PIN y matrícula; no se comparte ubicación continua sin consentimiento.

---

## 9. Seguridad y cumplimiento (lo que un jurado preguntará)

| Riesgo | Mitigación MVP |
|---|---|
| Reventa ilegal / especulación | Tope 110 %, identidad verificada, una entrada por cuenta, escrow |
| Screenshots del QR | TOTP 10 s + un solo uso + `FLAG_SECURE` |
| Sobreaforo | Lock por evento + contador atómico + auditoría de overrides |
| Geolocalización | Consentimiento granular, retención 24 h, geohash, nunca en background sin permiso |
| GDPR | Borrado de cuenta en cascada, export de datos, DPA con Supabase, retención de media 90 días |
| Menores / alcohol | Verificación de edad en onboarding, radar solo +18, sin incentivos de consumo |
| Pagos | Nunca se almacenan tarjetas; Stripe/Mercado Pago; KYC del vendedor para payout |
| Fotos sin consentimiento | Álbum privado, report, borrado, hash perceptual para duplicados |

---

## 10. Plan de 36 h y recortes

### Camino crítico

```
H0 ─── esquema + seed + contratos TS ─── H4
        │
        ├── auth + home + aforo ───────── H12
        ├── ticket TOTP + escáner ─────── H16
        ├── cola + geofence ───────────── H20
        ├── P2P + comanda + radar ─────── H26
        ├── álbum + unlock + recap ────── H30
        └── ensayo + plan B ───────────── H34
```

### Qué se puede simular sin romper el demo

| Módulo | Real | Simulado |
|---|---|---|
| Aforo | Contador + Broadcast | — |
| TOTP | HMAC real, un solo uso | — |
| P2P | Transacción real | Pago con Stripe test |
| Cola | Posición real | Bots de otros asistentes |
| Geofence | PostGIS real | Override para el móvil del demo |
| Comanda | Pedido real en DB | Pago en barra |
| Radar | Presence real | Usuarios sembrados |
| Recap | Render real de 8 clips | Gemini precalculado si falla la API |
| Taxi | Reserva en DB | Deep link / proveedor |

### Plan B del demo

- Vídeo grabado de 90 s con la misma narrativa, reproducible en local.
- Dos móviles con build de producción y datos sembrados; uno en 4G, otro en wifi.
- Panel del local con estado cacheado y reconexión automática.
- Nunca hacer el demo con datos vacíos: el seed crea 412 asistentes, 3 amigos, 8 fotos y un recap ya renderizado.

---

## 11. Métricas del producto (para el pitch y para el panel)

| Métrica | Por qué importa |
|---|---|
| Tiempo medio de entrada | Es el KPI que compra el local |
| % de cola virtual vs presencial | Adopción del flujo |
| Aforo medio vs capacidad | Revenue por noche y seguridad |
| Reventa: % tickets, precio medio, fraude | Salud del marketplace |
| Órdenes de barra por asistente | Ticket medio dentro del local |
| Recap: % asistentes que suben, % que comparten | Viralidad (K-factor) |
| NPS del local y del asistente | Retención |
