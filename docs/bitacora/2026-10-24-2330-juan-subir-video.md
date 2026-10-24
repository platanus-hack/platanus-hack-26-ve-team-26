---
persona: Juan
rama: juan/movimiento-vivo
sesion: fadb4492-a99c-43c8-a07a-3424eb9e6e85
inicio: 2026-10-24 23:30
estado: cerrada
---

# Subir video, prendido otra vez

## Objetivo

Que la tarjeta "Sube un video de una persona" deje de decir "Próximamente" y funcione con el servidor de videos.

## Qué se hizo

- `web/src/router.js`: la ruta `#/subir` vuelve.
- `web/src/screens/home.js`: la tarjeta es un enlace ("Elegir un video →").
- `web/src/screens/upload.js`: los enlaces a `#/simulaciones` (pantalla borrada) van a En vivo, a la entrega y al inicio.
- Nota en la [decisión](../decisiones/2026-10-24-web-solo-en-vivo-y-entrega.md).

## Qué funcionó

- `npm run build` pasa. `#/subir` carga en el navegador; sin servidor muestra "Subir videos no está disponible ahora" con Reintentar, cámara y entrega.

## Qué no funcionó

- La web no encontró el servidor que corría Pastor: el gist que lee (`78eb7f16…`, de Juan) estaba en `null`. Solo su dueño puede escribirlo, así que el `serve.sh` de otra persona no lo actualiza.

## Decisiones

- El botón estaba apagado en el código, no por el servidor: se prende en el código y el servidor decide si la pantalla deja subir.

## Sigue

- Para la demo: que Juan corra `data/serve.sh` (el gist se actualiza solo), o abrir la web con el `?api=` que imprime el `serve.sh` de Pastor.
