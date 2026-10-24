---
persona: César
rama: cesar/web
sesion: 2128dcdb-7eee-42c2-b4a0-ada7657dbaa2
inicio: 2026-10-24 03:07
estado: en curso
---

# Vuelta al estilo claro, intro de dos slides con el robot real y textos del pitch

## Objetivo

Quitar la presentación corporativa (M9), volver al estilo claro anterior y abrir la web con dos slides: una que explique Tridi con una intro animada y otra para elegir cómo usarlo. Referencia: el `Tridi Design System` armado con Claude (zip local, fuera del repo), en especial `ui_kits/website/Intro.html`.

## Qué se hizo

- Restaurados desde `0304266` (antes de la marca): `web/src/style.css`, `dots/robot.js` (cara del robot), `skeleton.js` (colores claros), y los encabezados de `live.js`, `upload.js`, `offline.js` y `simulations.js`. Vuelven Quicksand y Nunito; salen Geist y Geist Mono.
- `dots/stage.js`: vuelve el fondo de puntos y la cara (`placeFace`); se queda el `morph` fijo que usa la pantalla de carga; nuevo `addScene` para dibujar escenas propias en el mismo canvas.
- `dots/figure.js` (nuevo): persona de puntos que camina, con banda de escaneo y piso de puntos, adaptada del `Intro.html` de la referencia a la paleta clara. Se arma desde una nube en 1,8 s y se dispersa con el scroll.
- `screens/home.js`: dos slides con scroll-snap. Slide 1: qué es Tridi, el problema, los tres pasos y la figura con etiquetas vivas (cabeza, muñeca, rodilla). Slide 2: las tres tarjetas de antes, que suben al aparecer.
- Pantalla de carga y textos del robot otra vez en el tono claro ("Despertando a Tridi…", "¡Hola!").
- Decisión: [`../decisiones/2026-10-24-web-intro-dos-slides-estilo-claro.md`](../decisiones/2026-10-24-web-intro-dos-slides-estilo-claro.md). Plan: M10 en `web/TAREAS.md`.
- Segunda vuelta (César ya habló con Juan): menos texto y mejor uso del espacio. La slide 1 quedó en título, una frase, el flujo Video → Movimiento 3D → Robot y los botones; la figura ocupa 7 de 12 columnas. La slide 2 quedó en el título y las tarjetas, con textos cortos.
- La figura ya no camina: pasa por bailar, boxeo, guitarra y coser, actividades que estiran la movilidad de un robot. Un esqueleto con parámetros (`rig` en `dots/figure.js`: giro e inclinación del torso, ángulos de brazos y piernas, cabeza) pone el pie más bajo en el piso, así que las rodillas dobladas agachan y los muslos horizontales sientan. La guitarra son puntos que salen del torso cuando toca. Una fila bajo la figura marca la actividad y permite saltar a otra.
- Tercera vuelta: la pantalla de carga perdió la animación de puntos (la volvía lenta) y queda en nombre, barra y estado, con un mínimo de 0,9 s. En la slide 1, el G1 real reemplaza a la figura de puntos: pasa solo por los movimientos precargados que tienen `RobotMotion` guardado (caminar y correr, 9 s cada uno; `hasSavedMotion` en `web/src/motions.js`), y tras un empujón la etiqueta dice "se recupera solo" y a los 4 s vuelve al movimiento. César no quiso botones para elegir el movimiento. Textos tomados del pitch del equipo. Se borraron `dots/figure.js` y `addScene`, que ya no se usaban.
- Cuarta vuelta, con lo que recolectaron Pastor y Juan: el pitch del producto (`docs/pitch/pitch-producto.md`, `8078d4c`) y el plan técnico (`docs/plan-producto.md`). La slide 1 abre con "La IA aprendió a hablar leyendo internet. La IA física no tiene un internet de movimiento" y dice "Convierte video en datos de entrenamiento para robots". Bajo el robot, tres cifras medidas (4 de 4 empujones de 250 N, 73 min, red de 265 KB). La etiqueta del robot dice "movimiento de un video", y la slide 2 aclara que la caminata aprendida y los datos corregidos siguen en desarrollo, según la tabla de qué es verdad hoy del pitch. La tarjeta de Subir dice que el video se borra.
- `AGENTS.md` (commit aparte, archivo del equipo): describe el producto con el pitch nuevo y pide revisar la tabla de qué es verdad hoy antes de escribir textos.

## Qué funcionó

- Capturas con `puppeteer-core` y Chrome sin GPU, en 1280×800 y 390×844: pantalla de carga con la cara, figura armándose, figura caminando con etiquetas, transición (la figura se dispersa y suben las tarjetas) y slide 2. Sin desborde horizontal ni errores en la consola.
- Simulaciones con el estilo claro y el robot repitiendo el clip; al salir del inicio se quita el scroll-snap.
- `npm run build` pasa.
- Robot de la slide 1, con Chrome sin GPU: empieza caminando, a los 9 s corre, el empujón cambia la etiqueta a "se recupera solo" y luego retoma el movimiento. Sin desborde en 390 px.
- Las cuatro actividades, en capturas de 1280×800 y 390×844: se reconocen el baile, la guardia de boxeo, la guitarra y la costura sentada; la fila de actividades marca la actual.

## Qué no funcionó

- El repo privado `platanus-ideas` no está en esta máquina ni aparece con `gh`: lo del producto se tomó del repo público.

- Si el cambio automático de movimiento caía justo después de un empujón, el robot retomaba el clip antes de recuperarse: el empujón ahora pausa la alternancia.

- La fila de actividades se partía en dos líneas (con `left: 50%` su ancho quedaba limitado a la mitad) y tapaba los pies: `width: max-content` y la cámara mira un poco más abajo.
- La guitarra se confundía con el torso; ahora sale más adelante y es más grande.

- En celular, la slide 1 dejaba los botones fuera de la pantalla. Se compactó: los tres pasos en una fila solo con su nombre, y textos más chicos.
- Las clases viejas `.intro-text` e `.intro-grid` de la hoja restaurada le daban estilo de tarjeta al texto de la slide; la slide usa `.intro-copy` y las viejas se borraron (ningún archivo las usaba).

## Decisiones

- Del pitch solo se puso en la web lo que el repo respalda: el entrenamiento empuja al robot (`PUSH_EVERY_S` en `training/env.py`), pero no hay piedras, viento, piso resbaloso ni cambios de peso, así que eso no aparece.

- Las tarjetas de la slide 2 usan los robots de puntos de antes, no las escenas del zip (elección de César).
- La vuelta al estilo claro contradice la decisión "innegociable" de Juan; se registró como decisión de César enlazando la suya, sin editarla.

## Sigue

- Pastor: pasar la raíz de Vercel a `web/`.
