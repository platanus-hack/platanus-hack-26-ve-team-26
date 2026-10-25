---
persona: Juan
rama: juan/movimiento-vivo
sesion: 45c07dd9-7da3-4dcb-89c6-230efa249ae7
inicio: 2026-10-24 20:19
estado: cerrada
---

# Wordmark "tridi" legible

## Objetivo

Que el texto del logo ("tridi") se lea bien en el header y en el footer de la landing.

## Qué se hizo

- `web/src/style.css` (`.wm`, `.wm-i::after`): peso 800 → 700, tracking -0.06em → -0.015em; puntos cuadrados de las i de 0.19em a 0.15em y subidos (`top` 0.16em → 0.06em) para que no toquen el palito. Commit `da4979f`.
- `web/src/landing/landing.css` (`.wordmark`, `.wordmark.big`): header a peso 700; footer con tracking -0.075em → -0.03em.

## Qué funcionó

- Comparé variantes en vivo en el preview local (24 px y ~110 px). La elegida se lee como "tridi" a ambos tamaños; se comprobó en header y footer.

## Qué no funcionó

- Lo anterior: con peso 800 y tracking tan cerrado, las ı sin punto se pegaban a la d, y el punto cuadrado grande pegado al palito hacía que cada i se leyera como l.
- Mayúsculas ("TRIDI") se leen bien pero pierden los puntos-articulación de la marca; descartado.

## Decisiones

- Se mantiene la idea de marca (i-dots cuadrados en el color señal, como articulaciones), solo se ajustan proporciones.

## Sigue

- Avisar a César: el cambio está en `web/`, su carpeta.
- Shippear cuando Juan lo pida.
