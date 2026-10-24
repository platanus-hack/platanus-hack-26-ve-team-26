---
sesion: 681d7f66-e9b3-48ed-a124-57b0942d8f43
inicio: 2026-10-24 18:12
estado: en curso
---

# Brazos que se mueven como los de una persona en En vivo

## Objetivo

Juan reporta en En vivo: el robot no distingue palmas hacia adelante o hacia atrás, y al subir los codos a veces parece que baja las manos. Primero una ronda de planning; después hacer todo (Pastor está en el pitch y César en Simulaciones, así que se tocó `physics/` y la pantalla En vivo de `web/`).

## Qué se hizo

- Plan y resultado en [`docs/investigacion/2026-10-24-brazos-humanos-en-vivo.md`](../investigacion/2026-10-24-brazos-humanos-en-vivo.md) (tareas B0..B8).
- `physics/scripts/check-gestures.mjs` (B0): gestos sintéticos con manos, en `npm run check`.
- `retarget.js` (B1): `wrist_roll` y costo de la normal de la palma; (B4) brazo oculto espejado solo de perfil, `mirroredArm` en el resultado; (B6) lee la palma del modelo de manos si llega `hands`.
- `clearance.js` (B8): pecho, el hombro va hacia adelante; `createLive().opened()`.
- `index.js` `mimic`: devuelve `fixes` y pasa `pose.hands`.
- `motion.js`: clips de cámara se reapuntan con `live` (palmas y muñecas).
- `data/live/src/bones.js` (B2) + `check-bones.mjs`; `createLiveCapture({ hands })` con `HandLandmarker` (B6).
- `web/src/screens/live.js`: `?debug` (distancia y arreglos) y casilla "Seguir las palmas de cerca".

- Escena más clara (prompt aparte): `SCENE_THEME` (`web/src/skeleton.js`), `--scene` y `--panel` de `#0f1112` (casi negro) a `#2b3034` (carbón), piso y grilla a juego. Afecta En vivo, la entrega y toda escena sin "mundo" de Simulaciones. Sin probar en el navegador: el límite de 5 servidores lo ocupan otros chats.

## Qué funcionó

- `npm run check` de `physics/` y de `data/live` pasan enteros; builds de `web/` y `data/live` pasan.
- Palmas: de 78–102° de error a menos de 45° en los 5 casos; 35° el peor con 2 cm de ruido.
- Brazo oculto de frente: antes 22 cm de balanceo inventado, ahora 0,5 cm.

## Qué no funcionó

- Primer pecho con el tope de 60° del hombro: quedaba a 4,1 cm (pedía 5). Hace falta 66°: tope del pecho en 90°.
- El chequeo del tronco (pelvis a cintura) abría el brazo de costado y descruzaba los brazos: el pecho va antes.
- No se pudo probar en el navegador: 5 servidores de otros chats ocupan el límite del folder, y no hay webcam en el panel.

- **En vivo dejó de seguir (roto en `b23e0e2`, arreglado en `98d25ed`):** al reescribir `matchHands` en `data/live/src/index.js` se borró la función `smoothed` que venía después. Cada cuadro con cuerpo tiraba `ReferenceError: smoothed is not defined` y el loop de la cámara moría: no salía el esqueleto y el estado quedaba en "Esperando el permiso de la cámara…". No lo vio ningún check: `vite build` no detecta nombres sin definir y `npm run check` no importa `index.js`. Se encontró en tridi-alpha con una cámara falsa (`caminar.mp4` recortado a la mitad de arriba en un canvas, como `getUserMedia`). Revisado con eslint `no-undef` todo lo tocado en la sesión: sin otros casos.

## Decisiones

- B3 (pesar más el codo) no se hizo: con geometría exacta los codos ya salían bien; la causa era profundidad y espejo.
- El modelo de manos asigna cada mano a la muñeca de la pose más cercana, no por la etiqueta de mano.
- B7 (dedos Dex3) queda para decidir por el peso de las mallas.

## Sigue

- Probar con webcam real con `?debug`: palmas, codos hacia la cámara, brazos cruzados, casilla de manos.
- Avisar a Pastor: se tocó `retarget.js`, `clearance.js`, `motion.js`, `index.js`. Avisar a César: `screens/live.js` y `style.css`.
