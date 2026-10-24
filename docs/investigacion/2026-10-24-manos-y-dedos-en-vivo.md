# Brazos, manos y dedos en vivo: qué lo frena hoy y qué hacer en 15 horas

- **Fecha:** 2026-10-24 · **Quién:** Juan (investigación con Claude) · **Estado:** investigación, **para decidir**

Objetivo: que en "En vivo" el G1 siga brazos y manos con soltura (un baile de manos, dedos que se mueven), lo más parecido posible al cuerpo de la persona. Leí antes lo que existe: `data/live/src/index.js`, `data/live/src/oneeuro.js`, `physics/src/pose.js`, `physics/src/retarget.js`, `physics/src/filters.js`, `physics/src/root.js`, `physics/src/index.js` (`mimic`) y `physics/models/unitree_g1/`.

Los números marcados **medido** salen de una página de prueba en el navegador de esta Mac (Apple M2, Chrome del panel, `@mediapipe/tasks-vision@1.1.1` del CDN, 120 cuadros de `web/public/media/caminar.mp4` a 960×540 y 60 de `data/samples/mixkit-4519.mp4` a 1280×720; mediana sin los 10 primeros). Los marcados **estimado** son cuentas mías sin probar.

---

## 1. Qué limita hoy los brazos (sin tocar modelos)

| # | Qué pasa | Dónde | Efecto |
| --- | --- | --- | --- |
| 1 | **Las muñecas no se mueven.** La cadena del brazo termina en `wrist_roll_link` y solo resuelve 4 articulaciones (hombro ×3 + codo). `HUMAN` no usa los puntos 17–22 (meñique, índice, pulgar). Las 6 articulaciones de muñeca quedan en 0 | `retarget.js`, `limbs()` y `HUMAN` | La mano es una prolongación rígida del antebrazo: un baile de manos no se ve |
| 2 | **El giro del hombro casi no existe.** `SHOULDER_TWIST_PENALTY = 0.05` (puesto para que el brazo no girara en clips de perfil). Con el antebrazo del G1 de ~0,10 m (`g1_kinematics.xml`), girar 1 rad cuesta 0,05 y no girarlo deja la mano a ~0,10 m (0,009 m²): el mínimo queda en **~17 % del giro necesario** (estimado) | `retarget.js`, línea de `SHOULDER_TWIST_PENALTY` | Codo doblado con el antebrazo hacia arriba o adelante (saludar, "manos arriba", ondas) sale aplastado |
| 3 | **Tres filtros One Euro en serie.** Captura: puntos a 1,5 Hz/β 1 (`oneeuro.js`). Robot: los mismos puntos otra vez a 0,8 Hz/β 6 (`pose.js`). Después los ángulos a 1,5 Hz/β 0,5 (`filters.js`, `createRobotPoseFilter`) | `index.js` → `pose.js` → `filters.js` | Cada etapa está medida en ~1 cuadro (33 ms) de retraso en caminar (comentarios de `oneeuro.js` y `filters.js`); juntas, ~70–100 ms (estimado). En brazos rápidos se nota como "goma" |
| 4 | **30 fps de cámara, no de modelo.** `pose full` en GPU tarda **11,0 ms** (medido); el tope es la webcam (`CAMERA` pide 1280×720 sin `frameRate`) | `data/live/src/index.js`, `CAMERA` | Hay margen para 60 fps si la cámara los da (la de la MacBook: **sin verificar**) |
| 5 | **Las manos atraviesan el cuerpo.** `sim.puppet` copia `qpos` y hace `mj_forward`: no hay contacto ni penalización de choque en el IK | `sim.js` `puppet`, `retarget.js` `limbCost` | Brazos cruzados o manos en la cadera entran en el torso o las piernas. **Resuelto en parte después de esta investigación:** `physics/src/clearance.js` abre hombros y caderas para que las manos no entren en muslos ni pelvis y los pies no se crucen; el pecho y los brazos cruzados todavía no se revisan |
| 6 | Sin cabeza: el G1 no tiene cuello. Sin dedos: el modelo es el de 29 DOF "sin manos" | `retarget.js` (comentario), `models/unitree_g1/README.md` | Se resuelve con otro modelo (sección 3) |

