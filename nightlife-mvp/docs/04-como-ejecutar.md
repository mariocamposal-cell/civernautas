# 04 · Cómo ejecutar

## Lo que hay hoy

| Pieza | ¿Se ejecuta? | Comando |
|---|---|---|
| **Demo HTML navegable** | ✅ | `cd web && python3 -m http.server 8080` |
| Tests del TOTP (RFC 6238) | ✅ | `npm test` |
| Demo de QR rotando en terminal | ✅ | `npm run demo:totp` |
| Esquema + seed en Supabase | ✅ (nube) | SQL Editor |
| App móvil Expo | ❌ todavía no | — |

`nightlife-mvp` incluye el diseño, la capa de datos y una **demo HTML completa** que funciona sin backend. Lo único que falta es la app Expo nativa. Abajo tienes el orden recomendado para verlo todo funcionando.

---

## 0. Requisitos

- Node.js ≥ 20 y npm.
- Una cuenta gratuita de **Supabase** (recomendado) o Docker si quieres Supabase local.

```bash
cd /home/aldan/2/Hackathon/nightlife-mvp
npm install
```

---

## 1. Demo HTML (la forma más rápida)

```bash
cd /home/aldan/2/Hackathon/nightlife-mvp/web
python3 -m http.server 8080
```

Abre <http://localhost:8080>. En el móvil, usa la IP del portátil en la misma red
(`http://192.168.x.x:8080`). Si no tienes Python: `npx serve . -l 8080`.

> **No lo abras con doble clic (`file://`).** La cámara y la sincronización entre
> pestañas necesitan un origen `http://localhost`.

### Recorrido de 90 segundos

1. **Aforo + escaneo** — Escáner → “Escanear el ticket de Lucía”. La pestaña
   **Aforo** y el panel de la derecha pasan de **412 a 413** en directo.
2. **Captura antigua** — Entrada → “Simular captura” → “Escanear esta captura”.
   El escáner la rechaza.
3. **Mercado de entradas** — Entradas → **Vender**. El slider no pasa del
   **110 %** del nominal; al publicar, el escáner bloquea esa entrada. En
   **Comprar** hay reventas disponibles y en **Mis entradas** gestionas las tuyas.
   La misma pestaña muestra el **aforo en vivo** con las plazas restantes.
4. **Álbum** — Álbum → “Modo demo · revelar ahora” → “Ver recap”.
5. **Panel del local** — icono de barras (arriba a la derecha). Abre
   `?mode=venue` en otra pestaña y se sincroniza por `BroadcastChannel`.
6. **Taxi de vuelta** — pestaña **Taxi** de la barra inferior (o Home → Taxi de
   vuelta). Crea un grupo con paradas a casa o únete con el código `NOCHE-247`,
   reserva y sigue el viaje con PIN y matrícula.

Atajos: `1`–`5` pestañas · `S` escanear · `X` captura vieja · `R` revelar · `?` ayuda.
Reset: botón del panel o “Reiniciar demo” en la ayuda.

> Es un demo autocontenido: no necesita Supabase. El TOTP es real; el aforo y el
> álbum viven en `localStorage` + `BroadcastChannel`. Para el backend real,
> sigue con la sección 3.

---

## 2. TOTP: tests y demo visual

### Tests

```bash
npm test
```

Debe imprimir:

```
✓ 6 vectores RFC 6238
✓ generación, expiración y ventana de reloj
✓ base32 roundtrip
✓ payload QR
✓ secreto de 20 bytes
```

### QR que rota cada 10 segundos

```bash
npm run demo:totp
```

Verás un QR en ASCII, una barra de cuenta atrás y el `counter` actual. Cuando llega a 0:

- el payload cambia (`NLV1|ticket|nuevo_counter|nuevo_code`),
- el QR anterior deja de ser válido,
- una captura de pantalla del QR viejo falla en el escáner.

Variables opcionales:

```bash
TICKET_ID="12121212-1212-1212-1212-121212121212" \
TICKET_SECRET="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" \
npm run demo:totp
```

> El secreto se imprime solo para el demo. En producción no sale del backend.

---

## 3. Base de datos en Supabase (nube)

### 2.1 Crear el proyecto

1. Entra en <https://supabase.com/dashboard> → **New project**.
2. Elige organización, nombre (`noche-mvp`), contraseña de base de datos y región (Frankfurt o la más cercana).
3. Espera a que termine el aprovisionamiento.

### 2.2 Ejecutar el esquema

1. **SQL Editor** → **New query**.
2. Pega el contenido completo de `db/schema.sql`.
3. **Run**.

El script crea el esquema `public`, los enums, 29 tablas, triggers, RPCs, políticas RLS y permisos. También intenta habilitar `pgcrypto` y `postgis`.

Si tu proyecto no tiene PostGIS, ejecuta antes:

```sql
create extension if not exists postgis with schema extensions;
```

### 2.3 Cargar los datos de demo

1. **New query** → pega `db/seed.sql` → **Run**.
2. Verifica:

