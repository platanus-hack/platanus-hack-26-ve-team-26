---
persona: Juan
rama: juan/camara-telefono
sesion: df7aea61-7e34-4d3a-a1b7-8fe84de6e50f
inicio: 2026-10-24 15:09
estado: en curso
---

# La imagen del teléfono en En vivo

## Objetivo

Que la Mac muestre lo que ve el teléfono, con el esqueleto pintado encima, igual que con la webcam: así se entiende qué está pasando.

## Qué se hizo

- Traje a local los 6 commits de la sesión en la nube (`juan-camara-telefono.bundle`), los pusheé y los shippeé (#92).
- Probé con el iPhone real por el túnel: funciona bastante bien, pero en la Mac solo se veía el esqueleto sobre fondo vacío.
- **Contrato:** cada cuadro puede llevar `jpeg` (la imagen de la cámara, base64). Lote hasta 256 KB; el servidor guarda la imagen solo en los últimos 30 cuadros.
- **`data/`:** `createImageGrabber` en el teléfono (15 fps, 480 px el lado largo, JPEG al 60 %, ~20 KB); `createPhoneSender` la manda en el cuadro de su pose y reintenta sin imágenes viejas; `createPhoneCapture` da `onImage` justo antes del `onPose` del mismo cuadro.
- **`web/` (carpeta de César, avisarle):** En vivo pone la imagen en el panel de la cámara, debajo del esqueleto, sin espejo (la cámara trasera filma a otro).

## Qué funcionó y qué no

- `check_relay.py` (35 chequeos) y `check-relay.mjs` con imágenes de tamaño real por el servidor: 58 de 58 imágenes, en orden. `vite build` pasa.
- En el navegador, con un teléfono falso por un túnel: la imagen se ve y el esqueleto cae justo sobre los puntos dibujados en ella.
- No probado todavía con el iPhone real: falta medir si 300 KB/s por el túnel mete atraso.

## Decisiones

- JPEG dentro de los cuadros y no WebRTC: va por el mismo túnel que ya anda, sin NAT ni STUN (el wifi de un evento suele bloquear P2P), y la imagen queda pegada a su pose, así que nunca se desfasan.

## Sigue

- Ship, reiniciar `data/serve.sh` (el servidor viejo no acepta `jpeg`) y probar con el iPhone.
- Si va lento, bajar a 10 fps o 360 px (`IMAGE_FPS`, `IMAGE_LONG_SIDE` en `data/live/src/relay.js`).
- Avisar a César del cambio en `web/src/screens/live.js` y `style.css`.
