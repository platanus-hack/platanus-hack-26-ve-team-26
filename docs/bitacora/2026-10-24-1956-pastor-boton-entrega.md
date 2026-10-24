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
