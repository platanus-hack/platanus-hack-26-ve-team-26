---
persona: Juan
rama: juan/movimiento-vivo
sesion: 27bac5c6-8df0-4d1c-9947-f9d999dbb804
inicio: 2026-10-24 16:36
estado: en curso
---

# El robot en vivo camina y salta de verdad, y la caminata reproducida ya no resbala

## Objetivo

Juan: que la caminata se vea más natural, y que en vivo el robot vaya adonde va la persona: si camina en línea recta, el robot camina en esa línea; si salta, el robot salta.

## Qué se hizo

- **Por qué no pasaba:** MediaPipe da los 33 puntos centrados en la cadera en cada cuadro, y `mimic` dejaba la pelvis en el origen y apoyaba siempre el pie más bajo en el piso. El robot caminaba en el lugar y un salto solo doblaba las piernas.
- `data/live`: cada pose de `onPose` trae `camera`, la cadera en metros respecto a la cámara (`cameraTranslation`, el mismo ajuste `fitTranslation` que ya usaba la grabación). También el teléfono (`relay.js`).
- `physics/src/root.js` (nuevo, `createRootTracker`): dónde está el robot en el piso en vivo. En el piso, la pelvis sigue al pie apoyado (lo que el pie se mueve contra la pelvis, la pelvis se movió al revés), con el peso repartido entre los pies por su altura (1 a 2 cm), y la cámara corrige la deriva despacio (2 s, máximo 0,15 m/s para que el pie no resbale). En el aire sigue a la cámara. Salto: el pie más bajo sube más de 6 cm a más de 0,5 m/s (en la imagen, ya filtrado); termina a menos de 2 cm o a los 1,2 s. El rumbo sale de la dirección en que camina (último segundo, sobre 0,35 m/s), como offline. `mimic` devuelve también `airborne`.
- `physics/src/motion.js`: `plantFeet` con el mismo reparto suave del peso; `playClip` lo usa por defecto en modo `'auto'` (planta los pies salvo que los pies no expliquen el recorrido, como correr de perfil). `sampleMotion` interpola con Catmull-Rom en vez de una recta entre cuadros (el clip va a 30 fps y la pantalla a 60).
- `web/src/screens/live.js` (carpeta de César): la cámara de la escena alcanza al robot en 0,5 s en vez de ir pegada, para que se lo vea avanzar; el texto de grabación dice "camina, salta: el robot va adonde vas" en vez de "de frente se queda en el lugar".
- `physics/scripts/check-root.mjs` (en `npm run check`): la caminata real de `data/clips` en vivo con la cámara y 2 cm de ruido, y un salto sintético de 30 cm.

## Qué funcionó

- `check-root`: el pie apoyado resbala 0,13 m/s (mediana, igual que `plantFeet` offline), el robot camina 7,1 m de los 7,5 de la persona escalada, cero saltos falsos caminando; en un salto de 30 cm la pelvis sube 24 cm y vuelve al piso, sin moverse de lugar (1 cm).
- `check-smooth`: la caminata en pantalla baja de 3,2 a 2,7 m/s² de aceleración de la pelvis y la rodilla de 77 a 64 rad/s² (Catmull-Rom). Jumping jacks con los pies plantados: la pelvis se balancea 6 cm en vez de 34.
- En el navegador (`#/en-vivo`, poses sintéticas por consola porque no hay webcam): camina 3,3 m en 6 s, salta de 0,76 a 1,00 m y aterriza. Simulaciones sin física reproduce la caminata sin errores.
- Todo `npm run check` de `physics/` y `data/live` pasa.

## Qué no funcionó

- Primer intento: 1 a 5 cm para el reparto del peso dejaba que el talón que se levanta arrastrara el ancla (0,20 m/s, 6,5 m). 1 a 2 cm lo arregló.
- Primer intento del salto: con 2 cm de ruido de la cámara, la velocidad del pie salía 0,8 m/s cuadro a cuadro y caminando "saltaba" 93 cuadros. Filtrar la altura del pie (One Euro) y promediar la velocidad 0,1 s lo dejó en cero.
- `plantFeet` en correr: los pies retargeteados solo recorren 0,9 m de los 8,8 (de perfil las piernas se mueven en profundidad). Por eso el modo `'auto'`.

## Decisiones

- No se toca la caminata con física (`walk-v4`, que se cae a los ~3,5 s): eso es entrenamiento (ENT-1, Pastor), no animación.
- Los clips grabados todavía no guardan el salto: la altura de la pelvis del `RobotMotion` sale de apoyar el pie más bajo, y cambiarlo cambia la referencia que imitan las políticas ya entrenadas (jumping jacks tiene saltitos).

## El robot del Hero se levanta solo

