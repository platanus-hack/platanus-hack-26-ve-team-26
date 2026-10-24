# physics/

El robot de Tridi en un motor de física de verdad: el **Unitree G1** (29 articulaciones, 33,3 kg) simulado con **MuJoCo** compilado a WebAssembly, y dibujado con **three.js**. Todo corre en el navegador de quien abre la página; no hay servidor de física.

Hoy el G1 se sostiene de pie con sus motores y se cae si lo empujas: todavía no tiene una política que lo equilibre. Eso es lo que va a aprender en `training/`.

## Cómo correrlo

```bash
cd physics
npm install
npm run dev      # http://localhost:5173: el G1 de pie, con "Empujar" y "Reiniciar"
npm run check    # misma física en Node: de pie 10 s y se cae al empujarlo
npm run build    # dist/ estático, listo para desplegar
```

## Para la web (César): `createSimView`

```js
import { createSimView } from 'tridi-physics'; // o '../physics/src/index.js'

const view = await createSimView(canvas, {
  onProgress: ({ done, total, bytes }) => {},     // mientras bajan MuJoCo y el robot
  onStats: ({ realtime, pelvisHeight }) => {},    // una vez por segundo
});
view.pause(); view.play(); view.setSpeed(0.5);
view.reset(); view.push();
view.dispose(); // al desmontar: corta el ciclo y libera WebGL y la memoria de MuJoCo
```

La web pone el `<canvas>` (con su tamaño en CSS) y los botones; `physics/` pone la escena, el robot, la física y el render. `loadClip` y `loadPolicy` llegan cuando existan `RobotMotion` y la primera `policy.onnx` (ver [`../docs/contrato.md`](../docs/contrato.md)).

## Cómo funciona

| Archivo | Qué hace |
| --- | --- |
| `src/sim.js` | Carga el MJCF desde memoria, arranca en el keyframe `stand`, sostiene la pose y avanza la física al ritmo del reloj. No usa nada del navegador, por eso `npm run check` lo prueba en Node |
| `src/load.js` | Baja el WASM de MuJoCo y los 39 archivos del G1, con progreso |
| `src/viewer.js` | Un objeto de three.js por cada geometría visible de MuJoCo, movido cada cuadro a la pose que calculó MuJoCo. No sabe nada del G1: sirve para cualquier MJCF |
| `src/index.js` | `createSimView`: carga, ciclo de física y dibujo, controles |
| `scripts/check.mjs` | Prueba sin navegador con el mismo WASM |
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
- **Peso de la descarga:** 30 MB en la primera visita; si pesa en celulares, se pueden simplificar las mallas.
