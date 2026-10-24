# En vivo: que el robot mueva los brazos como una persona (planning)

- **Fecha:** 2026-10-24 · **Quién:** Juan (con Claude) · **Estado:** hecho salvo B7 (ver "Resultado" al final)

Por qué importa: lo que el G1 copia en "En vivo" es lo que se graba como `PoseClip` y entrena la política. Si el robot no ve hacia dónde mira la palma, o confunde "subo el codo" con "bajo la mano", el dato con el que aprende está mal, y ningún entrenamiento lo arregla después. Este documento sigue a [`2026-10-24-manos-y-dedos-en-vivo.md`](2026-10-24-manos-y-dedos-en-vivo.md): de esa lista ya están hechos el giro del hombro de frente (`SHOULDER_TWIST_FACING`), el doblez de la muñeca, los 60 fps, el filtro doble y los choques de manos (`clearance.js`).

Leído: `physics/src/retarget.js`, `physics/src/clearance.js`, `physics/src/pose.js`, `data/live/src/index.js`, `data/live/src/poseclip.js`.

---

## 1. Diagnóstico de lo que reportó Juan

### 1.1 La palma hacia adelante o hacia atrás no se copia (causa en el código, segura)

El giro de la palma es el giro del antebrazo (pronación/supinación). En el G1 lo dan dos articulaciones: `shoulder_yaw` (gira todo el brazo) y `wrist_roll` (gira el antebrazo). Hoy:

- La cadena del brazo resuelve `shoulder_pitch/roll/yaw` y `elbow`, y su objetivo son **solo dos puntos**: codo y muñeca (`limbCost`). Con el brazo estirado, codo y muñeca quedan en el mismo lugar con cualquier giro: nada en el costo pide girar, y la penalización de `shoulder_yaw` lo deja en 0.
- La mano (`c.hand`) resuelve solo `wrist_pitch` y `wrist_yaw`, y su costo mira **hacia dónde apuntan los dedos** (`fingersOf`, el eje x), no hacia dónde mira la palma.
- **`wrist_roll_joint` no lo mueve nadie.** El comentario de `retarget.js` lo dice: se descartó el giro porque, leído en 3D desde índice y meñique (~5 cm, profundidad ruidosa), saltaba entre ±113°.

Conclusión: palma adelante y palma atrás dan exactamente el mismo robot. No es ruido, es que no está implementado.

### 1.2 "Subo el codo y el robot baja la mano" (hipótesis, hay que medir)

Tres causas posibles, de más a menos probable:

1. **El codo sube hacia la cámara (profundidad).** Si el codo sube hacia adelante, en la imagen casi no cambia de altura: se mueve en z, el eje más ruidoso de MediaPipe, y el modelo lo subestima (acorta el brazo en profundidad). El codo queda "abajo" y la muñeca, que sí se ve moverse en la imagen, termina más abajo de lo que está: se lee como bajar la mano.
2. **El IK sacrifica el codo para acertar la muñeca.** `limbCost` pesa igual codo y muñeca, y el G1 tiene el brazo más corto que una persona: cuando no llega a los dos, el mínimo puede quedar con el codo bajo. Codo arriba con la mano abajo (alas de pollo) también pide mucho `shoulder_yaw`, que tiene penalización.
3. **Arreglos que se activan sin querer.** `clearance.js` abre el hombro si la mano se acerca a cabeza o muslos; el espejo del brazo oculto (`seenArms.length === 1`) copia el otro brazo si un codo pierde visibilidad (un codo adelante tapa la muñeca). Cualquiera de los dos cambia el brazo sin que la persona lo haya movido.

Cómo distinguirlas: grabar el movimiento y mirar en el cuadro (a) la z del codo que da MediaPipe, (b) el `residual` del codo contra el de la muñeca, (c) si `clearance` o el espejo actuaron. Eso es la tarea B0.

---

## 2. Base de todo: un set de movimientos de prueba (B0, va primero)

Sin esto cada arreglo se evalúa "a ojo" y lo que mejora un gesto rompe otro.

