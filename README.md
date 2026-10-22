# CIVERNAUTAS · NOCHE

Demo navegable del MVP de ocio nocturno **NOCHE**: aforo en vivo, QR TOTP,
escáner, mercado de entradas, taxi compartido, álbum privado y recap.

La aplicación está dentro de la carpeta [`nightlife-mvp/`](nightlife-mvp/).

## Ejecutar en 30 segundos

Necesitas **Python 3** y un navegador. No hace falta Node, Supabase ni compilar nada.

```bash
cd nightlife-mvp
./start.sh
```

Se abre automáticamente en:

```text
http://localhost:8081
```

Si `./start.sh` no funciona, ejecuta el servidor a mano:

```bash
cd nightlife-mvp/web
python3 -m http.server 8081
```

Y abre `http://localhost:8081` en el navegador.

> **Importante:** no abras `index.html` con doble clic (`file://`). La cámara y
> `BroadcastChannel` necesitan `http://localhost`.

## Qué puedes probar

- **Noche**: aforo en directo, cola virtual y accesos rápidos.
- **Entrada**: mercado con *Comprar*, *Vender* y *Mis entradas*, más aforo en vivo.
- **Taxi**: crear grupo, unirse con el código `NOCHE-247`, repartir tarifa y seguir el viaje.
- **Escáner**: escanear el ticket de Lucía y ver el aforo actualizarse.
- **Aforo**: ocupación, plazas libres, cola y espera estimada.
- **Álbum**: revelado de recuerdos y recap vertical.

El panel del local se abre con el icono de barras de la cabecera y se sincroniza
por `BroadcastChannel`.

## Tests

```bash
cd nightlife-mvp
npm install
npm test
```

## Estructura

```text
.
├── README.md                 # este archivo
└── nightlife-mvp/
    ├── start.sh              # arranca el servidor y abre el navegador
    ├── web/                  # demo HTML/CSS/JS autocontenida
    ├── db/                   # esquema PostgreSQL/Supabase y seed
    ├── docs/                 # arquitectura, modelo de datos y pitch
    ├── lib/                  # TOTP real y tests
    └── scripts/              # utilidades de demo
```

Más detalle en [`nightlife-mvp/README.md`](nightlife-mvp/README.md) y en
[`nightlife-mvp/web/README.md`](nightlife-mvp/web/README.md).