```sql
select e.name, v.name as venue, vl.occupancy, vl.capacity, vl.wait_minutes
  from venue_live vl
  join events e on e.id = vl.event_id
  join venues v on v.id = e.venue_id;
```

Deberías ver **Fabrik** con `occupancy = 412`, `capacity = 475`, `wait_minutes = 14`.

### 2.4 Crear usuarios de demo

**Opción A · Dashboard**

Authentication → Users → **Add user**:

| Email | Password | User Metadata |
|---|---|---|
| `lucia@noche.app` | `noche1234` | `{"handle":"lucia","display_name":"Lucía","birth_date":"1998-04-12"}` |
| `mario@noche.app` | `noche1234` | `{"handle":"mario","display_name":"Mario","birth_date":"1996-09-01"}` |
| `portero@noche.app` | `noche1234` | `{"handle":"portero","display_name":"Portero","birth_date":"1990-01-01"}` |

Marca **Auto Confirm User**. El trigger `handle_new_user` crea el perfil automáticamente.

**Opción B · Admin API**

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SERVICE_ROLE="<service-role-key>"

curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lucia@noche.app",
    "password": "noche1234",
    "email_confirm": true,
    "user_metadata": {
      "handle": "lucia",
      "display_name": "Lucía",
      "birth_date": "1998-04-12"
    }
  }'
```

Repite para `mario` y `portero`.

### 2.5 Activar el modo demo

```sql
update profiles set is_demo = true where handle in ('lucia', 'mario');
update app_settings set demo_geofence_override = true, demo_offset = interval '0' where id = 1;
```

- `demo_geofence_override = true` permite unirse a la cola sin estar físicamente en el local. **Déjalo en `false` en producción.**
- `demo_offset` mueve el reloj de la app para enseñar el revelado del álbum sin esperar a las 10:00.

### 2.6 Storage del álbum (opcional)

En **Storage** crea un bucket privado llamado `albums`. Después ejecuta el bloque comentado del final de `schema.sql` (sección 18) en el SQL Editor, adaptándolo si hace falta. Sin esto, el esquema funciona; solo no se pueden subir fotos.

### 2.7 Verificar RLS

```sql
-- Como usuario autenticado, el secreto TOTP debe estar prohibido:
select totp_secret from tickets limit 1;
-- ERROR: permission denied for table tickets  ✅

-- El álbum debe estar oculto hasta las 10:00:
select id, title, unlock_at from albums;
```

---

## 4. Supabase local (opcional, requiere Docker)

```bash
npm i -g supabase
supabase init

mkdir -p supabase/migrations
cp db/schema.sql supabase/migrations/20261022000000_init.sql

supabase start
supabase db reset          # aplica schema.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f db/seed.sql
```

> En Windows o si `supabase status` cambia de formato, usa la `DB_URL` que imprime `supabase status`.

---

## 5. La app móvil (siguiente paso)

No existe todavía. Para crearla:

```bash
cd /home/aldan/2/Hackathon/nightlife-mvp
npx create-expo-app@latest app --template blank-typescript
cd app
npx expo start
```

Después hay que:

1. Configurar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
2. Implementar las pantallas: aforo, cola, ticket TOTP, escáner, álbum.
3. Conectar Realtime al canal `venue:{event_id}`.

Puedo generarte ese scaffold completo con las 5 pantallas del demo si quieres.

---

## 6. Problemas típicos

| Error | Causa / solución |
|---|---|
| `type "geography" does not exist` | PostGIS no está instalado o no está en el `search_path`. Ejecuta `create extension postgis with schema extensions;` y vuelve a correr el esquema. |
| `function st_dwithin(...) does not exist` | Mismo caso. El esquema ya pone `search_path = public, extensions, pg_temp` en las funciones. |
| `permission denied for table tickets` al leer `totp_secret` | **Es correcto**: el secreto solo lo lee el service role. |
| `new row violates check constraint "listing_price_cap"` | El precio supera el 110 % del nominal. Es el comportamiento esperado. |
| El evento del seed está en el pasado | El seed usa `now()`; vuelve a ejecutarlo el día del demo o actualiza `events.starts_at/ends_at`. |
| El álbum no se desbloquea | Revisa `unlock_at` y `app_settings.demo_offset`. Para el pitch, pon `demo_offset = interval '2 days'`. |
| `AUTH_REQUIRED` al llamar RPCs | Estás usando la anon key sin sesión. Inicia sesión o usa el service role solo en backend. |

---

## 7. Orden recomendado para el hackathon

```bash
# 1. Ver el producto funcionando YA
cd web && python3 -m http.server 8080
# abrir http://localhost:8080

# 2. Verificar el núcleo TOTP en terminal
cd .. && npm test && npm run demo:totp

# 3. Crear Supabase y ejecutar schema.sql + seed.sql

# 4. Crear usuarios y activar modo demo

# 5. Crear la app Expo y apuntarla al proyecto
npx create-expo-app@latest app --template blank-typescript
```

Con eso tienes la base lista para que la app consuma el aforo, la cola y el álbum reales.
