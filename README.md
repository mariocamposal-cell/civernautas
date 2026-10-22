# NIGHTPULSE — ClubCheck

Fusión de **NIGHTPULSE** (aforo, escrow, taxi, carrete) con la home y el panel
del local de **NOCHE**. Sin build, sin dependencias, sin API keys.

## Arrancar

```bash
cd nightpulse
python3 -m http.server 8123
```

Abre `http://localhost:8123` en el portátil (doble pantalla: pitch + móvil).
En el móvil, `http://IP_DE_TU_PORTATIL:8123` — ocupa toda la pantalla como PWA.

## Cómo se mide

- **Cola:** sensor Wi-Fi pasivo de 5 $ en la puerta. Detecta móviles en 25 m y
  estima personas y minutos. No requiere app y **no usa fotos**.
- **Aforo:** contador de puerta. Cada QR validado suma 1 dentro de forma
  automática; las salidas las reporta el propio contador. El sensor nunca toca
  el aforo.
- **Accesos:** no hay pestaña de escáner. La validación se hace desde
  *Entrada → Mis entradas → Validar en la puerta*.

## Módulos

1. **Noche** — home con aforo, espera, tu grupo, estado del sensor y accesos rápidos.
2. **Aforo** — contador de puerta, plazas libres, mapa térmico y detalle por local.
3. **Entrada** — reventa P2P con escrow y QR firmado; el aforo sube solo al validar.
4. **Taxi** — código de grupo `NOCHE-247`, plazas, reparto de tarifa, WhatsApp y Sober Squad.
5. **Álbum** — Party Vault bloqueado hasta las 08:00.

## Demo (3:30)

1. **Noche** — aforo 403/420, espera 14 min, 62 móviles detectados. Pulsa
   "Ver aforo y cola".
2. **Aforo** — contador de puerta, plazas libres y mapa térmico.
3. **Entrada** — compra "Nochevieja Universitaria" → "Ver mi entrada" →
   "Validar en la puerta" → el aforo pasa a 404 y se libera el escrow.
   Abre **Panel del local** desde la home para ver el último acceso.
   Repite con "Urban Session": QR manipulado → rechazo y reembolso.
4. **Taxi** — únete a un squad o crea uno, comparte por WhatsApp.
5. **Álbum** — 12 fotos bloqueadas. Panel izquierdo: **Timer 60 s** o **Revelar álbum**.

## Controles del panel izquierdo

- **Revelar álbum**: desbloquea el carrete al instante.
- **Timer 60 s**: reinicia la cuenta atrás a 60 s (modo demo).
- **Reset**: borra el estado guardado en `localStorage`.

## Estructura

- `app.js` — estado, sensor, contador de puerta, escrow, taxis, álbum, panel.
- `styles.css` — shell de doble pantalla + UI del móvil.
- `index.html` — 5 vistas.
- `manifest.webmanifest` / `icon.svg` — PWA.
