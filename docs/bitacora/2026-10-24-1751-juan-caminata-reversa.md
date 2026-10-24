---
persona: Juan
rama: juan/movimiento-vivo
sesion: 191d6a4c-cdba-4ea0-8295-b3114403cef7
inicio: 2026-10-24 17:51
estado: cerrada
---

# La caminata de la landing va al revés al subir

## Objetivo

Al hacer scroll hacia arriba en la landing, la caminata de Capture debía ir al revés, con el robot caminando hacia atrás, para que subir la página se lea como rebobinar la historia.

## Qué se hizo

- `web/src/screens/home.js` (carpeta de César): la caminata ahora tiene su propio reloj (`walk`, `updateWalk`, `updateScrollDir`).
  - Hacia abajo, todo sigue igual: el video lleva el reloj y el robot y el esqueleto lo siguen.
  - Hacia arriba, el video queda en pausa y salta hacia atrás frame a frame. El robot y el esqueleto usan ese mismo tiempo, y en 0 vuelve al final del clip.
  - Si se entra a Capture desde abajo, la caminata empieza al final del clip y no en el 0.
- `DIR_PX = 0,5 px`: los movimientos más chicos no cambian la dirección. Es lo que mueve Lenis al frenar, y sin el umbral la dirección cambiaría al final de cada scroll.

## Qué funcionó

- `vite build` pasa.

## Qué no funcionó

- No se probó en el navegador: el dev server de 5174 es de otro chat y el navegador de esta sesión no llega a él.

## Decisiones

- El video retrocede con seeks y no con `playbackRate` negativo, porque los navegadores no reproducen video al revés. Se hace un seek a la vez (`video.seeking`): pedir uno en cada frame dejaba al video atrasado y trabado.

## Sigue

- Probarlo en el navegador, sobre todo que el video no se trabe al retroceder en el celular.
- Hacia atrás, al pasar de 0 al final del clip, el robot salta sin suavizado. Hacia adelante sí se suaviza (`sampleLoopStart` en `physics/src/index.js`).
- Avisarle a César: el cambio está en `web/`.