- **Problema (Juan):** si el robot del Hero se caía, quedaba en el piso hasta recargar la página.
- **Causa:** `web/src/screens/home.js` solo lo paraba con un temporizador fijo 5 s después del empujón. Una caída posterior, o volver al Hero con el robot caído, lo dejaba ahí.
- **Arreglo** (carpeta de César): `standHeroUp`, cada cuadro en el Hero: pelvis bajo 0,45 m durante 1,6 s (`GYM_RESTART_S`, lo mismo que el Gym) → `view.reset()`. La caída solo se cuenta si hubo empujón. El aviso decía "1 de cada 15" y con `stand-v7d` es más o menos 1 de cada 4 (bitácora del balance de pie): ahora dice "se levanta y lo vuelve a intentar".
- **Comprobado en el navegador:** acostado a mano sin empujón, se levanta en ~1,7 s y el HUD sigue "de pie"; con empujón, cuenta 1 caída, avisa y vuelve a "de pie con su política".

## En vivo que no abría, robot inclinado en Capture, iteraciones del Gym y menos texto

- **"No pudimos abrir esta parte" al entrar a En vivo:** cada pantalla es un archivo con nombre por build. Una pestaña abierta antes de un deploy (hoy se shippeó dos veces) pide el archivo viejo, Vercel ya no lo tiene y el router mostraba la pantalla de error hasta recargar. Abierta en limpio en producción carga bien. `web/src/router.js`: si una pantalla no baja, la página se recarga sola una vez (guarda en `sessionStorage`, 30 s), y solo si vuelve a fallar se ve el error.
- **Robot inclinado al final de Capture:** no era el robot, era la cámara. Miraba hacia abajo y además corría la imagen de lado (film offset) para dejar sitio al texto: las verticales lejos del centro se inclinan, y al final de Capture la toma sube hacia la del Gym. `directCamera` (`home.js`) ahora deja la cámara nivelada y corre la imagen hacia arriba (descentrado vertical de la proyección), como una lente de arquitectura: mismo encuadre, verticales derechas. Comprobado en el navegador.
- **Gym con las iteraciones:** 4 paradas en vez de 3: 0 (1,1 s, 0 de 4), 10 M (9,6 s, 1 de 4), 40 M = v2 "Estable" (20 s, 4 de 4, pero gira sobre un pie) y 60 M = `stand-v7d` "Quieto" (20 s, 3,6 de 4, el que usa la web). La v2 se recuperó de git (`abea922`) como `training/policies/g1-stand-v2`; también está en el selector de Simulaciones. La parada final decía "40 M, 4 de 4", que ya no era cierto. Los minutos de laptop salen del log (73 min hasta 40 M) más los 20 M siguientes a 11.400 pasos/s: 102 min. El Gym mide 5 pantallas en vez de 4. No se metió la de 48 M (`g1-stand-quiet`): se ve igual que la de 60 M y aguanta menos.
- **Menos texto:** Capture, Gym (texto, explicación de pasos, pie del gráfico), Policy (la nota) y el cierre, más cortos. Se fueron "4 de 4 empujones" de Policy y del cierre (ahora sale de la última parada: 3,6 de 4).

## El robot de Capture ya no camina torcido

- **Lo que quedaba:** la cámara nivelada no era todo. El robot mismo iba ladeado: en la caminata la cintura tenía −6,5° de giro lateral fijo y las dos caderas ~8° hacia el mismo lado (los tobillos lo compensaban), así que el torso se inclinaba 6° a su izquierda todo el clip (correr, 9°; jumping jacks, 5,6°). De perfil, el eje izquierda-derecha de la persona es la profundidad de MediaPipe, su eje con más ruido y con sesgo.
- **Arreglo, `physics/src/level.js`:** una persona caminando se balancea un poco en cada paso pero en promedio va derecha. Se quita el promedio de 2 s (más que un ciclo de paso, ~1,1 s) del giro común de las caderas (los tobillos giran al revés para que las suelas sigan planas) y de la inclinación lateral del torso medida con cinemática (el ángulo de la articulación de la cintura solo se pasaba en jumping jacks, −3,4°, porque ahí la cintura además gira y se dobla). Después los pies vuelven al piso. En `smoothForDisplay` con promedio centrado; en `mimic` con uno causal, antes de `root.js`, que ahora apoya el pie más bajo.
- **Solo en lo que se ve:** `physics/motions/` no cambia, porque son las referencias con las que se entrenaron las políticas (y Pastor sigue entrenando con ellas).
- **Medido:** torso en promedio a 0,1° (caminar), 0,3° (correr) y 0,3° (jacks) en vez de 6,0, 9,0 y 5,6; en vivo, 0,1°. Pruebas en `check-smooth` y `check-root`; todo `npm run check` pasa. En el navegador, al final de Capture el robot de frente va derecho.
- En el árbol hay cambios de `web/` que no son de esta sesión (una marca nueva: `brand.js`, `index.html`, `style.css`…): no se tocaron ni se commitearon.

## Sigue

- Shippeado a `main` con `scripts/ship.sh` sin probar con webcam real.

- Probar con una webcam y un iPhone reales: el campo de visión supuesto (65°) y una cámara inclinada pueden pedir ajustar los umbrales del salto.
- Llevar el salto al `PoseClip` grabado y al `RobotMotion`, coordinado con Pastor (cambia la referencia de entrenamiento).
- Avisar a Pastor (`physics/`) y a César (`web/src/screens/live.js`).
