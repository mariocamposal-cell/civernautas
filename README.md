# NIGHTPULSE — ClubCheck

Fusión de **NIGHTPULSE** (aforo, escrow, taxi, carrete) con la home y el panel
del local de **NOCHE**. Datos de **Santiago de Compostela**. Sin build, sin
dependencias, sin API keys.

## Arrancar

```bash
python3 -m http.server 8123
```

Abre `http://localhost:8123` en el portátil (doble pantalla: pitch + móvil).
En el móvil, `http://IP_DE_TU_PORTATIL:8123` — ocupa toda la pantalla y se puede
instalar como PWA (service worker + iconos 192/512).

## Acceso

Al abrir pide **email, contraseña y fecha de nacimiento**. Puedes seleccionar
cualquier fecha, también la de un menor, pero si no tienes 18 años no deja
entrar. La sesión se guarda en `sessionStorage`: al cerrar la pestaña o la app
se cierra sola. También hay botón de cerrar sesión en la cabecera.

- Cuenta demo: botón **"Probar con cuenta demo"**.
- No hay backend: es una validación de demo. La contraseña no se almacena.

## Monedero y cuenta

Arriba a la derecha del móvil hay un chip con el **saldo** (empieza en 50,00 €).
Al pulsarlo se abre **Tu cuenta**:

- Email y edad (+18) de la sesión.
- Saldo, con recargas demo de +10 / +20 / +50 €.
- **Karma**: +10 por reporte de aforo (máximo uno por local y noche) y +10 al validar una entrada. Canjeables en la misma cuenta: **100 → 1 € · 250 → 3 € · 500 → 7 €**. Al canjear, el importe se suma al monedero al instante.
- **Historial**: compradas y vendidas de tu cuenta. En cada entrada puedes pulsar el nombre del vendedor para ver su perfil (vendidas, compradas, valoración y entradas activas).
- Entradas y ciudad.
- Acceso a “Mis entradas” y **Cerrar sesión**.

Al comprar se comprueba el saldo: si no llega, el botón de pago se sustituye por
“Añadir 20 € y continuar”. El importe total (entrada + 10%) se descuenta del
monedero y, si la entrada se rechaza en la puerta, se devuelve íntegro.

## Aforo híbrido

El porcentaje que se muestra es una estimación ponderada:

```
aforo = 55% · (puerta + entradas usadas)
      + 30% · reportes 1-tap de usuarios
      + 15% · cola estimada (personas en cola)
```

- **Puerta + entradas:** contador exacto (`inside`) y cada QR validado suma +1.
- **Reportes 1-tap:** 🟢 Fluido (40%) · 🟡 Pista llena (70%) · 🔴 Aforo máximo (95%).
  Cada reporte pesa la mitad cada 30 minutos y caduca a los 90.
- **Cola estimada:** personas en la cola según el sensor Wi-Fi (móviles × 1,35).
  Se normaliza por capacidad: una cola del **20% de la capacidad** equivale al
  100% de presión; el valor se limita a 0-99. No modifica el contador exacto.
- Cada **reporte de aforo** da **+10 karma** (máximo uno por local y noche) y
  validar una entrada da otros **+10**. El karma se canjea por saldo del monedero
  en **Tu cuenta** (100 → 1 € · 250 → 3 € · 500 → 7 €).

El contador exacto sigue visible en Aforo; el % es la estimación híbrida.

## Locales (Santiago)

| Local | Dirección | Zona |
|---|---|---|
| Circus | Rúa de Alfredo Brañas, 6 | Ensanche |
| Blaster | R. da República Arxentina, 6 | Ensanche |
| Way Club | Rúa Nova, 13 | Centro |
| REM | Rúa Nova de Abaixo, 26 | Ensanche |
| Tarasca | Rúa de Entremuros, 13 | Zona Vella |
| Momo | Rúa da Virxe da Cerca, 23 | Zona Vella |

Aforos y colas de la demo son simulados; direcciones y coordenadas, reales.

## Cómo se mide la cola

- **Sensor Wi-Fi pasivo de 5 $** en la puerta. Detecta móviles en 25 m y estima
  personas y minutos. No requiere app y **no usa fotos**.
- El aforo híbrido se calcula aparte (ver arriba).
- **Accesos:** no hay escáner ni cámara simulada. La validación de la entrada es
  instantánea desde *Entrada → Mis entradas → Validar en la puerta* o con el
  botón **Validar entrada** del Aforo.

## Módulos

1. **Noche** — home con aforo, espera, tu grupo, sensor y accesos rápidos.
2. **Aforo** — contador de puerta, plazas libres, mapa térmico de Santiago y detalle.
3. **Entrada** — reventa P2P con escrow y QR firmado; el aforo sube al validar y
   ganas +10 karma al entrar.
4. **Taxi** — código `NOCHE-247`, plazas, reparto, WhatsApp y Sober Squad.
5. **Álbum** — Party Vault bloqueado hasta las 08:00.

## Demo (3:30)

1. **Noche** — Circus 94% estimado · 469/500 · espera 11 min · 47 móviles. "Ver aforo y cola".
2. **Aforo** — contador de puerta, plazas libres y mapa con los 6 locales.
3. **Entrada** — compra "Noche Universitaria" con el monedero: si no hay saldo,
   recarga. "Validar en la puerta" → el contador sube 1, se libera el escrow y
   ganas +10 karma. "Entrar al local" abre el **reporte de aforo 1-tap** (+10
   karma, uno por local y noche). Repite con "Urban Session": QR manipulado →
   rechazo y **devolución al monedero**. En **Tu cuenta** puedes canjear 100
   Karma → 1 € de saldo.
4. **Taxi** — únete a un squad o crea uno, comparte por WhatsApp.
5. **Álbum** — 12 fotos bloqueadas. Panel izquierdo: **Timer 60 s** o **Revelar álbum**.

Las entradas en venta llevan la fecha "HOY" del día actual. Si la demo sigue
abierta después de medianoche, las compras antiguas quedan como "no es para hoy".

## Controles del panel izquierdo

- **Revelar álbum**: desbloquea el carrete al instante.
- **Timer 60 s**: reinicia la cuenta atrás a 60 s (modo demo).
- **Reset**: borra el estado guardado en `localStorage`.

## Estructura

- `app.js` — estado, login/edad, sensor, contador, escrow, taxis, álbum, panel.
- `styles.css` — shell de doble pantalla + UI del móvil.
- `index.html` — login + 5 vistas.
- `manifest.webmanifest` / `icon.svg` / `icons/` — PWA instalable.
- `sw.js` — service worker (network-first + caché offline).
