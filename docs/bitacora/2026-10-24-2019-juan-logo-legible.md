---
persona: Juan
rama: juan/movimiento-vivo
sesion: 45c07dd9-7da3-4dcb-89c6-230efa249ae7
inicio: 2026-10-24 20:19
estado: cerrada
---

# Wordmark "tridi" legible y scroll por paradas

## Objetivo

- Que el texto del logo ("tridi") se lea bien en el header y en el footer de la landing.
- Que el scroll de la landing en desktop no se sienta largo e incómodo: con Enter (parada a parada) se sentía bien, con rueda o trackpad no.

## Qué se hizo

- `web/src/style.css` (`.wm`, `.wm-i::after`): peso 800 → 700, tracking -0.06em → -0.015em; puntos cuadrados de las i de 0.19em a 0.15em y subidos (`top` 0.16em → 0.06em) para que no toquen el palito. Commit `da4979f`.
- `web/src/landing/landing.css` (`.wordmark`, `.wordmark.big`): header a peso 700; footer con tracking -0.075em → -0.03em.

- `web/src/screens/home.js`: `gymGate` pasa a `wheelPage` + `wheelStep`. En desktop cada gesto de rueda o trackpad desliza a la parada siguiente o anterior (las mismas de Enter y espacio: Capture, las 4 etapas del Gym, Policy, Probar); el resto de la ráfaga y la inercia del trackpad se ignoran. Un gesto nuevo es una pausa de 200 ms, un cambio de dirección o un delta que vuelve a crecer (1,5x). Si llega un gesto mientras una etapa del Gym retiene el scroll, queda en cola y avanza al terminar (antes se perdía y había que deslizar dos veces). Debajo de la última parada el footer scrollea libre. Teléfonos y touch, sin cambios. Commit `2c010da`.

## Qué funcionó

- Comparé variantes en vivo en el preview local (24 px y ~110 px). La elegida se lee como "tridi" a ambos tamaños; se comprobó en header y footer.

- Scroll probado en el preview (1024x768) con rueda real: 0 → 768 (Capture) → 2688 (Gym 1) → … → 6605 (Policy) → 8259 (Probar) → footer libre hasta 8715; hacia arriba, una parada por gesto.

## Qué no funcionó

- Lo anterior: con peso 800 y tracking tan cerrado, las ı sin punto se pegaban a la d, y el punto cuadrado grande pegado al palito hacía que cada i se leyera como l.
- Probar el scroll con eventos `wheel` sintéticos con el panel del navegador oculto: el rAF se pausa y Lenis no anima, así que parecía que no se movía. Con el panel visible y rueda real anda.
- Mayúsculas ("TRIDI") se leen bien pero pierden los puntos-articulación de la marca; descartado.

## Decisiones

- Se mantiene la idea de marca (i-dots cuadrados en el color señal, como articulaciones), solo se ajustan proporciones.

- Rueda por paradas solo en desktop (ancho ≥ 860 px); en teléfono ya hay flechas y el Gym mide una pantalla.

## Sigue

- Avisar a César: los dos cambios están en `web/`, su carpeta (el logo ya está en `main`, PR #134).
- Probar el scroll con un trackpad real de Mac (inercia larga) y ajustar `WHEEL_GAP_MS` / `WHEEL_GROW` si se salta paradas o se siente lento.
- Shippear el scroll cuando Juan lo pida.
