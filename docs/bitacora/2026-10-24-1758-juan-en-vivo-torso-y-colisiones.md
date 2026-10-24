---
persona: Juan
rama: juan/movimiento-vivo
sesion: afdb4027-123e-4b62-8669-3401b07c08e4
inicio: 2026-10-24 17:58
estado: en curso
---

# En vivo: flecha del empujón, carga en 3D, basta el torso y manos que se tocan

## Objetivo

Pulir Entrena en vivo para la demo: que "Empujar al robot" dibuje la flecha de la landing, cambiar el robot de puntos de la carga (no estaba en la marca) por algo en 3D, más aire entre los botones, que no pida ver el cuerpo de la cabeza a los pies, y que las manos no atraviesen la cabeza ni la otra mano.

## Qué se hizo

- `web/src/push-arrow.js`: la flecha lima del empujón, sacada de `screens/home.js` para que la usen la landing y los paneles del robot (`robot-pane.js`: En vivo y Simulaciones).
- `robot-pane.js` + `style.css`: la carga es un cubo de aristas lima girando en 3D sobre una grilla de piso (CSS puro, aparece antes que WebGL). El robot de puntos (`dots.addView(pane, waiting)`) ya no se usa; `mountRobotPane` y `mountStage` dejan de recibir `dots`.
- `style.css`: En vivo con 16 px entre botones y entre las líneas de la barra (12 px en teléfono).
- `data/live` (`poseclip.js` `isSeen`): un cuadro cuenta si se ven hombros, codos y muñecas (antes los 12 puntos, piernas incluidas). El retargeting ya dejaba en la postura de pie lo que no se ve y `root.js` solo usa los pies que ve. Textos de En vivo, teléfono y entrenar cambiados a "hombros, brazos y manos".
- `physics/src/clearance.js`: dos choques nuevos. Mano contra cabeza (esfera de 9 cm a 0,39 m sobre el torso, medida del STL `head_link`) y mano contra mano (9 cm entre centros: se tocan, no se cruzan; abren los dos hombros por igual). El hombro puede abrir hasta 60° (antes 30°): bajar la mano sobre la coronilla pide 55°.
- `physics/scripts/check-touch.mjs` (en `npm run check`): aplauso y manos sobre la cabeza.
- Shippeado a `main` (primer prompt).
- **De espaldas, en vivo** (segundo prompt): `data/live/src/facing.js`. MediaPipe a veces lee la espalda como si fuera el frente: refleja el cuerpo en profundidad y cambia izquierda por derecha, y el robot giraba 180° y volvía, con los brazos cambiados. Offline (`lift.py`, `poseclip.js`) esos cuadros se descartan comparando con los vecinos; en vivo no hay cuadros futuros y descartar congela al robot, así que cada cuadro se compara con el rumbo del último segundo y, si va en contra, se corrige (izq↔der y profundidad de vuelta; si eso no lo arregla, solo izq↔der). Va antes del filtro One Euro, en `createLiveCapture`, así que sirve también para el teléfono. `scripts/check-facing.mjs` en `npm run check`.

## Qué funcionó

- `npm run check` de `physics/` pasa entero; check-touch: aplauso 0,4 → 9,8 cm entre manos, mano en la cabeza 0,5 → 14,2 cm del centro. La caminata, la carrera y los jumping jacks siguen igual en check-smooth.
- `data/live` `npm run check` pasa (check-facing: los 4 cuadros espejados salen como la pose real, 0,0 cm; una vuelta real de 180° en 1,5 s no se toca). `vite build` pasa.
- En el navegador: el cubo se ve en escritorio y teléfono; la flecha sale al empujar en En vivo y en Simulaciones; la landing sigue empujando con su flecha.

## Qué no funcionó

- Primero el hombro abría hasta 30° y la mano quedaba a 7,5 cm del centro de la cabeza (dentro). Por eso 60°.

## Decisiones

- `valid` del `PoseClip` grabado en vivo también pasa a "se ve el torso": lo que el robot copia es lo que se guarda. Un clip solo de torso entrena con las piernas en la postura de pie.
- No se suben los checkpoints de la landing a 1.000 M de pasos: a ~40 M por 73 min en la M2 serían ~30 h, y la política de pie ya no mejora con más pasos (60 M aguanta 3,6 de 4 empujones; la v2 con 40 M aguantaba 4).

## Sigue

- Probar con webcam real: aplauso, manos en la cabeza, y darse vuelta despacio. Límite que queda: si MediaPipe lee la espalda como frente de forma sostenida desde el primer segundo, el guardia no tiene un rumbo bueno contra el cual comparar; arrancar de frente y girar pasando por perfil.
