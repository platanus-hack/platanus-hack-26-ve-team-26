# Un solo robot para toda la web, cargado al abrir la página

- **Fecha:** 2026-10-24 · **Quién:** César · **Estado:** vigente. Reemplaza la parte "precargar por intención" de [`2026-10-24-ui-menu-y-carga-por-etapas.md`](2026-10-24-ui-menu-y-carga-por-etapas.md).

## Contexto

Entrar a Simulaciones o a En vivo tardaba mucho, y volver a entrar tardaba lo mismo: cada pantalla creaba su propio G1 desde cero. Medido en Node (el mismo WASM que usa la página):

| Paso | Antes | Después |
| --- | --- | --- |
| Pasar los 19 MB de mallas a MuJoCo (`MjVFS.addBuffer`) | 24 463 ms | 23 ms (`FS.writeFile`) |
| Compilar el modelo (`from_xml_path`) | 3 400 ms | 3 332 ms |

`addBuffer` copia el `Uint8Array` elemento por elemento entre JavaScript y WASM. En la página, el robot quedaba listo a los 26 s; ahora, a los 6,6 s (Chrome sin GPU, así que en una laptop es menos).

## Decisión

- **`physics/src/sim.js`** carga el modelo por el sistema de archivos en memoria de Emscripten en vez de `MjVFS` (commit propio en la carpeta de Pastor; `npm run check` pasa).
- **Un solo G1 en la web** (`web/src/robot-host.js`): se crea una vez al abrir la página y su canvas se mueve al panel de la pantalla que lo muestra. Un contexto WebGL sobrevive a que se mueva su canvas, así que volver a una pantalla no vuelve a cargar nada. Fuera de la página, `physics/` no simula ni dibuja (otro commit propio en su carpeta).
- **Pantalla de carga al abrir:** "Tridi", un robot de puntos que empieza como cara y se deshace en el cuerpo cuando el G1 está listo, y una barra. Dura entre 1,8 s (para que la animación se lea) y 7 s (en una red lenta el menú aparece y el robot sigue cargando detrás).

## Por qué

- **Cargar al abrir y no al acercarse a la tarjeta:** César prefirió que la espera ocurra una vez, al principio y con animación, a que se note cada vez que se entra a una pantalla. El costo: un celular que solo mira el menú baja los 30 MB.
- **No un modelo precompilado (`.mjb`):** pesa 80 MB, más que las mallas, y esta versión del binding no expone `mj_loadModel`.

## Consecuencias

- Las pantallas reciben el robot con `attachRobot(pane)` y lo sueltan al salir. Lo encuentran de pie, a velocidad normal y sin clip ni cámara.
- Cambiar de modelo (`loadPolicy`) cambia el robot de todas las pantallas, porque es uno solo.
