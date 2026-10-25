---
persona: Juan
rama: juan/movimiento-vivo
sesion: 45c07dd9-7da3-4dcb-89c6-230efa249ae7
inicio: 2026-10-24 20:19
estado: cerrada
---

# Wordmark, scroll por paradas y pulido de UI

## Objetivo

- Que el texto del logo ("tridi") se lea bien en el header y en el footer de la landing.
- Que el scroll de la landing en desktop no se sienta largo e incómodo: con Enter (parada a parada) se sentía bien, con rueda o trackpad no.

## Qué se hizo

- `web/src/style.css` (`.wm`, `.wm-i::after`): peso 800 → 700, tracking -0.06em → -0.015em; puntos cuadrados de las i de 0.19em a 0.15em y subidos (`top` 0.16em → 0.06em) para que no toquen el palito. Commit `da4979f`.
- `web/src/landing/landing.css` (`.wordmark`, `.wordmark.big`): header a peso 700; footer con tracking -0.075em → -0.03em.

- `web/src/screens/home.js`: `gymGate` pasa a `wheelPage` + `wheelStep`. En desktop cada gesto de rueda o trackpad desliza a la parada siguiente o anterior (las mismas de Enter y espacio: Capture, las 4 etapas del Gym, Policy, Probar); el resto de la ráfaga y la inercia del trackpad se ignoran. Un gesto nuevo es una pausa de 200 ms, un cambio de dirección o un delta que vuelve a crecer (1,5x). Si llega un gesto mientras una etapa del Gym retiene el scroll, queda en cola y avanza al terminar (antes se perdía y había que deslizar dos veces). Debajo de la última parada el footer scrollea libre. Teléfonos y touch, sin cambios. Commit `2c010da`.

- Footer: el wordmark grande ahora es exactamente el del header (cubo + "tridi"), con logo y separación en `em` para que escale igual (`landing.css`, `home.js`). Commit `1eaa484`.
- Selects: chevron propio con aire a la derecha (`appearance: none` + SVG), el nativo quedaba pegado al borde (`style.css`). Commit `dfe7187`.
- En vivo: el aviso "Tu equipo va algo lento" pasa a toast fijo arriba de la pantalla; estaba en la barra de abajo y no se veía. Va fuera de `.live-bar` porque su `backdrop-filter` atrapa el `position: fixed`. Commit `dfe7187`.

- En vivo más liviano: el modelo de manos corre un cuadro sí y uno no mientras sigue una mano (los intermedios reusan su última respuesta) y `createLiveCapture` expone `timing()` (`data/live/src/index.js`, commit `86d8e44`). La pantalla En vivo dibuja el robot a 1,25x con sombra de 1024 px (antes 2x y 2048) y lo devuelve al salir; `?debug` suma una línea con cuadros/s de cámara y pantalla, ms de pose, manos y robot (`web/src/screens/live.js`, commit `ad4dfbd`).

- Scrollbar roto tras el scroll por paradas (reportado por Juan ya en `main`): Lenis ignora el scroll nativo mientras desliza, y con deslizamientos de 0,8 s arrastrar el scrollbar no hacía nada. Ahora, si durante un deslizamiento la página no está donde Lenis la puso, se cancela el deslizamiento y manda el scrollbar (`web/src/screens/home.js`).

## Qué funcionó

- Comparé variantes en vivo en el preview local (24 px y ~110 px). La elegida se lee como "tridi" a ambos tamaños; se comprobó en header y footer.

- Scroll probado en el preview (1024x768) con rueda real: 0 → 768 (Capture) → 2688 (Gym 1) → … → 6605 (Policy) → 8259 (Probar) → footer libre hasta 8715; hacia arriba, una parada por gesto.

- Footer, selects de Simulaciones y toast comprobados en el preview.

- Scrollbar: probado a 1280x800 con scroll nativo durante un deslizamiento de rueda y de Enter: llega adonde se arrastra; la rueda sigue yendo parada a parada después.

## Qué no funcionó

