# NIGHTPULSE — ClubCheck

Prototipo funcional de los 5 módulos. Sin build, sin dependencias, sin API keys.

## Arrancar

```bash
cd nightpulse
python3 -m http.server 8123
```

Abre `http://localhost:8123` en el portátil (doble pantalla: pitch + móvil).
En el móvil, abre `http://IP_DE_TU_PORTATIL:8123` — ocupa toda la pantalla como PWA.

## Cómo se mide (modelo real)

- **Cola:** sensor Wi-Fi pasivo de 5 $ en la puerta. Detecta los móviles dentro de
  un radio de 25 m y estima personas y minutos. No requiere que nadie instale la app.
  La foto con IA es una verificación puntual que recalibra el sensor.
- **Aforo:** contador de puerta (molinete/escáner). Cada QR validado suma 1 dentro
  de forma automática; las salidas las reporta el propio contador. El radar nunca
  modifica el aforo.

En la demo, el sensor y el tráfico de puerta se simulan en local.

## Guion de demo (3:30)

1. **Radar** — la tarjeta del sensor ya muestra móviles, cola y espera. Después,
   pulsa una escena ("Fila media") para verificar con foto: la IA devuelve personas,
   rango, espera y confianza, y recalibra el sensor.
2. **Aforo** — el contador de puerta manda: dentro/capacidad, entradas, salidas y
   saturación. Toca un local para ver el detalle.
3. **Tickets** — compra "Nochevieja Universitaria" → escrow → "Ver mi entrada" →
   "Escanear en la puerta". Al validar: el aforo de Sala Aurora sube 1 y el pago se
   libera. Repite con "Urban Session": QR manipulado → rechazo y reembolso.
4. **Taxi** — destino, squad, WhatsApp y Sober Squad.
5. **Vault** — 12 fotos bloqueadas hasta las 08:00.

## Controles del panel izquierdo

- **Revelar álbum**: desbloquea el carrete al instante.
- **Timer 60 s**: reinicia la cuenta atrás a 60 s (modo demo).
- **Reset**: borra el estado guardado en `localStorage`.

## Dónde está cada cosa

- `app.js` — estado, sensor simulado, contador de puerta, escrow, taxis, vault.
- `styles.css` — shell de doble pantalla + UI del móvil.
- `index.html` — estructura de las 5 vistas.
- `manifest.webmanifest` / `icon.svg` — instalación como PWA.
