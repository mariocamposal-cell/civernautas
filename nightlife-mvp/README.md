# Noche — MVP de ocio nocturno (36 h)

> Nombre de trabajo: **Noche** (`noche.app`). Claim: *"La noche, sin fricción."*
> Entregables: stack, modelo de datos y pitch de 3 minutos para un hackathon de alta competencia.

## Índice

| Documento | Qué contiene |
|---|---|
| [`docs/01-stack-y-arquitectura.md`](docs/01-stack-y-arquitectura.md) | Stack, arquitectura, realtime, TOTP, geofencing, pagos, vídeo IA, plan de 36 h y riesgos |
| [`docs/02-modelo-de-datos.md`](docs/02-modelo-de-datos.md) | ERD, catálogo de tablas, invariantes, RLS y flujos transaccionales |
| [`docs/03-pitch-deck-3min.md`](docs/03-pitch-deck-3min.md) | Guion slide a slide, coreografía del demo, economics y Q&A |
| [`docs/04-como-ejecutar.md`](docs/04-como-ejecutar.md) | Cómo correr los tests, el demo TOTP y el esquema en Supabase |
| [`web/index.html`](web/index.html) | **Demo navegable completo** (aforo, QR, escáner, mercado de entradas, barra, radar, taxi de vuelta en grupo, álbum y recap) |
| [`web/README.md`](web/README.md) | Cómo abrir el demo HTML y guion de 90 segundos |
| [`db/schema.sql`](db/schema.sql) | Esquema PostgreSQL/Supabase completo (PostGIS, RLS, RPCs) |
| [`db/seed.sql`](db/seed.sql) | Datos de demo: local, evento, tiers, carta de barra, álbum |
| [`lib/totp.ts`](lib/totp.ts) | TOTP de 10 s + payload QR + verificación anti-replay |

## Demo rápido

```bash
cd nightlife-mvp
./start.sh
```

Abre <http://localhost:8081> automáticamente. Si prefieres hacerlo a mano:

```bash
cd nightlife-mvp/web
python3 -m http.server 8081
```

Y abre <http://localhost:8081> en el navegador. **No abras `index.html` con doble
clic** (`file://`): la cámara y el `BroadcastChannel` necesitan `http://localhost`.
No necesita Supabase ni build: el aforo, el QR TOTP, el escáner, la reventa, el
taxi y el álbum funcionan en local. El panel del local se abre con el icono de
barras (arriba a la derecha) y se sincroniza por `BroadcastChannel`.

## Las 5 decisiones que definen el MVP

1. **Un solo cliente móvil: Expo/React Native + TypeScript.** Un equipo, dos plataformas, OTA para corregir durante el hackathon y reutilización de React para el panel del local.
2. **Supabase en lugar de Firebase.** El P2P necesita transacciones e invariantes (tope de precio, transferencia atómica, escrow) y el aforo necesita SQL. Postgres + RLS + Realtime + Storage + Edge Functions + `pg_cron` + PostGIS cubren los 5 módulos sin montar servicios.
3. **El QR no se genera en el móvil.** El servidor emite un código TOTP de 10–15 s; el cliente solo lo pinta. Así una captura de pantalla muere en segundos y el secreto nunca sale del backend.
4. **El aforo es un contador derivado, no editado a mano.** Cada escaneo válido es un evento inmutable; la ocupación se actualiza en una transacción con lock por evento y se emite por Broadcast (máx. 1 msg/s por local).
5. **El "wow" se construye, no se explica.** Dos momentos en el pitch: el `+1` de aforo en pantalla grande al escanear en vivo, y el álbum que se desbloquea a las 10:00 con el recap ya renderizado.

## Reparto de 36 h (equipo de 4)

| Bloque | Mobile (2) | Backend (1) | Diseño / demo (1) |
|---|---|---|---|
| 0–4 h | Design system, navegación, contratos de API | Proyecto Supabase, esquema, RLS, seed | Guion del demo, 8 assets del álbum |
| 4–14 h | Home/aforo, ticket TOTP, cola + geofence | RPCs de cola/escaneo, Realtime, Storage | Flujo end-to-end, copy, pantallas del panel |
| 14–22 h | Escáner portero, comanda, radar, taxi | P2P atómico, TOTP, álbum + unlock | Micro-interacciones, vídeo recap (Shotstack) |
| 22–28 h | Integración, push, estados de error | Idempotencia, rate limit, observabilidad | Ensayo 1, métricas en pantalla |
| 28–34 h | **Feature freeze**, pulido, modo offline | Carga, backups, feature flags | Ensayo 2 y 3, plan B grabado |
| 34–36 h | Buffer | Buffer | Buffer |

**Regla de oro:** a las 28 h se congela producto. Todo lo que no esté en el guion del demo se apaga con feature flag.

## Demo en 3 actos (90 s)

1. **Antes / fila:** mapa con aforo en vivo → geofence → cola virtual con espera estimada → Fast-Pass.
2. **Entrada:** QR rotando en el móvil de la invitada; captura de pantalla que ya no vale; el portero escanea y el panel del local pasa de 412 a 413 en directo.
3. **Después:** a las 10:00 el álbum se desbloquea y suena el recap vertical con los mejores momentos, listo para Stories.

## Qué NO se construye en 36 h

- Pagos reales end-to-end: Stripe test mode + webhook simulado; el escrow se explica, no se liquida.
- Integración oficial de VTC: deep link a Uber/Cabify con `fare_estimate` propio y reserva simulada.
- Moderación automática de fotos: se usa un flag manual + hash perceptual duplicado.
- App Store/Play review: distribución por Expo Go / development build.
- Cifrado de extremo a extremo del álbum: RLS + URLs firmadas; se documenta el roadmap.
