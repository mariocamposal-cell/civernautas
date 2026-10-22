# 03 · Pitch deck · 3 minutos

> **Objetivo:** que el jurado recuerde dos imágenes: el aforo subiendo `+1` en directo y el álbum abriéndose a las 10:00 con el recap ya hecho.
> **Formato:** 9 slides, 2 móviles + 1 portátil espejado a pantalla grande.
> **Ritmo:** ~145 palabras/minuto. El guion completo son ~430 palabras.

---

## Estructura y guion

### Slide 1 · Hook — `0:00 – 0:18`

**Visual:** foto a pantalla completa de una cola a las 3 de la mañana. Texto enorme: **3:47 AM**.

> «Son las 3:47 de la mañana en Madrid. Lucía lleva 40 minutos en la cola. Delante tiene a 200 personas, no sabe cuánto falta, y en la puerta alguien le ofrece una entrada por el triple de su precio. Y mañana, de toda esa noche, solo le quedarán 40 fotos perdidas en cinco móviles distintos.»

*Pausa de un segundo. No expliques todavía.*

---

### Slide 2 · Problema — `0:18 – 0:40`

**Visual:** tres columnas: **ANTES · PUERTA · DESPUÉS**, una frase cada una.

> «La noche está rota en tres momentos. Antes: no sabes si el local está lleno ni si tu entrada es válida. En la puerta: colas a ciegas y reventa sin control. Después: la experiencia se evapora. Los locales pierden ventas y datos. Los usuarios pierden tiempo y dinero. Nadie ha conectado esos tres momentos.»

---

### Slide 3 · Solución — `0:40 – 1:00`

**Visual:** un móvil en el centro; ocho iconos alrededor: login, aforo, cola, QR, mercado, taxi, radar y álbum.

> «Noche es la primera app que une toda la noche. Login sin fricción, aforo en tiempo real, cola virtual por geofencing, reventa segura con tope del 110 %, QR que cambia cada 10 segundos, taxi compartido, radar social y un álbum que se revela a las 10 de la mañana. Todo en una app.»

---

### Slide 4 · Demo 1: aforo y cola — `1:00 – 1:26`

**Visual:** espejo del móvil de Lucía + panel del local en la pantalla grande.

> «Os enseño. Lucía abre la app: Fabrik está al 87 %, con 14 minutos de espera. Entra en la cola desde la puerta, sin hacer fila. *(beat)* El portero escanea su entrada. *(beat)* El aforo sube en la pantalla grande: 412… 413. Ese +1 es la primera vez que el local y el usuario ven exactamente el mismo dato, en el mismo segundo.»

**Cue técnico:** el escaneo debe ocurrir en el segundo 1:18. El panel anima el contador con un pulso y un sonido corto.

---

### Slide 5 · Demo 2: el QR que no se puede capturar — `1:26 – 1:50`

**Visual:** split screen: QR girando + screenshot tachado con una X roja.

> «Y aquí está la clave: el QR rota cada 10 segundos. *(hacer la captura en vivo)* Esa captura ya no sirve. Ni se comparte, ni se revende fuera de la app. La reventa ocurre dentro: precio máximo del 110 %, pago retenido y entrada reemitida. El fraude deja de ser un problema de confianza.»

**Cue técnico:** mostrar la captura en la pantalla grande y escanearla con el móvil del portero: debe fallar con `duplicate_code`. Si falla la cámara, usar el vídeo de respaldo.

---

### Slide 6 · Demo 3: el álbum y el recap — `1:50 – 2:18`

**Visual:** grid de 8 fotos que aparece de golpe + vídeo vertical de 15 s.

> «Y cuando termina la noche, empieza el producto. A las 10:00, el álbum privado del grupo se desbloquea. *(reveal)* Fotos y vídeos que cada uno subió en el momento, ordenados por hora. Y un recap generado con IA, listo para Stories. Esto no es una función: es el motor de adquisición. Cada recap se comparte con decenas de personas que todavía no tienen la app.»

**Cue técnico:** cambiar `app_settings.demo_offset` a `+2 days` justo antes; el countdown pasa a 00:00 y se dispara el confeti. El vídeo ya está renderizado y cacheado.

