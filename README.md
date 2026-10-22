# NIGHTPULSE — ClubCheck

Fusión de **NIGHTPULSE** (aforo, escrow, taxi, carrete) con la home y el panel
del local de **NOCHE**. Datos de **Santiago de Compostela**. Sin build, sin
dependencias, sin API keys.

## Arrancar

```bash
cd nightpulse
python3 -m http.server 8123
```

Abre `http://localhost:8123` en el portátil (doble pantalla: pitch + móvil).
En el móvil, `http://IP_DE_TU_PORTATIL:8123` — ocupa toda la pantalla como PWA.

## Acceso

Al abrir pide **email, contraseña y fecha de nacimiento**. Si no tienes 18 años
no deja entrar. La sesión se guarda en `sessionStorage`: al cerrar la pestaña o
la app se cierra sola. También hay botón de cerrar sesión en la cabecera.

- Cuenta demo: botón **"Probar con cuenta demo"**.
- No hay backend: es una validación de demo. La contraseña no se almacena.

## Locales (Santiago)

| Local | Dirección | Zona |
|---|---|---|
| Circus | Rúa de Alfredo Brañas, 6 | Ensanche |
| Blaster | R. da República Arxentina, 6 | Ensanche |
| Way Club | Rúa Nova, 13 | Centro |
| REM | Rúa Nova de Abaixo, 26 | Ensanche |
| Tarasca | Rúa de Entremuros, 13 | Zona Vella |
| Momo | Rúa da Virxe da Cerca, 23 | Zona Vella |

Aforos, colas y coordenadas de la demo son simulados; direcciones reales.

## Cómo se mide

- **Cola:** sensor Wi-Fi pasivo de 5 $ en la puerta. Detecta móviles en 25 m y
  estima personas y minutos. No requiere app y **no usa fotos**.
- **Aforo:** contador de puerta. Cada QR validado suma 1 dentro de forma
  automática; las salidas las reporta el propio contador. El sensor nunca toca
  el aforo.

## Módulos

1. **Noche** — home con aforo, espera, tu grupo, sensor y accesos rápidos.
2. **Aforo** — contador de puerta, plazas libres, mapa térmico de Santiago y detalle.
3. **Entrada** — reventa P2P con escrow y QR firmado; el aforo sube al validar.
4. **Taxi** — código `NOCHE-247`, plazas, reparto, WhatsApp y Sober Squad.
5. **Álbum** — Party Vault bloqueado hasta las 08:00.

## Demo (3:30)

1. **Noche** — Circus 468/500, espera 12 min, 53 móviles. "Ver aforo y cola".
2. **Aforo** — contador de puerta, plazas libres y mapa con los 6 locales.
3. **Entrada** — compra "Nochevieja Universitaria" → "Validar en la puerta" →
   el aforo sube 1 y se libera el escrow. **Panel del local** muestra el acceso.
   Repite con "Urban Session": QR manipulado → rechazo y reembolso.
4. **Taxi** — únete a un squad o crea uno, comparte por WhatsApp.
5. **Álbum** — 12 fotos bloqueadas. Panel izquierdo: **Timer 60 s** o **Revelar álbum**.

## Controles del panel izquierdo

- **Revelar álbum**: desbloquea el carrete al instante.
- **Timer 60 s**: reinicia la cuenta atrás a 60 s (modo demo).
- **Reset**: borra el estado guardado en `localStorage`.

## Estructura

- `app.js` — estado, login/edad, sensor, contador, escrow, taxis, álbum, panel.
- `styles.css` — shell de doble pantalla + UI del móvil.
- `index.html` — login + 5 vistas.
- `manifest.webmanifest` / `icon.svg` — PWA.
