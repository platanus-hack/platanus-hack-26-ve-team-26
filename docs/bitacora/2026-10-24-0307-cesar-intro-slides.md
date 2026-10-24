---
persona: César
rama: cesar/web
sesion: 2128dcdb-7eee-42c2-b4a0-ada7657dbaa2
inicio: 2026-10-24 03:07
estado: en curso
---

# Vuelta al estilo claro e intro de dos slides

## Objetivo

Quitar la presentación corporativa (M9), volver al estilo claro anterior y abrir la web con dos slides: una que explique Tridi con una intro animada y otra para elegir cómo usarlo. Referencia: el `Tridi Design System` armado con Claude (zip local, fuera del repo), en especial `ui_kits/website/Intro.html`.

## Qué se hizo

- Restaurados desde `0304266` (antes de la marca): `web/src/style.css`, `dots/robot.js` (cara del robot), `skeleton.js` (colores claros), y los encabezados de `live.js`, `upload.js`, `offline.js` y `simulations.js`. Vuelven Quicksand y Nunito; salen Geist y Geist Mono.
- `dots/stage.js`: vuelve el fondo de puntos y la cara (`placeFace`); se queda el `morph` fijo que usa la pantalla de carga; nuevo `addScene` para dibujar escenas propias en el mismo canvas.
- `dots/figure.js` (nuevo): persona de puntos que camina, con banda de escaneo y piso de puntos, adaptada del `Intro.html` de la referencia a la paleta clara. Se arma desde una nube en 1,8 s y se dispersa con el scroll.
- `screens/home.js`: dos slides con scroll-snap. Slide 1: qué es Tridi, el problema, los tres pasos y la figura con etiquetas vivas (cabeza, muñeca, rodilla). Slide 2: las tres tarjetas de antes, que suben al aparecer.
- Pantalla de carga y textos del robot otra vez en el tono claro ("Despertando a Tridi…", "¡Hola!").
- Decisión: [`../decisiones/2026-10-24-web-intro-dos-slides-estilo-claro.md`](../decisiones/2026-10-24-web-intro-dos-slides-estilo-claro.md). Plan: M10 en `web/TAREAS.md`.

## Qué funcionó

- Capturas con `puppeteer-core` y Chrome sin GPU, en 1280×800 y 390×844: pantalla de carga con la cara, figura armándose, figura caminando con etiquetas, transición (la figura se dispersa y suben las tarjetas) y slide 2. Sin desborde horizontal ni errores en la consola.
- Simulaciones con el estilo claro y el robot repitiendo el clip; al salir del inicio se quita el scroll-snap.
- `npm run build` pasa.

## Qué no funcionó

- En celular, la slide 1 dejaba los botones fuera de la pantalla. Se compactó: los tres pasos en una fila solo con su nombre, y textos más chicos.
- Las clases viejas `.intro-text` e `.intro-grid` de la hoja restaurada le daban estilo de tarjeta al texto de la slide; la slide usa `.intro-copy` y las viejas se borraron (ningún archivo las usaba).

## Decisiones

- Las tarjetas de la slide 2 usan los robots de puntos de antes, no las escenas del zip (elección de César).
- La vuelta al estilo claro contradice la decisión "innegociable" de Juan; se registró como decisión de César enlazando la suya, sin editarla.

## Sigue

- César: hablar con Juan sobre el estilo.
- Pastor: pasar la raíz de Vercel a `web/`.