- **Grabar con la webcam ~12 gestos cortos (5 s c/u)**, cada uno con lo que el robot debería hacer: palmas adelante / atrás con brazos colgando; palmas arriba / abajo con brazos al frente; codos arriba hacia los lados (alas); codos arriba hacia adelante (manos en la nuca); boxeo (puño al frente); saludar; brazos cruzados; manos en la cintura; aplauso; un brazo por detrás de la espalda; girarse a perfil con los brazos en alto; caminar.
- **Guardarlos como `PoseClip`** (el botón Grabar ya lo hace) en `data/clips/gestos/`, con la etiqueta del gesto en el nombre.
- **Script `physics/scripts/check-gestures.mjs`** en `npm run check`: corre `retarget` sobre cada clip y comprueba números simples por gesto (ej. "palmas adelante": la normal de la palma del robot apunta a +x en el marco del torso, ±45°; "alas": el codo sobre la altura del hombro menos 10 cm). Imprime una tabla gesto → pasa/falla y el ángulo medido.

Esfuerzo: 1,5–2 h. Dueño: Juan (graba y escribe las condiciones), el script lo puede revisar Pastor.

---

## 3. Tareas, ordenadas por valor/esfuerzo

| # | Qué | Dónde | Esfuerzo | Qué arregla |
| --- | --- | --- | --- | --- |
| **B1** | **Giro de la palma desde la imagen 2D, no desde la profundidad.** Marco de la mano con muñeca (15/16), índice (19/20), meñique (17/18) y pulgar (21/22). El **signo** (palma adelante o atrás) sale de de qué lado del eje meñique→índice queda el pulgar **en la imagen** (x, y en píxeles, que son confiables); la profundidad solo da el ángulo fino. Con histéresis (cambia de lado solo con un margen y por más de ~3 cuadros) para que no tiemble. Resolver `wrist_roll` (y dejar que `shoulder_yaw` ayude con el brazo estirado) con un costo sobre la normal de la palma del robot, como `orientationCost` de los pies | `retarget.js` (cadena `hand` con `wrist_roll` y un `palmCost`) | 2–3 h | Palma adelante/atrás/arriba/abajo (1.1) |
| **B2** | **Largo de los huesos para recuperar la profundidad del codo.** Calibrar al inicio (brazos abiertos 1 s, o la mediana de los primeros segundos) el largo de brazo y antebrazo de la persona. Cada cuadro, si el segmento en la imagen sale más corto que su largo, la diferencia es profundidad: `dz = sqrt(L² − d²)`, con el signo que da MediaPipe. Se corrige la z del codo y de la muñeca antes del IK | `data/live` (después de `facing.fix`, antes del One Euro) o `retarget.js` | 2–3 h | Codo hacia adelante leído como mano abajo (1.2, causa 1) |
| **B3** | **El codo pesa más que la muñeca en el IK** (p. ej. ×2) y menos penalización de `shoulder_yaw` cuando el codo está sobre el hombro. Medir con B0 antes de fijar el número | `retarget.js` `limbCost` | 30 min + medir | 1.2, causa 2 |
| **B4** | **Que los arreglos avisen cuando actúan.** `clearance` y el espejo del brazo oculto devuelven qué hicieron; En vivo lo muestra en la barra de depuración. El espejo solo se activa de perfil (`sin² rumbo` alto), no cuando un codo pierde visibilidad de frente | `clearance.js`, `retarget.js`, pantalla En vivo | 1 h | 1.2, causa 3; y saber qué pasa |
| **B5** | **Confianza por articulación en vez de por cuerpo.** Hoy `isSeen` da sí/no para todo el torso. Un punto con visibilidad baja debería mantener su último valor (y marcarse) en vez de entrar al IK como si fuera cierto. Guardar esa confianza en el `PoseClip` para que el entrenamiento ignore esas articulaciones | `data/live/src/poseclip.js`, contrato | 1,5 h + cambio de contrato | Datos de entrenamiento sin brazos inventados |
| **B6** | **Manos con `HandLandmarker`** en encuadre cercano (ya investigado, opción A): da la normal de la palma con 21 puntos, mucho más firme que 4. Si está, B1 la usa; si no, cae a los 4 puntos de la pose | `data/live` | 3–4 h | Palma y muñeca firmes de cerca; base para dedos |
| **B7** | **Dedos en el G1 con Dex3** (solo para mostrar, `g1_with_hands.xml`) | `physics/` | 4–6 h | Ver dedos. No entra a `RobotMotion` (29 DOF) |
| **B8** | **Brazos cruzados y manos en el pecho** sin atravesar el torso: falta en `clearance.js` | `clearance.js` | 1–2 h | Cruzar brazos, mano en el corazón |

