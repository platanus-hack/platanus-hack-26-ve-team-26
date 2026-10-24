# physics/

El robot de Tridi en un motor de física de verdad: el **Unitree G1** (29 articulaciones, 33,3 kg) simulado con **MuJoCo** compilado a WebAssembly, y dibujado con **three.js**. Todo corre en el navegador de quien abre la página; no hay servidor de física.

Hoy el G1 hace dos cosas: se sostiene de pie con sus motores y se cae si lo empujas (todavía no tiene una política que lo equilibre; eso lo va a aprender en `training/`), y **copia tu movimiento desde la cámara** (retargeting, más abajo).

## Cómo correrlo

```bash
cd physics
npm install
npm run dev      # http://localhost:5173: el G1 de pie, con "Cámara", "Empujar" y "Reiniciar"
npm run check    # en Node: la física (de pie 10 s, se cae al empujarlo) y el retargeting (poses sintéticas y el clip real de caminata de data/)
npm run build    # dist/ estático, listo para desplegar
```

## Para la web (César): `createSimView`

```js
import { createSimView } from 'tridi-physics'; // o '../physics/src/index.js'

const view = await createSimView(canvas, {
  onProgress: ({ done, total, bytes }) => {},     // mientras bajan MuJoCo y el robot
  onStats: ({ realtime, pelvisHeight }) => {},    // una vez por segundo
  theme: { background, ground, gridMajor, gridMinor }, // opcional: colores de la escena (por defecto, oscuros)
});
view.pause(); view.play(); view.setSpeed(0.5);
view.reset(); view.push();
view.mimic(pose);   // copiar a una persona, un cuadro de cámara por llamada (ver más abajo)
view.dispose(); // al desmontar: corta el ciclo y libera WebGL y la memoria de MuJoCo
```

La web pone el `<canvas>` (con su tamaño en CSS) y los botones; `physics/` pone la escena, el robot, la física y el render. `loadClip` y `loadPolicy` llegan cuando existan `RobotMotion` y la primera `policy.onnx` (ver [`../docs/contrato.md`](../docs/contrato.md)).

## Copiar a una persona con la cámara (retargeting)

```js
import { createLiveCapture } from 'tridi-live'; // data/live, de Juan

const live = await createLiveCapture(video, { onPose: (pose) => view.mimic(pose) });
// ...
live.stop(); view.reset(); // el robot vuelve a la física
```

`mimic` recibe exactamente lo que entrega `onPose` (los 33 puntos `world` de MediaPipe, en metros y centrados en la cadera) y deja al G1 en esa pose. Por dentro, en cada cuadro: `pose.js` filtra los puntos y decide cuáles se ven → `retarget.js` los convierte en los 36 valores de `qpos` del G1 (la fila de `RobotMotion` de [`../docs/contrato.md`](../docs/contrato.md)) → `sim.puppet(qpos)` coloca el robot ahí, sin dinámica.

El método es el de Sombra (`real-steel/src/robot.js` en `platanus-ideas`): ejes del cuerpo a partir de hombros y caderas, y cinemática inversa por descenso de coordenadas sobre la cadena real del robot, en vez de fórmulas cerradas. Lo que cambia es que la cadena es el propio modelo de MuJoCo (`mj_kinematics` sobre una copia), así que los ángulos son los de este G1 y no los de una copia en three.js.

| Qué se copia | Cómo |
| --- | --- |
| Rumbo de la pelvis | Del eje de las caderas (de los hombros si las caderas no se ven). El robot sigue vertical |
| Cintura (3 articulaciones) | Giro e inclinación del torso respecto de las caderas |
| Brazos y piernas (4 articulaciones cada uno) | Dirección del segmento superior e inferior, medida en el sistema del torso (brazos) o de las caderas (piernas) |
| Pies | Planos sobre el piso; la pelvis baja hasta que el punto más bajo de un pie lo toca |
| **No** se copia | Cabeza (el G1 no tiene cuello), manos y dedos (los de MediaPipe son muy ruidosos) |

Lo que la cámara no ve se queda en la pose de pie: una persona sentada frente a la laptop mueve cintura y brazos y el robot mantiene las piernas.

**Espejo.** Por defecto el robot se mueve como tu reflejo: levantas la mano derecha y sube el brazo que queda del mismo lado de la pantalla, que es el izquierdo del robot (y la vista previa de la cámara también está espejada). Con `createSimView(canvas, { mirror: false })` el robot copia lado con lado, que es lo que van a querer los clips.

**Ejes.** MediaPipe: x a la derecha de la imagen, y hacia abajo, z alejándose de la cámara. Robot (MuJoCo): x adelante, y a su izquierda, z arriba. Una persona de frente a la cámara mira hacia +x del robot. Se verificó con el clip real de caminata de `data/`: el rumbo sale a 90° (hacia donde avanza) y se mueve el brazo del lado que la cámara ve.

### Qué se midió

| Qué | Valor |
| --- | --- |
| Tiempo por cuadro (IK de cintura, 4 miembros y 2 pies) | 1,7 ms, en Node con el WASM; un cuadro de cámara dura 33 ms |
| Error de alcance, poses sintéticas | 2,0 a 2,7 cm (hay un sesgo de 2 cm a propósito: `JOINT_PENALTY`, para preferir posturas naturales) |
| Clip real de caminata (356 cuadros) | Los 356 seguidos, error mediano 3,2 cm y máximo 4,9 cm, rodilla entre 0 y 1,3 rad |
| Alcance del brazo del G1 | 30 cm del hombro a la muñeca: es corto, el robot no llega a donde llega una persona |

