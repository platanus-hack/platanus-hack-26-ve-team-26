---
persona: Juan
rama: juan/movimiento-vivo
sesion: 9e1e141f-dfbf-4a82-b38f-319ed897e6e3
inicio: 2026-10-24 17:05
estado: en curso
---

# Landing: espacio que avanza, menos texto, marca y design system nuevos

## Objetivo

Que la barra espaciadora haga avanzar el landing, que "Probar en vivo" lleve a las formas de probar, menos texto en el Gym y en el cierre, y una marca (logo + wordmark) y un design system más llamativos para equipos de humanoides. Solo desktop por ahora; mobile viene después.

## Qué se hizo

- `web/src/screens/home.js`: espacio en el hero empuja al robot; más abajo va a la siguiente parada (cada etapa del Gym: 0, 10 M, 40 M, 60 M pasos; luego Policy y el cierre). Al final, el navegador hace scroll normal.
- "Probar en vivo" del header ya no abre la cámara: baja a `#probar` ("Los robots ya tienen cuerpo...") con las cuatro tarjetas justo debajo del manifiesto.
- Gym: fuera el texto de intro, la explicación de pasos, el veredicto repetido y la gráfica del log. Queda número de pasos, eje, una frase por etapa, dos cifras y el estado en vivo.
- Cierre: fuera la frase de "la IA aprendió a hablar...", los chips de terrenos, las etiquetas y detalles de las tarjetas; el footer en una línea. Las tarjetas van antes de los hitos.
- `web/src/brand.js` (nuevo): logo = cubo visto desde arriba (tres caras en tres tonos de lima, el "3D") cuyas aristas internas son una persona con los brazos arriba, con el pecho como articulación cuadrada. Wordmark "tridi" en 800 con los puntos de las íes como articulaciones cuadradas lima. Favicon igual (`web/index.html`).
- Design system (`web/src/style.css`): grafito frío `#08090b`, señal lima `#c8ff2e` (antes naranja `#ff4f1a`), bordes rectos `--r-1` 2 px y `--r-2` 4 px (adiós pills), escala de espaciado de 4 px `--s-1`..`--s-9`, puntos clave cuadrados. `landing.css` y `delivery.css` usan los tokens; los colores 3D (flecha, anillo, telemetría, esqueleto, overlay de video, bandera) pasan a lima.

## Qué funcionó

- Probado en el navegador a 1440x900: espacio recorre Gym 0 → 10 M → 40 M → 60 M → Policy → cierre; en el hero suma empujones; el botón del header aterriza con `#probar` a 112 px del borde. `vite build` pasa.

## Qué no funcionó

- Primera versión del logo (cubo visto desde abajo con piernas) se leía como joystick; la pose en "Y" sobre la cara superior se lee como persona.

## Decisiones

- Lima en vez de naranja: corta sobre la calle cálida del film y es el color de "en vivo" en herramientas de robótica. Toca `web/` (área de César): avisarle.
- `project-logo.png` (archivo de entrega) no se tocó: falta regenerarlo con el logo nuevo si el equipo lo aprueba.

## Sigue

- Versión mobile del landing con el mismo sistema.
- Exportar el logo nuevo a `project-logo.png` (1000x1000) si se aprueba.
- Las otras pantallas (`upload`, `live`, `simulations`) heredan tokens pero no se revisaron una por una.
