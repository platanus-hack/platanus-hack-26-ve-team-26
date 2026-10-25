---
persona: Pastor
rama: pastor/fisica
sesion: 3310e0cf-2178-48c1-82df-2369fafc667d
inicio: 2026-10-24 19:56
estado: en curso
---

# Un botón de la landing a la entrega

## Objetivo

Que el capítulo "Tridi Policy" de la landing, que habla de la política entrenada y de los datos, lleve a la página donde se ven (`#/entrega`).

## Qué se hizo

- Rama sincronizada con `main` (rebase sin conflictos).
- `web/src/screens/home.js` y `web/src/landing/landing.css` (carpeta de César y Juan): botón "Ver los datos entrenados →" bajo la nota del capítulo Policy, con el estilo de "Empújalo" (`btn btn-signal btn-small`) y `data-warm`, que precarga la pantalla de la entrega al pasar el mouse. En celular la nota se oculta pero el botón queda.

## Qué funcionó

- En el navegador: el botón aparece en el capítulo Policy en escritorio y a 375 px (sin scroll horizontal), y abre `#/entrega` con la entrega de Caminar. `vite build` pasa.

## Qué no funcionó

- Nada del botón. La consola muestra errores de CORS contra un túnel de `trycloudflare.com` que el gist del servidor de videos todavía publica y que ya no responde: es el servidor de videos, no este cambio.

## Sigue

- Avisar a César y Juan del botón en la landing.
- Pendiente de la sesión anterior: el despliegue del servidor en Render (`data/Dockerfile` y `.dockerignore` sin commitear, sin probar).

## Parte 2: el botón también en la caja Entrenar

- Pastor buscaba el botón en Simulaciones, no en la landing (lo vio por captura). `web/src/training.js` (de César): "Ver los datos entrenados →" en la caja "Entrenar al robot con este movimiento", bajo el botón de entrenar, visible aunque el servidor esté apagado. Abre `#/entrega` (la entrega de Caminar). El botón de la landing se queda.
- Probado en local con un clip de cámara de prueba: aparece en la caja y abre la entrega. `vite build` pasa.

## Parte 3: el esqueleto sobre la persona en el video de la landing

- **Qué pasó:** Pastor notó que en Capture de la landing no hay tracking sobre la persona del video. Nunca lo hubo: desde `2c67918` (Juan) la landing muestra el video y, aparte, el esqueleto 3D. El dibujo sobre el video lo agregó César en Simulaciones (`114b22e`) y en el ejemplo de Subir (`59d8b8b`); en Simulaciones sigue funcionando.
- **`web/src/video-overlay.js`** (de César): el dibujo se separa en `createPoseDrawing(video, canvas, { fit })`, que dibuja el cuadro más cercano del archivo de poses con el ajuste del video (`contain` o `cover`). `createVideoOverlay` (Simulaciones, Subir) lo usa igual que antes.
- **Landing** (`screens/home.js`, `landing/landing.css`, de Juan y César): un canvas sobre el video de Capture dibuja `caminar.pose2d.json` con `cover`, en el mismo reloj que ya mueve video, esqueleto 3D y robot (`walk.t`), así también retrocede cuando el scroll sube.

### Qué funcionó

- En el navegador: escritorio y 375 px, el esqueleto queda sobre el cuerpo; al subir el scroll el video retrocede y el dibujo cambia con él; Simulaciones sigue dibujando sobre su video. Sin errores nuevos en la consola. `vite build` pasa.

### Sigue

- Avisar a Juan y César (landing y `video-overlay.js` son suyos).