---

### Slide 7 · Modelo de negocio — `2:18 – 2:42`

**Visual:** tabla de 4 líneas + una cifra grande: **~593 €/noche/local**.

> «¿Cómo ganamos? Cuatro líneas: 8 % de la reventa, Fast-Pass, comisión de taxi y SaaS de aforo para locales a 199 € al mes. Con 1.000 asistentes por evento son unos 593 € por noche. Veinte locales, cuatro noches al mes: 47.000 € de ingresos recurrentes. El local vende más y hace menos cola; nosotros cobramos por transacción.»

| Línea | Supuesto | Ingreso/evento |
|---|---|---|
| Reventa | 50 entradas × 25 € × 8 % | 100 € |
| Fast-Pass | 80 × 4 € × 50 % para el local | 160 € |
| Taxi | 120 viajes × 14 € × 8 % | 134 € |
| SaaS local | plan Pro | 199 € |
| **Total** | 1.000 asistentes | **~593 €** |

> **Nota:** son supuestos de modelado, no tracción. En el escenario, di «nuestro modelo» y no «nuestros datos» si aún no tienes pilotos.

---

### Slide 8 · Foso y hoja de ruta — `2:42 – 2:55`

**Visual:** flywheel: más locales → más datos de aforo → mejor experiencia → más usuarios → más recaps → más locales.

> «Nuestro foso no es el código: es la red. Cuantos más locales y usuarios, mejor es el dato de aforo y más recaps se comparten. Empezamos con tres locales piloto en Madrid. En 90 días: diez locales y 30.000 usuarios.»

---

### Slide 9 · Ask — `2:55 – 3:00`

**Visual:** logo + cifra **350 K €** + QR al demo + contacto.

> «Buscamos 350.000 € pre-seed para ser el sistema operativo de la noche. La noche no necesita otra app de eventos. Necesita que la noche, por fin, funcione. Gracias.»

---

## Coreografía del demo (90 segundos)

| t | Dispositivo | Acción | Qué debe verse | Plan B |
|---|---|---|---|---|
| 0:00 | Pantalla grande | Mapa de Madrid, Fabrik en ámbar | Aforo 87 %, espera 14 min | Captura estática |
| 0:20 | Móvil Lucía | Tap "Unirme a la cola" | Posición 39, ETA 12–18 min | Cola pregrabada |
| 0:35 | Móvil portero | Escanear QR de Lucía | `OK` + aforo 412→413 | Escaneo simulado por botón |
| 0:50 | Móvil Lucía | Screenshot del QR | El código cambia; el escaneo falla | Clip de 8 s |
| 1:10 | Móvil Lucía | Entradas → Comprar reventa | Entrada en “Mis entradas” + aforo en vivo | Compra precargada |
| 1:25 | Pantalla grande | Countdown 09:59:59 → 10:00 | Reveal del álbum + confeti | Álbum ya desbloqueado |
| 1:40 | Pantalla grande | Recap vertical | 15 s de vídeo con música | MP4 local |

**Reglas de oro del demo:**

1. Nunca escribas en vivo: todo lo que se teclea está precargado.
2. Un solo presentador toca los móviles; otro habla. Nadie improvisa.
3. Datos sembrados: 412 dentro, 3 amigos, 8 fotos, 1 recap.
4. WiFi + 4G + vídeo de respaldo descargado en local.
5. Si algo falla, no lo arregles en el escenario: salta al vídeo y sigue hablando.

---

## Datos que debes validar antes de subir al escenario

No inventes cifras delante de un jurado. Estos huecos son para rellenar con 10 llamadas o 20 encuestas:

- % de asistentes que han comprado o vendido una entrada por fuera.
- Minutos medios de cola en los 3 locales piloto.
- % de locales que ya usan Fourvenues/Xceed y qué les falta.
- Precio dispuesto a pagar por Fast-Pass.
- % de fotos que se comparten al día siguiente.

Sustituye los `[ ]` del guion por esos datos **solo si los tienes**. Si no, mantén la narrativa cualitativa: funciona mejor que una cifra falsa.

---

## Preguntas del jurado (y respuestas de 20 s)