Fuera de alcance (el G1 no lo tiene): encoger los hombros (no hay escápula), mover la cabeza (no hay cuello).

## 4. Plan de la ronda

1. **B0** (set de gestos y `check-gestures`): primero, porque mide todo lo demás.
2. **B1** (palmas) y **B3/B4** (codos, rápidos): lo que Juan reportó. Con B0 se ve cuál de las tres causas del codo era.
3. **B2** si B3 no alcanza para "codo hacia adelante".
4. **B5** (confianza en el `PoseClip`): lo que más le importa al entrenamiento. Cambio de contrato: su propio commit antes del código.
5. **B6 → B7 → B8** si queda tiempo; B7 se corta si a las ~4 h no anda.

## 5. Quién

- `data/live` y los clips de gestos: Juan.
- `physics/src/retarget.js` y `clearance.js` son de **Pastor**: B1, B3, B4 y B8 tocan su carpeta. O los hace él, o Juan en commits aparte y le avisa.
- El aviso de B4 en la pantalla En vivo toca `web/` (César).

## 6. Riesgos

- **El pulgar de la pose (21/22) es el punto más débil** de MediaPipe Pose; con el puño cerrado o de perfil puede no verse. B1 debe caer a "mantener el último giro" y no a 0.
- **Calibrar huesos (B2)** falla si la persona arranca con el brazo hacia la cámara: pedir los brazos abiertos al inicio, o tomar el máximo de los primeros segundos.
- Cada costo nuevo del IK cuesta tiempo por cuadro: medir que En vivo siga sobre 30 fps con `fps()`.

---

## Resultado (24/10, noche)

| # | Estado | Qué quedó |
| --- | --- | --- |
| B0 | hecho | `physics/scripts/check-gestures.mjs` en `npm run check`: 13 casos sintéticos con manos (palmas en 5 orientaciones, con ruido de profundidad, alas, codos hacia la cámara, golpe, saludo, modelo de manos, brazo oculto). Faltan los clips reales de webcam para comparar |
| B1 | hecho | `wrist_roll` entra a la mano y un costo por la normal de la palma (meñique → índice y pulgar). Antes: 8 de 8 casos de palmas fallaban (78–102° de error); ahora todos bajo 45°, el peor con 2 cm de ruido es 35° |
| B2 | hecho | `data/live/src/bones.js`: el largo de cada segmento del brazo se aprende y la profundidad que falta vuelve (`check-bones`: un codo que MediaPipe da a 8,7 cm adelante vuelve a 29). Entra al `PoseClip` grabado |
| B3 | no hizo falta | Con geometría exacta, alas y codos hacia la cámara ya pasaban: el problema era la profundidad (B2) y el espejo (B4), no el peso del IK |
| B4 | hecho | El brazo oculto solo se espeja de perfil (de frente inventaba 22 cm de balanceo, medido). `mimic()` devuelve `fixes`; `?debug` en la dirección muestra distancia y arreglos en En vivo |
| B5 | ya estaba | El `PoseClip` ya guarda la visibilidad por punto, y el retargeting deja quieto lo que no ve. Además los clips de cámara ahora se reapuntan con palmas y muñecas (`motion.js`), así entrenan con lo que el robot hizo |
| B6 | hecho | Casilla "Seguir las palmas de cerca" en En vivo (solo laptop): `HandLandmarker` junto a la pose, cada mano a la muñeca más cercana, y la palma sale de sus 21 puntos |
| B7 | pendiente | Dedos Dex3: suma ~20 MB de mallas justo después de bajar las del G1 a 4,3 MB, y toca el visor. Para decidir |
| B8 | hecho | Pecho en `clearance.js`: el hombro va hacia adelante hasta que la mano queda 5 cm delante (66° en el peor caso, medido) |

**Falta probar con webcam real** (en el panel de Claude no hay cámara ni pudo abrirse el servidor): palmas adelante/atrás, codos hacia la cámara, brazos cruzados, y la casilla de manos a 1–1,5 m. Abrir con `?debug` y mirar la línea de arreglos.
