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

## Sigue

- Shippeado a `main` con `scripts/ship.sh` sin probar con webcam real.

- Probar con una webcam y un iPhone reales: el campo de visión supuesto (65°) y una cámara inclinada pueden pedir ajustar los umbrales del salto.
- Llevar el salto al `PoseClip` grabado y al `RobotMotion`, coordinado con Pastor (cambia la referencia de entrenamiento).
- Avisar a Pastor (`physics/`) y a César (`web/src/screens/live.js`).