### Límites del retargeting

- **No se probó con una cámara real todavía.** Se probó con poses sintéticas, con el clip real de Juan y con la página en un navegador (`view.mimic` con una pose inyectada), pero no con una webcam en vivo.
- **El rumbo es ruidoso de perfil.** El eje de las caderas va por la profundidad, que es lo que peor mide MediaPipe: en el clip de carrera de `data/` el rumbo oscila entre 24° y 101°. De frente a la cámara, que es el modo en vivo, no pasa. Para clips se va a tomar del desplazamiento de la persona.
- **Sin desplazamiento.** La pelvis queda en el origen: en vivo no hay trayectoria. Los clips de `data/` sí la traen y se va a usar al retargetear clips.
- **La cintura del G1 gira poco** (unos 30° de inclinación), así que agacharse no se copia entero.
- **Una persona.** `mimic` sigue a la que MediaPipe elija.

## Cómo funciona

| Archivo | Qué hace |
| --- | --- |
| `src/sim.js` | Carga el MJCF desde memoria, arranca en el keyframe `stand`, sostiene la pose y avanza la física al ritmo del reloj. No usa nada del navegador, por eso `npm run check` lo prueba en Node |
| `src/load.js` | Baja el WASM de MuJoCo y los 39 archivos del G1, con progreso |
| `src/viewer.js` | Un objeto de three.js por cada geometría visible de MuJoCo, movido cada cuadro a la pose que calculó MuJoCo. No sabe nada del G1: sirve para cualquier MJCF |
| `src/pose.js` | Puntos de MediaPipe → puntos en los ejes del robot, filtrados (One Euro) y con histéresis de visibilidad. De Sombra |
| `src/filters.js` | El filtro One Euro. De Sombra |
| `src/retarget.js` | Pose → `qpos` del G1: la IK de Sombra sobre la cinemática de MuJoCo |
| `src/index.js` | `createSimView`: carga, ciclo de física y dibujo, controles y `mimic` |
| `src/main.js`, `index.html` | La página de desarrollo, con el botón de la cámara (usa `data/live`) |
| `scripts/check.mjs`, `scripts/check-retarget.mjs` | Pruebas sin navegador con el mismo WASM: la física, y el retargeting con poses sintéticas y con el clip real de caminata |
| `models/unitree_g1/` | El G1 de MuJoCo Menagerie, sin cambios ([README](models/unitree_g1/README.md)) |

- **De pie sin política:** los actuadores del G1 son de posición (`kp=500` en `g1.xml`): cada motor lleva su articulación al ángulo que dice `ctrl`. Poner `ctrl` igual a la pose `stand` hace que el robot la sostenga, como una estatua rígida. No se equilibra: con un empujón se cae.
- **Tiempo real:** la física avanza en pasos fijos de 2 ms (500 por segundo) hasta alcanzar el reloj. Si un cuadro tarda más de 1/30 s (pestaña oculta, compilación de shaders), no se recupera ese atraso: el robot va más lento un momento en vez de congelar la página.
- **Empujón:** 250 N durante 0,1 s sobre el torso, en una dirección al azar: unos 0,75 m/s para 33 kg, suficiente para tumbarlo.
- **Ejes:** MuJoCo usa z hacia arriba y three.js y hacia arriba; todo lo simulado cuelga de un grupo rotado -90° en x, así las poses se copian tal cual.

## Números medidos (Mac M5, 23 de octubre)

| Qué | Valor |
| --- | --- |
| G1 en WASM (Node), un núcleo | 25.000 pasos/s, 50 veces más rápido que el tiempo real |
| G1 nativo (Python), un núcleo | 44.700 pasos/s con `g1.xml`, 60.000 con `g1_mjx.xml` (cápsulas) |
| En el navegador | 500 pasos/s a x1,00 del tiempo real, 60 cuadros por segundo |
| Descarga | 30 MB: WASM 10,7 MB (2,7 MB comprimido) y mallas 19 MB |

## Límites conocidos

- **Sin equilibrio:** el G1 sostiene una pose fija; caminar o recuperarse de un empujón es trabajo de la política.
- **Dos variantes del modelo:** `scene.xml` (mallas, motores rígidos) es la que se ve hoy. `scene_mjx.xml` (cápsulas, motores más blandos) es la que se va a usar para entrenar; sin política se cae, porque sus motores son más blandos. Una política solo funciona sobre el modelo con que se entrenó, así que la web va a cargar `scene_mjx.xml` cuando haya política. Detalle en [`../docs/decisiones/2026-10-23-robot-g1.md`](../docs/decisiones/2026-10-23-robot-g1.md).
- **Dos copias de MediaPipe en el build:** la página importa `tridi-live` (`../data/live`), que no tiene `node_modules` en el deploy; `vite.config.js` hace que `@mediapipe/tasks-vision` se resuelva desde este paquete. Quien importe `tridi-live` desde otra carpeta (`web/`) necesita el mismo alias.
- **Peso de la descarga:** 30 MB en la primera visita; si pesa en celulares, se pueden simplificar las mallas.
