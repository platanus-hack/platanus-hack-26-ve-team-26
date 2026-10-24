# La web abre en un menú 3D liviano y carga lo pesado por etapas

- **Fecha:** 2026-10-24 · **Quién:** César · **Estado:** vigente, salvo la precarga por intención: reemplazada por [`2026-10-24-robot-unico-y-carga-al-abrir.md`](2026-10-24-robot-unico-y-carga-al-abrir.md)

## Contexto

La primera versión de la web cargaba todo de una: three.js, MuJoCo (WASM de 11 MB) y el G1 (19 MB), antes de mostrar nada útil. En el stand y en el voto público la abren personas de cualquier edad, muchas desde el celular. César pidió una UI que hasta una persona mayor entienda, con mucho three.js, colores fríos con blanco y tipografía suave.

## Decisión

- **Menú principal** con "Tridi" arriba y tres opciones grandes y numeradas: en vivo, subir un video y ver simulaciones. Cada una tiene un robot hecho de puntos que forma su cara con hover.
- **Rutas por hash** (`#/subir`, etc.): funcionan en cualquier host estático sin configurar reescrituras.
- **Cada pantalla es un pedazo de código aparte.** El menú solo carga three.js. MuJoCo y el robot se piden cuando el cursor llega a "Ver simulaciones" (o al tocarla), con prioridad baja, para que el click encuentre todo en la caché del navegador.
- **Siempre hay algo en pantalla:** un robot de puntos mientras carga el G1, un "Cargando…" si una pantalla tarda más de 300 ms, y una pantalla de error con un botón si falla la descarga.
- **Un solo canvas WebGL** detrás de la página dibuja el fondo y todos los robots de puntos, cada uno en el rectángulo de su tarjeta.
- **Paleta clara y fría** (blanco, tinta azul marino y un acento azul hielo) y tipografías **Quicksand** (títulos) y **Nunito** (texto), empaquetadas con la web para no depender de un CDN.

## Por qué

- **Precargar por intención y no al abrir:** un celular que solo mira el menú no debería gastar 30 MB de datos. El cursor tarda casi un segundo en llegar a la tarjeta y hacer click, que es tiempo de descarga ganado.
- **Robots de puntos y no el G1 en el menú:** se dibujan con miles de puntos en una sola llamada a la GPU y no pesan nada; el G1 son 19 MB de mallas.
- **Un canvas y no uno por tarjeta:** los navegadores limitan los contextos WebGL, y cada contexto repite el trabajo de la GPU.

## Consecuencias

- `physics/` acepta `theme` en `createSimView` (commit propio en su carpeta) para que el G1 se vea en la misma paleta clara. Por defecto sigue oscuro.
- `web/src/physics-assets.js` lista los mismos archivos que `physics/src/load.js`. Si Pastor cambia el modelo o la versión de MuJoCo, hay que revisar que coincidan.