**`heavy` no ayuda en vivo:** 26,8 ms en GPU y 96 ms en CPU (medido) contra 11,0 y 23,3 de `full`; con MuJoCo y three.js en el mismo hilo bajaría de 30 fps. `lite` en GPU tardó 12,8 ms (medido; en esta Mac no es más rápido que `full`, en teléfonos sí debería serlo).

## 2. Dedos: qué modelo de manos

| Opción | Costo por cuadro (M2, GPU, medido) | Descarga (medido, `content-length`) | Manos detectadas de cuerpo entero (medido) | Notas |
| --- | --- | --- | --- | --- |
| **A. `PoseLandmarker` + `HandLandmarker`** (VIDEO, `numHands: 2`) | 11,0 + 10,7 ≈ **22 ms** → techo ~45 fps | 9,4 + 7,8 MB | **0/120** en `caminar.mp4` (manos de ~32 px) | Funciona cuando la persona está cerca (encuadre de medio cuerpo); de lejos el detector de palma no las encuentra |
| **B. `HolisticLandmarker`** (reemplaza a Pose) | **43 ms** GPU, 42 ms CPU → techo ~23 fps | 13,7 MB | **44/120** en `caminar.mp4`, 0/120 en `mixkit-4519.mp4` (~38 px) | Existe en 1.1.1 (`vision.d.ts`: `poseWorldLandmarks`, `left/rightHandWorldLandmarks`). Saca las manos de recortes guiados por la pose ([blog de Google](https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/)), por eso encuentra más de lejos. Corre también la malla de la cara, que no usamos. GPU ≈ CPU: parece no acelerar |
| C. Pose + `HandLandmarker` sobre un recorte alrededor de la muñeca | +18,8 ms por mano (modo IMAGE) | 7,8 MB | 19/120 | Peor que B y más código. Descartada |
| D. RTMW (133 puntos, cuerpo+manos+cara) con onnxruntime-web | Sin números de navegador publicados | RTMW3D ~369 MB ([MMLA Harvard](https://mmla.gse.harvard.edu/tools/rtmw3d)) | — | Nueva dependencia, 2D salvo la versión 3D gigante. **No cabe en 15 h** |

Referencia oficial: `HandLandmarker` 17,1 ms CPU / 12,3 ms GPU en Pixel 6 ([guía de Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)); BlazePose full en una MacBook Pro 2019 con el runtime de MediaPipe: 81 fps, heavy 38, y en Pixel 5 lite 32 / full 22 ([blog de TF.js](https://blog.tensorflow.org/2021/05/high-fidelity-pose-tracking-with-mediapipe-blazepose-and-tfjs.html)). Holistic original: 15–20 fps en GPU de móvil y MacBook 2017 (mismo blog de Google). **Teléfonos: ni A ni B**; que sigan con `lite` solo.

**Conclusión:** los dedos son un modo de **encuadre cercano** (persona a ~1–1,5 m, medio cuerpo). Ahí A da más fps que B. B solo vale si se quiere dedos con el cuerpo entero en cuadro, a ~23 fps.

Detalles que importan con A:

- **A qué brazo va cada mano:** por cercanía de la muñeca de la mano (punto 0) a las muñecas de la pose (15/16), no por la etiqueta `handedness` (en selfie se invierte y a veces salta).
- **Ángulos con `worldLandmarks` de la mano:** metros, centrados en la mano; sirven para ángulos, no para la posición (la posición la da la pose). El doblez de dedos que apuntan a la cámara se ve corto en la imagen y es la parte más ruidosa (profundidad monocular).
- Filtrar los 7 ángulos por mano con un `OneEuroFilter` más rápido que el del cuerpo (los dedos se mueven a varios Hz).

## 3. El robot con manos

En Menagerie existe **`g1_with_hands.xml` + `scene_with_hands.xml`** junto al G1 que ya usamos, misma licencia **BSD-3-Clause** ([Menagerie `unitree_g1`](https://github.com/google-deepmind/mujoco_menagerie/tree/main/unitree_g1)). Lo descargué y revisé:

- Son manos **Dex3-1**: 3 dedos, **7 DOF por mano** (pulgar 3, índice 2, medio 2), 14 en total; 43 bisagras + la base libre ([Unitree Dex3-1](https://www.unitree.com/Dex3-1/)). Rangos en el XML: pulgar_0 ±60°, pulgar_1 −41°..60°, pulgar_2 0..100°, índice y medio 0..90° y 0..100° (signos espejados entre mano izquierda y derecha).
- Trae keyframe `stand` y actuadores de posición.
- **Las articulaciones de la mano van intercaladas**: tras la muñeca izquierda vienen los 7 dedos izquierdos y recién después el brazo derecho. El `qpos` **no es compatible** con el de 29 DOF: `sim.puppet` hace `data.qpos.set(qpos)` y las políticas ONNX esperan 29 articulaciones.
- Las 18 mallas de las manos pesan **20,8 MB** (medido, API de GitHub), más que las 35 que ya tenemos (19 MB en `assets/`). Se pueden simplificar.

Cómo encajarlo sin romper lo entrenado:

- **Solo para mostrar en vivo.** El retargeting sigue sobre `g1_kinematics.xml` (29 DOF); las políticas y `scene_mjx.xml` no se tocan.
- Al entrar a "En vivo", `swapScene('scene_with_hands.xml', 'stand')` (ya existe en `physics/src/index.js`) y en `mimic` copiar por **nombre de articulación** (29 del cuerpo + 14 dedos) en vez de `qpos.set`. Al salir, volver a `scene.xml`.
- Cargar un modelo con mallas tarda ~3 s en el navegador (comentario de `physics/src/index.js`): hacerlo al abrir la cámara, no en el primer cuadro.
- No existe un MJCF oficial del G1 con manos **Inspire** en Menagerie (no lo encontré); Dex3 es la opción.

**De 21 puntos a 7 ángulos (simple, sin optimizador):** el ángulo de cada articulación es el ángulo entre los dos segmentos que se juntan ahí, recortado al rango.

| Dex3 | Puntos de MediaPipe (índices de la mano) |
| --- | --- |
| `index_0` | doblez en el nudillo del índice: 0→5 contra 5→6 |
| `index_1` | promedio de 5→6/6→7 y 6→7/7→8 |
| `middle_0`, `middle_1` | lo mismo con el medio (9–12), o el promedio de medio, anular y meñique: el Dex3 no tiene esos dos |
| `thumb_0` | giro del pulgar hacia la palma: ángulo de 1→2 contra el plano de la palma (0, 5, 17) |
| `thumb_1`, `thumb_2` | doblez en 2 (1→2/2→3) y en 3 (2→3/3→4) |

Cada valor se escala del rango humano (0–90°/0–110°) al rango del Dex3 y se le pone el signo de su lado. Para algo más fino existe [dex-retargeting](https://github.com/dexsuite/dex-retargeting) (MIT, de AnyTeleop), que Unitree usa en [xr_teleoperate](https://github.com/unitreerobotics/xr_teleoperate) con Dex3-1 e Inspire; es Python, no sirve en el navegador sin portarlo.

## 4. Opciones ordenadas por valor/esfuerzo

| Orden | Qué | Esfuerzo (estimado) | Qué se gana |
| --- | --- | --- | --- |
| 1 | **Muñecas desde los puntos de la pose**: marco de la mano con 15 (muñeca), 17 (meñique), 19 (índice), 21 (pulgar); `solveJoints` de las 3 muñecas con `orientationCost`, como ya se hace con los pies | 1,5–2 h | La mano gira y se dobla: el baile de manos ya se ve, sin modelos nuevos ni fps perdidos |
| 2 | **Giro del hombro**: bajar `SHOULDER_TWIST_PENALTY` (p. ej. 0,005) cuando el torso mira a la cámara, y dejar 0,05 de perfil | 30 min + medir | Antebrazos hacia arriba y adelante |
| 3 | **Menos retraso**: no filtrar dos veces los puntos (en vivo ya llegan filtrados de `data/live`, `pose.js` los vuelve a filtrar) y subir β de las articulaciones del brazo en `createRobotPoseFilter` | 1 h + `check-smooth.mjs` | ~30–60 ms menos en brazos (estimado) |
| 4 | Pedir `frameRate: { ideal: 60 }` a la cámara | 15 min | 60 fps si la webcam los da; el modelo ya cabe (11 ms) |
| 5 | **Dedos con `HandLandmarker`** (opción A) en laptop + **G1 con Dex3** solo para mostrar | 5–7 h | Dedos visibles con la persona cerca |
| 6 | Manos que no atraviesan el torso: en `limbCost`, costo si la muñeca o el codo entra en un cilindro alrededor del torso (~0,15 m) | 1–2 h | Brazos cruzados creíbles |
| 7 | Holistic para dedos de cuerpo entero | +1 h sobre la 5 | Dedos de lejos, a ~23 fps |

## 5. Plan recomendado (cabe en lo que queda)

1. **Brazos y muñecas (≈3–4 h, sin dependencias nuevas):** opciones 1 a 4. Medir con el `residual` que ya muestra la página y con `check-smooth.mjs`. Esto solo ya hace la mayor diferencia visible.
2. **Dedos (≈4 h):** `HandLandmarker` junto a la pose, solo en laptop y prendido con un botón "Manos" (encuadre cercano); 7 ángulos por mano con la tabla de arriba; dibujar los 21 puntos en el overlay para depurar.
3. **Robot con manos (≈2–3 h):** copiar `g1_with_hands.xml`, `scene_with_hands.xml` y las mallas de Menagerie (mismo commit `f3b6013`), cambiarlo al entrar a "En vivo" y copiar por nombre. Si a las ~6 h de empezar el paso 2–3 no anda, se corta: el paso 1 ya es demostrable.

## 6. Riesgos

- **fps:** pose + manos + MuJoCo + three.js en el hilo principal. Si baja de 20 fps, `root.js` pierde pasos (`fps()` en `data/live`). Salida: manos cada 2 cuadros, o apagarlas al caminar.
- **Dedos de lejos:** con el cuerpo entero en cuadro las manos miden ~30–40 px y casi no se detectan (medido arriba). Hay que pedirle a la persona que se acerque.
- **Dex3 tiene 3 dedos:** anular y meñique se pierden; "contar con los dedos" no se ve igual.
- **Profundidad:** dedos que apuntan a la cámara y el giro de la muñeca salen ruidosos; los puntos 17–22 de la pose son gruesos. Filtrar y recortar a rango.
- **Descarga:** +7,8 MB (modelo de manos) + ~20 MB de mallas; cargar en segundo plano al abrir la cámara.
- **No mezclar modelos:** el de manos no debe llegar al entrenamiento ni a `RobotMotion` (siguen siendo 29 DOF).
- **Mis números de detección** salen de dos videos de gente caminando, no de una webcam con alguien bailando: confirmarlo con la cámara real antes de comprometerse.

## Fuentes

- MediaPipe Hand Landmarker (21 puntos, coordenadas de mundo, latencias Pixel 6): https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- MediaPipe Holistic Landmarker para web: https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js
- MediaPipe Pose Landmarker (variantes lite/full/heavy): https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- Holistic, cómo recorta manos desde la pose y sus fps: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/
- BlazePose en el navegador, fps por variante: https://blog.tensorflow.org/2021/05/high-fidelity-pose-tracking-with-mediapipe-blazepose-and-tfjs.html
- MuJoCo Menagerie, `unitree_g1` (`g1_with_hands.xml`, BSD-3-Clause): https://github.com/google-deepmind/mujoco_menagerie/tree/main/unitree_g1
- Unitree Dex3-1 (7 DOF, rangos): https://www.unitree.com/Dex3-1/
- dex-retargeting (MIT): https://github.com/dexsuite/dex-retargeting
- xr_teleoperate de Unitree (Dex3-1, Inspire, DexPilot): https://github.com/unitreerobotics/xr_teleoperate
- RTMW3D en el navegador: https://mmla.gse.harvard.edu/tools/rtmw3d
- One Euro Filter (Casiez et al., CHI 2012): https://gery.casiez.net/1euro/
