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
- `web/src/screens/live.js`: "Usar el teléfono" vuelve a buscar el servidor si al abrir la página no estaba (antes lo buscaba una sola vez, al cargar).
- `data/live/src/api.js`: un `?api=` que ya no contesta (túnel de un `serve.sh` viejo) deja de ganar: se sigue con la URL guardada y el gist.
- Nota en la [decisión](../decisiones/2026-10-24-web-solo-en-vivo-y-entrega.md).

## Qué funcionó

- `npm run build` pasa. `#/subir` carga en el navegador; sin servidor muestra "Subir videos no está disponible ahora" con Reintentar, cámara y entrega.

- La búsqueda nueva, probada en tridi-alpha con un `?api=` muerto y una URL guardada muerta: encuentra el túnel del gist y `/health` contesta.
- En tridi-alpha, "Usar el teléfono" muestra el QR con el servidor encendido.

## Qué no funcionó

- La web no encontró el servidor que corría Pastor: el gist que lee (`78eb7f16…`, de Juan) estaba en `null`. Solo su dueño puede escribirlo, así que el `serve.sh` de otra persona no lo actualiza.

- El servidor viejo seguía corriendo desde otra copia del repo (`~/Code/platanus-hack-26-ve-team-26`, sin gist): ocupaba el puerto 8000 y el gist quedaba en `null`.
- Probar el teléfono en `localhost:5176` no sirve: el servidor solo acepta CORS de `localhost:5173` y `5174`.

## Decisiones

- El botón estaba apagado en el código, no por el servidor: se prende en el código y el servidor decide si la pantalla deja subir.

## Sigue

- Para la demo: que Juan corra `data/serve.sh` (el gist se actualiza solo), o abrir la web con el `?api=` que imprime el `serve.sh` de Pastor.
