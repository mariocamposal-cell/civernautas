# NOCHE · demo HTML

Demo autocontenido y navegable del MVP. **No necesita backend ni build.**
Incluye login de usuarios, aforo en vivo, QR TOTP rotando, escáner, mercado de
entradas, radar social, taxi compartido y álbum con recap.

## Abrirlo

```bash
cd /home/aldan/2/Hackathon/nightlife-mvp/web
python3 -m http.server 8080
```

Abre <http://localhost:8080> en el portátil. En el móvil, entra desde la IP
del portátil en la misma red (`http://192.168.x.x:8080`).

> **No lo abras con doble clic (`file://`).** La cámara y el `BroadcastChannel`
> necesitan un origen `http://localhost`. Si no tienes Python:
> `npx serve . -l 8080`.

## Login de demo

Al abrir la app aparece la pantalla de acceso. Puedes usar:

- Email: `lucia@noche.app`
- Contraseña: `noche123`
- O pulsar **Entrar como Lucía · demo**.

También puedes crear una cuenta nueva; la sesión y las cuentas se guardan en
`localStorage`. En producción, este módulo se sustituye por Supabase Auth.

## Guion de 90 segundos

| Paso | Acción | Qué demuestra |
|---|---|---|
| 1 | **Escáner → “Escanear el ticket de Lucía”** | El aforo del panel, de la pestaña **Aforo** y de Entradas pasa de **412 → 413** en directo |
| 2 | **Entradas → “Simular captura” → “Escanear esta captura”** | El QR rotatorio rechaza una captura de hace 30 s |
| 3 | **Entradas → Mercado → Vender** | El slider no supera el **110 %** del nominal; al publicar, el escáner bloquea esa entrada |
| 4 | **Entradas → Comprar / Mis entradas** | Compra una reventa, aparece en “Mis entradas” y puedes volver a venderla |
| 5 | **Álbum → “Modo demo · revelar ahora” → “Ver recap”** | Revelado a las 10:00 y vídeo vertical generado con IA |
| 6 | **Icono del panel (arriba dcha.)** | Abre el panel del local en otra pestaña; se sincroniza por `BroadcastChannel` |
| 7 | **Pestaña Taxi (navegación inferior) o Home → Taxi de vuelta** | Crear grupo con paradas a casa o unirse con `NOCHE-247`; reservar, ver PIN/matrícula y seguir el viaje |

La pestaña **Entradas** incluye además el **aforo en vivo** con plazas restantes.

Atajos: `1`–`6` pestañas · `T` taxi · `S` escanear · `X` captura vieja · `R` revelar · `?` ayuda.
Reset: botón del panel del local o “Reiniciar demo” en la ayuda.

## Qué es real y qué es simulado

| Pieza | Implementación |
|---|---|
| TOTP | **Real**: HMAC-SHA1 con Web Crypto, paso 10 s, ventana ±1, anti-replay |
| QR | **Real**: `qrcode-generator`, payload `NLV1|ticket|counter|code` |
| Escáner | **Real** con cámara (`jsQR`) o simulado con botones |
| Aforo | Estado local + BroadcastChannel entre pestañas (simula WebSocket) |
| Reventa | Regla de tope 110 % y bloqueo de la entrada |
| Taxi compartido | Grupo de hasta 4, unión por código, reparto, PIN y estados del viaje; la reserva VTC es simulada |
| Álbum | RLS simulada con estado local; en producción la regla vive en Postgres |
| Recap | Slideshow CSS/JS; en producción lo renderiza Shotstack/Remotion con IA |
| Cámara | Requiere `localhost` o HTTPS y permiso del navegador |

## Archivos

```
web/
├── index.html          # toda la app (HTML + CSS + JS)
├── vendor/
│   ├── qrcode.js       # generador de QR
│   └── jsQR.js         # lector de QR para la cámara
└── assets/
    ├── photo-1..8.jpg  # fotos del álbum
    └── CREDITS.md      # atribuciones de las fotos
```

## Limitaciones del demo

- Un único ticket y un único usuario; el backend real está en `db/schema.sql`.
- El estado vive en `localStorage`: si recargas, se conserva; usa “Reset demo”.
- No hay pagos reales, ni VTC real, ni moderación de fotos.
- El secreto TOTP está fijo en el código **solo para el demo**. En producción
  cada ticket tiene su secreto y el móvil nunca lo ve.