**1. ¿La reventa con tope no va contra la ley o contra el usuario?**
Al contrario: la ley europea y española presiona contra el fraude y la especulación. Ponemos un tope del 110 %, identidad verificada, escrow y una entrada reemitida. El usuario puede revender si no puede ir; el especulador no puede hacer negocio.

**2. ¿Cómo arrancáis en frío?**
El wedge es B2B: el panel de aforo y cola se vende al local aunque no haya usuarios. El local lo adopta porque reduce cola y mejora la liquidez de entradas. Después, el álbum hace de motor viral: cada recap expone la app a decenas de amigos. Empezamos con 3 locales y 1.000 usuarios, no con 100 locales vacíos.

**3. ¿Qué os impide que Fourvenues o Dice lo copien?**
Pueden copiar una pantalla, no la red. Nuestro dato de aforo en vivo y el grafo social de grupos se refuerzan con cada local y cada noche. Además, ellos son POS/booking; el post-evento y la capa social no están en su ADN. Nuestra velocidad de iteración es la ventaja de los primeros 18 meses.

**4. Geolocalización y privacidad.**
Opt-in por evento, geohash de ~150 m (nunca lat/lng exactas), TTL de 4 horas y borrado. Sin background tracking. Cumplimiento GDPR desde el día 1: consentimiento, export y borrado en cascada.

**5. Pagos y KYC.**
Stripe Connect (o Mercado Pago en LatAm). El comprador paga con captura manual; el vendedor cobra 24 h después del evento si la entrada no se usó. KYC obligatorio para el payout. Nunca tocamos datos de tarjeta.

**6. ¿El vídeo con IA no es caro/lento?**
El render corre en segundo plano y se cachea por álbum. Plantilla fija + 8 clips: coste marginal de céntimos y < 60 s. Si la IA falla, hay un orden cronológico determinista de respaldo. El usuario nunca espera en directo.

**7. ¿Y si el local no quiere el escáner?**
El portero usa su propio móvil; no hay hardware. Modo offline con manifest firmado y sincronización idempotente. El local no cambia su proceso: cambia su visibilidad.

**8. ¿Cuál es el KPI que os hace o os rompe?**
Tiempo medio de entrada y % de asistentes que suben al álbum. Si bajamos la cola y el álbum se comparte, el ciclo funciona. Si el álbum no se sube, no hay viralidad y el CAC se dispara.

**9. ¿No es demasiado producto para 36 horas?**
El MVP demuestra la cadena completa con dos módulos "reales" (aforo+TOTP y álbum+recap) y el resto simulado de forma creíble. La arquitectura es la de producción; el alcance es el del demo. Lo que no está en el guion, está apagado.

**10. ¿Por qué ahora?**
La experiencia nocturna se ha encarecido y profesionalizado; los locales compiten por datos y los usuarios por experiencias compartibles. La infraestructura (Realtime, pagos, render IA) por fin permite hacerlo sin un equipo de 30 personas.

---

## Checklist de 10 minutos antes de presentar

- [ ] Modo avión en los dos móviles? No: datos + WiFi, notificaciones silenciadas.
- [ ] `app_settings.demo_offset = 0` y `demo_geofence_override = true`.
- [ ] Evento en `live`, aforo 412, cola con 38 personas.
- [ ] Lucía con entrada `issued`, QR rotando, álbum con 8 assets.
- [ ] Recap renderizado y descargado en local.
- [ ] Panel del local abierto en la pantalla grande, zoom 125 %.
- [ ] Vídeo de respaldo de 90 s en el escritorio.
- [ ] Cronómetro visible para el presentador (no para el público).
- [ ] Ensayo cronometrado: 3:00 ± 5 s.

---

## Frases que NO debes decir

- «Es como Tinder para discotecas.» → suena a juguete, no a infraestructura.
- «Usamos IA» sin decir para qué. → di «la IA elige los 8 mejores clips y los ordena».
- «No tenemos competencia.» → demuestra que no has hecho los deberes.
- «Con 1 % del mercado…» → el jurado desconecta. Usa bottom-up: 20 locales × 4 noches.
- «Es solo el MVP.» → todo es un MVP; vende la cadena completa.
