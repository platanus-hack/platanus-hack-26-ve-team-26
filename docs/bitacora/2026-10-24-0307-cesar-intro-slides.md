---
persona: César
rama: cesar/web
sesion: 2128dcdb-7eee-42c2-b4a0-ada7657dbaa2
inicio: 2026-10-24 03:07
estado: en curso
---

# Inicio de dos slides, WEB-1 y mundos (SIM-3)

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
- WEB-1 (plan del producto): la cámara de En vivo graba desde que se enciende, con contador hasta 30 s, "Parar y guardar" y guardado al apagarla o salir. El clip va a la galería como "Tu cámara · hh:mm" y se abre en Simulaciones, donde el robot lo repite (movimiento calculado en el navegador). El resultado tiene su propio bloque, porque la línea de estado se reescribe cada segundo. Falta mandarlo al servidor (`POST /clips`, SRV-1).
- SIM-3 (mundos), en la carpeta de Pastor con commits propios: `physics/worlds/` (plano, piedras, resbaloso, viento) con el formato de "Mundos" del contrato que propuso Pastor (`9d2bab0`); `sim.applyWorld` (fricción en los pares de contacto con el piso, masas e inercias con `mj_setConst`, `kp`/`kv` y topes de torque, viento como fuerza en el torso por arrastre: 10 m/s ≈ 30 N); escena de piedras generada (`npm run make-stones-scene`: mapa de alturas de 161×161 celdas de 5 cm, piedras de hasta 3 cm, semilla fija) que el visor ahora dibuja; `view.setWorld` en `index.js` (con otra escena recarga el modelo y la política); `check-worlds` dentro de `npm run check`. En la web, selector "Mundo" en Simulaciones.
- Estado al cierre de esta parte (24/10, ~05:30): el lector de mundos en Python para `training/` quedó delegado a Juan (con ENT-3). Juan rehízo la landing en `web/` (cinemática oscura, el G1 real como cámara, GSAP y Lenis; su [decisión de marca](../decisiones/2026-10-24-marca-instrumento-de-laboratorio.md)), así que las dos slides de esta sesión quedaron reemplazadas y su decisión marcada como tal. En el rebase conservó los estilos de grabación de WEB-1 y frases del inicio de César. También entraron SIM-1 y SIM-2 (Pastor) y SRV-1, SRV-2 y SRV-3 (Juan): WEB-2 y WEB-3 ya no están bloqueadas, y el contrato aceptó el formato de mundos de SIM-3.
- Ajustes a la landing de Juan, pedidos por César: el piso es una calle (`web/src/landing/street.js`, textura dibujada por código: acera de losas de 1 m, bordillo, asfalto con línea discontinua, otra acera; la acera corre a lo largo de la caminata, que va hacia −z en three.js) y la cuadrícula se esconde mientras la landing tiene el robot; un velo fijo (`.film-wash`, `updateWash` en `home.js`) reemplaza los velos de cada sección, que dejaban una línea recta al terminar cada una; Capture pasó de 420svh a 200svh, con video, esqueleto y robot a la vez y un solo texto; Gym pasó de 460svh y cinco niveles por scroll continuo a 300svh y tres etapas con sus cifras medidas, y la curva se dibuja hasta la etapa en pantalla. En celular, Gym muestra solo la etapa activa, abajo.

## Qué funcionó

- Capturas con `puppeteer-core` y Chrome sin GPU, en 1280×800 y 390×844: pantalla de carga con la cara, figura armándose, figura caminando con etiquetas, transición (la figura se dispersa y suben las tarjetas) y slide 2. Sin desborde horizontal ni errores en la consola.
- Simulaciones con el estilo claro y el robot repitiendo el clip; al salir del inicio se quita el scroll-snap.
- `npm run build` pasa.
- Landing en 1280×800 y 375×812: la calle se ve bajo el robot en todas las tomas, el paso de Capture a Gym no deja franjas, las tres etapas cambian el checkpoint del robot y la curva, sin errores en la consola ni desborde.
- SIM-3: `npm run check` de `physics/` pasa entero (check, retarget, policy, worlds). Cada mundo carga y sus parámetros llegan a MuJoCo. La política de hoy (entrenada en plano) aguanta 10 s de pie con los valores del medio de los cuatro mundos; con 40 N de viento se cayó a los 3,5 s. En el navegador: el selector cambia de mundo, el terreno de piedras se ve, el robot retoma el clip, Empujar funciona en Viento, y al volver al inicio el robot está en plano.
- WEB-1 con la cámara falsa de Chrome (sin persona): empieza a grabar al encender, el contador avanza, Parar muestra "No se vio a nadie lo suficiente" con "Grabar otro", y la segunda grabación se detiene sola en 0:30. **No se probó con una persona real**: el camino que guarda el clip falta verlo con una webcam.
- Robot de la slide 1, con Chrome sin GPU: empieza caminando, a los 9 s corre, el empujón cambia la etiqueta a "se recupera solo" y luego retoma el movimiento. Sin desborde en 390 px.
- Las cuatro actividades, en capturas de 1280×800 y 390×844: se reconocen el baile, la guardia de boxeo, la guitarra y la costura sentada; la fila de actividades marca la actual.

## Qué no funcionó

- La primera textura de la calle salía casi blanca: la landing ilumina fuerte al robot (luz en la cámara y exposición 1,35) y lavaba el texto del hero. Se bajaron los tonos a la mitad.
- En celular, las tres etapas y la curva tapaban al robot: ahí solo se ve la etapa activa.

- La primera versión de los mundos usaba otros nombres (`name`, viento en N, `push_newtons`); en medio llegó la propuesta de contrato de Pastor con `title`, `wind_mps` y `push_n`, y se alineó a ella.
- Para dibujar las piedras hubo que confirmar el orden de las filas del mapa de alturas: con `mj_ray` sobre la piedra más alta, la fila 0 está en −y.

- El aviso de grabación fallida se mostraba en la línea de estado y la reescribía el mensaje de cada segundo ("No te veo…"): ahora va en su propio bloque.

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

- César: la landing y las pantallas de la app con el estilo nuevo (M12 en `web/TAREAS.md`), mandar el clip de la cámara (`POST /clips`), WEB-2 y WEB-3.

- Pastor: revisar SIM-3 en `physics/` (es su carpeta).
- Juan (ENT-3): el lector de `physics/worlds/` en Python para `training/env.py`, aplicando lo mismo que `sim.applyWorld` (misma fórmula de viento).

- César: probar WEB-1 con una webcam real (guardar un clip y verlo en Simulaciones). Mandar el clip al servidor cuando Juan tenga `POST /clips` (SRV-1).

- Pastor: pasar la raíz de Vercel a `web/`.
