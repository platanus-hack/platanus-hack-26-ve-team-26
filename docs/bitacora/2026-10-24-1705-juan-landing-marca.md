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

## Segunda vuelta: fondo más simple y móvil

- Fondo de las pantallas de la app (`web/src/dots/stage.js`, `style.css`): 600 → 220 puntos, grises al 55 %, sin empuje ni cambio de color con el cursor; el brillo que seguía al cursor pasa a un degradado lima fijo y tenue arriba.
- Landing en móvil (`landing.css`, bloque `max-width: 860px`, y `home.js`): no es el desktop apretado. Por pantalla, un título corto y una cosa: hero = título + "Empújalo"; Capture = video y esqueleto como dos tiles arriba + "Del video al robot"; Gym = número de pasos, chips de las 4 etapas y una frase; Policy = "Cabe en un correo" + 4 tiles 2x2; cierre = manifiesto + filas con ícono y flecha + hitos de una línea; footer sin párrafo. Títulos cortos con `.only-narrow`, copy largo con `.only-wide`.
- Probado a 375x812: sin scroll horizontal, el botón del header ("Probar") aterriza en las filas. Desktop sin cambios (ningún `.only-narrow` visible). `vite build` pasa.

## Tercera vuelta: móvil con más contexto, y las otras pantallas

- Landing móvil: el recorte quedó corto de contexto. Vuelve una línea por sección (hero, Capture, Gym, Policy, cierre), los 3 pasos del hero en chips cortos, las etiquetas de video y esqueleto, las cifras del Gym y los hitos con su prueba. Las filas de "Probar" llevan subtítulo.
- Policy: "cabe en un correo" no se entendía. Ahora "Te llevas el cerebro entrenado del robot" + "Una red neuronal pequeña (la política) que mueve al robot sola. Corre en tu navegador.", también en desktop.
- `.only-wide` / `.only-narrow` pasan a `style.css` (globales, 860 px) para usarlos en todas las pantallas.
- Pantallas de la app en móvil (`style.css`, bloque de 720 px): encabezado en una línea (flecha + título), barra de botones pegada abajo en En vivo, ejemplo 16:9 y botones en grilla en Subir; en Simulaciones los clips en carrusel horizontal justo bajo la escena y los deslizadores de física plegados bajo "Ajustar la física" (`<details>`, abierto en desktop); notas con versión corta (`stage.js`). Entrega (`delivery.css`, 640 px): estado en 3 líneas, sin notas largas ni specs de formatos ni el ejemplo de código, archivos en una fila con su botón.
- Probado a 375x812 en las 5 pantallas, sin scroll horizontal; desktop revisado en landing y Simulaciones. `vite build` pasa.

## Sigue

- Revisar `#/camara` (la del teléfono) y los estados de Subir con el servidor prendido (subiendo, procesando, listo) en móvil.
- Exportar el logo nuevo a `project-logo.png` (1000x1000) si se aprueba.
- Las otras pantallas (`upload`, `live`, `simulations`) heredan tokens pero no se revisaron una por una.