- Lo anterior: con peso 800 y tracking tan cerrado, las ı sin punto se pegaban a la d, y el punto cuadrado grande pegado al palito hacía que cada i se leyera como l.
- Probar el scroll con eventos `wheel` sintéticos con el panel del navegador oculto: el rAF se pausa y Lenis no anima, así que parecía que no se movía. Con el panel visible y rueda real anda.
- Mayúsculas ("TRIDI") se leen bien pero pierden los puntos-articulación de la marca; descartado.

- Medir la lentitud de En vivo desde el preview: con la ventana en segundo plano el navegador pausa el video y el rAF, así que no hay números confiables. Hay que medirlo en la Mac con la pestaña al frente.

- Medir el antes/después de la optimización en el preview: misma limitación (ventana en segundo plano, 0-1 fps). Build de `web/` OK, sin errores en consola; la ganancia real queda por medir en la Mac.

- Scroll por paradas con la rueda: a Juan le pareció demasiado rápido (cada gesto saltaba una sección entera). Revertido al scroll libre original con la retención del Gym (`gymGate`); también sale el arreglo del scrollbar, que solo hacía falta por esos deslizamientos largos. Enter y espacio siguen yendo parada a parada.

- "Subir videos no está disponible" con el servidor arriba: `data/serve.sh` corrió desde una copia vieja del repo (`~/Code/platanus-hack-26-ve-team-26`, en `114b22e`), cuyo `serve.sh` no publica en el gist; la web seguía leyendo el túnel anterior. Se publicó la URL nueva a mano con `gh gist edit` y la web la encontró. Además, la lectura del gist ahora usa `cache: 'no-store'` y salta una URL que ya se sabe muerta (`data/live/src/api.js`): antes el navegador podía quedarse hasta ~2 min con la vieja.

- "Error" al entrenar en Simulaciones con el servidor arriba: no llegaba ningún `POST /train` al servidor. La página se abrió antes de reiniciar `serve.sh` y seguía con la URL vieja del túnel. Ahora, ante un error de red, el entrenamiento vuelve a buscar el servidor (gist) y reintenta una vez (`web/src/training.js`); probado en local con `fetch` simulado (URL muerta → gist → servidor vivo). El servidor en sí entrena bien: una prueba con `curl` encoló sin querer un entrenamiento de `clip_2026-10-24_prueba1_01`, que se canceló con `DELETE /train/…` tras el retargeting.

## Decisiones

- Se mantiene la idea de marca (i-dots cuadrados en el color señal, como articulaciones), solo se ajustan proporciones.

- Rueda por paradas solo en desktop (ancho ≥ 860 px); en teléfono ya hay flechas y el Gym mide una pantalla.

- Cinco dedos: el seguimiento ya lee los 21 puntos de cada mano (MediaPipe); el límite es la mano del robot, la Dex3 de Unitree, que tiene tres dedos (pulgar, índice y medio; el medio sigue a medio, anular y meñique juntos, `physics/src/fingers.js`). Cinco dedos pide otra mano en el modelo (p. ej. la Inspire RH56 de cinco dedos que Unitree ofrece para el G1): es trabajo de `physics/` (Pastor).

## Sigue

- Correr `data/serve.sh` desde `~/Code/platanus-hack/platanus-hack-26-ve-team-26` (o actualizar la copia vieja), o el gist no se actualiza.

- Avisar a César: los dos cambios están en `web/`, su carpeta (el logo ya está en `main`, PR #134).
- Probar el scroll con un trackpad real de Mac (inercia larga) y ajustar `WHEEL_GAP_MS` / `WHEEL_GROW` si se salta paradas o se siente lento.
- Medir En vivo en la Mac con `?debug` (pestaña al frente, cámara encendida): si la pantalla sigue bajo 30 fps, lo próximo es bajar la cámara a 30 fps o pasar MediaPipe a un Web Worker.
- Contexto de la lentitud: por cuadro corren en el hilo principal la pose (~11 ms en un M2), el modelo de manos (~11 ms) y el robot (física + render con sombras a 2x). Con la cámara a 60 fps eso satura el hilo y el robot va a saltos. Opciones: manos un cuadro sí y uno no, cámara a 30 fps, render del robot a 1,5x sin sombras, o MediaPipe en un Web Worker. Medir primero con la pestaña al frente.
- Shippear cuando Juan lo pida.
