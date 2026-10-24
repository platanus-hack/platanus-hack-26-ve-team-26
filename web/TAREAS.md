# Tareas de `web/` (César)

La app web de Tridi: capturar o subir un video, ver siempre una simulación y seguir el progreso. Regla que manda sobre todo lo demás: **nunca una pantalla de carga vacía**. Mientras algo carga o se procesa, el visor muestra una simulación precargada.

Para no esperar a nadie, la web arranca con **datos falsos**: un `PoseClip` sintético y un visor provisional. Cuando lleguen el `PoseClip` real (Juan) y la escena MuJoCo (Pastor), se reemplazan sin tocar la UI.

Estado de cada tarea: `[ ]` pendiente, `[~]` en curso, `[x]` lista.

**Correr la web:** `cd web && npm install && npm run dev`. `physics/` entra como paquete local (`tridi-physics`); `three` y `@mujoco/mujoco` se instalan en `web/` con las mismas versiones que en `physics/package.json`: si Pastor las cambia, hay que cambiarlas aquí también. El clip sintético se regenera con `node scripts/make-synthetic-clip.mjs`.

## M0. Base (bloquea todo lo demás)

- [x] **W0.1 Proyecto.** JavaScript y three.js sin framework; Vite solo para desarrollar y empaquetar a un `dist/` estático ([decisión](../docs/decisiones/2026-10-23-web-sin-framework.md)).
- [~] **W0.2 Deploy temprano.** Ya hay deploy en Vercel (https://tridi-alpha.vercel.app), pero publica `physics/`. Falta que Pastor pase la raíz del proyecto a `web/`.
- [~] **W0.3 Tipos del contrato.** Copia provisional del borrador, como JSDoc, en `web/src/contract.js`. Cuando el contrato pase a "vigente", se mueve al archivo de tipos compartido en un commit de contrato aparte, y se agrega el manifiesto de precargadas.
- [x] **W0.4 Datos falsos.** `web/clips/clip_synthetic_march_01.json`: 2,4 s de una persona marchando en el lugar, generado por `web/scripts/make-synthetic-clip.mjs`.

## M1. Layout y estados

- [x] **W1.1 Pantalla única.** Primera versión: visor y panel con pestañas. La reemplazó el menú de M8.
- [x] **W1.2 Máquina de estados.** `idle → capturando | subiendo → procesando → en cola → listo`, y `error` desde cualquiera. Un objeto de estado con suscriptores en JS plano, para que cada panel sepa qué mostrar (`web/src/state.js`); una transición inválida lanza un error.

## M2. Galería de precargadas (lo que se ve siempre)

- [x] **W2.1 Manifiesto.** `web/src/preloaded.json` (formato en [`../docs/contrato.md`](../docs/contrato.md)). Los clips se toman de `data/clips/` y `web/clips/` al compilar. Faltan las políticas, cuando existan.
- [x] **W2.2 Tarjetas.** Título, duración, fps, % de frames detectados y crédito del video; un click la carga en el visor.
- [x] **W2.3 Arranque.** Al abrir la página se reproduce la primera de la lista, en loop. El esqueleto pesa KB y aparece antes que el robot (30 MB).

## M8. Rediseño: menú 3D y carga por etapas

Pedido de César: una UI que cualquiera entienda, hasta una persona mayor, con mucho three.js, colores fríos con blanco y tipografía suave ([decisión](../docs/decisiones/2026-10-24-ui-menu-y-carga-por-etapas.md)).

- [x] **W8.1 Menú principal.** "Tridi" arriba al centro y tres opciones grandes, numeradas y con palabras simples: Entrena a Tridi en vivo, Sube un video, Ver simulaciones. En celular entran las tres sin scroll.
- [x] **W8.2 Robots de puntos.** Uno por opción: bailando, sentado viendo un video y mirando el teléfono (un recap de lo que hizo). Con hover (o por turnos en pantallas táctiles), los puntos se juntan y forman la cara del robot. Un solo canvas WebGL para todo (`web/src/dots/`).
- [x] **W8.3 Rutas y carga por etapas.** `#/`, `#/en-vivo`, `#/subir`, `#/simulaciones`. El menú solo carga three.js (144 KB comprimidos); cada pantalla es un pedazo aparte. El robot se carga una vez al abrir la página (W8.7).
- [x] **W8.4 Nunca colgado.** Mientras baja el G1, en su panel saluda un robot de puntos con una barra de progreso; si una pantalla tarda, aparece "Cargando…"; si no se puede descargar, una pantalla explica qué hacer.
- [x] **W8.5 Tarjetas 3D y entorno vivo.** Las tarjetas son placas de vidrio con grosor que se inclinan con el cursor, y la cámara de su robot gira con ellas. Los puntos del fondo se apartan del cursor, una luz suave lo sigue y los robots lo miran.
- [x] **W8.7 Un solo robot y pantalla de carga.** El G1 se crea una vez al abrir la página (`web/src/robot-host.js`) y su canvas se mueve entre pantallas; una pantalla de carga con el robot de puntos cubre el inicio ([decisión](../docs/decisiones/2026-10-24-robot-unico-y-carga-al-abrir.md)). Con el arreglo de `physics/src/sim.js`, el robot pasó de 26 s a 6,6 s.
- [x] **W8.6 Pantallas En vivo y Subir.** Conectadas (M4, M5 y M6). Empujar flota sobre el robot y se ve sin scroll en 390×844, 1280×720 y 1366×768.

## M3. Visor de la simulación (junto con Pastor)

- [~] **W3.1 Interfaz con `physics/`.** Pastor ya la publicó: `createSimView(canvas, { onProgress, onStats })` con `play`, `pause`, `setSpeed`, `reset`, `push` y `dispose` ([`physics/README.md`](../physics/README.md)). La web ya la importa (`web/src/viewer.js`) y muestra al G1 de pie; `loadClip` y `loadPolicy` llegan después.
- [x] **W3.2 Esqueleto.** El `PoseClip` en three.js (`web/src/skeleton.js`), en un panel junto al robot, con la misma escena que `physics/`. La cámara sigue a las caderas y el pie más bajo del clip queda sobre el piso.
- [x] **W3.3 Controles.** Pausa, velocidad (x0,25, x0,5, x1) y reiniciar mueven a los dos paneles; empujar, solo al robot; cámara orbital en cada uno; selector Ambos, Humano o Robot. En celular los paneles se apilan y los controles van en su propia fila.
- [x] **W3.5 El robot repite el movimiento.** La pantalla de simulaciones le da al G1 el `RobotMotion` del clip (`view.playClip`) y lo mantiene en el mismo segundo que el esqueleto (`view.seek` con el reloj del esqueleto). Los clips precargados usan el movimiento ya guardado en `physics/motions/` (`web/src/motions.js`) y arrancan al instante; el sintético y los videos subidos se calculan en el navegador (`view.retarget`), por tandas y con su porcentaje, sin congelar la página (0,14 s para el sintético).
- [x] **W3.6 Política y Empujar.** Al abrir la pantalla se carga la política entrenada (`view.loadPolicy`, `web/src/policies.js`) y "Empujar" suelta el clip y muestra al robot equilibrándose; "Empezar de nuevo" vuelve al clip. El selector "Robot entrenado con" cambia de checkpoint (sin entrenar, 3 M, 10 M, 20 M y 40 M de pasos): la escalera del pitch, de a un robot. La final aguanta el empujón de 250 N del botón desde las cuatro direcciones.
- [ ] **W3.4 Carga pesada.** MuJoCo WASM, onnxruntime-web y la política se descargan con barra de progreso, y la precargada ya visible no se corta.

## M4. Captura en vivo

- [x] **W4.1 Cámara.** `#/en-vivo` (`web/src/screens/live.js`): un botón grande enciende y apaga la cámara, la vista previa va en espejo, y si el permiso se niega se muestra el mensaje de `CameraError` tal cual. MediaPipe se baja recién al encender la cámara, con el modelo `lite` en celulares.
- [x] **W4.2 Pose en vivo.** `drawSkeleton` sobre el video y `view.mimic(pose)` mueve al G1. Mensajes simples una vez por segundo (no te veo, te veo a medias, te veo) y un aviso si van menos de 20 cuadros por segundo. Empujar apaga la cámara y devuelve el robot a la física.
- [ ] **W4.3 Grabar.** Pendiente: no se pidió para esta entrega. Cuenta regresiva, grabar y parar. El resultado es un `PoseClip` con `source: "camera"`.

## M5. Subir archivos

- [x] **W5.1 Drop zone.** `#/subir` (`web/src/screens/upload.js`): elegir o arrastrar; antes de subir se revisan tipo, 60 MB y 30 s, con el motivo en palabras simples. Indicación: "Graba de perfil y con el cuerpo entero en cuadro".
- [x] **W5.2 Subida por partes.** `uploadVideo` de `data/live` (reintenta cada parte), con barra y botón Cancelar. Al abrir la página se revisa el servidor (`resolveApiUrl` y `checkApi`, `web/src/api.js`): si no responde, la tarjeta "Subir" se queda en el menú, gris, con "No disponible ahora" y el motivo, y no abre; cámara y galería siguen igual (pedido de Juan: no parpadea y en el pitch se ve que la función existe).
- [x] **W5.3 Elegir sujeto.** Con dos o más personas, su cuadro con una caja por persona; la elegida va marcada y un click llama a `chooseSubject` y sigue el trabajo de nuevo.

## M6. Progreso

- [x] **W6.1 Etapas.** Subir → buscar personas (`tracking`) → calcular cómo se mueve (`pose3d`) → listo, con su avance y la posición en la cola. Si se sale de la pantalla, el trabajo sigue y al volver se retoma.
- [x] **W6.2 Resultado.** El clip va primero en la galería ("Tu video") y "Verlo en simulaciones" abre `#/simulaciones/<id del clip>` con ese clip elegido. Se guarda en memoria: al recargar, la galería vuelve a las precargadas.

## M9. Marca corporativa (innegociable)

La web es un producto para empresas de robots humanoides: profesional, sobria, con números reales. Regla en [`../docs/decisiones/2026-10-24-marca-b2b-robotica.md`](../docs/decisiones/2026-10-24-marca-b2b-robotica.md); guía completa en [`../docs/marca.md`](../docs/marca.md).

- [~] **W9.1 Estilo.** Voto de César registrado en la decisión de marca (figure.ai, skild.ai, scale.com; base clara). Aplicado: base gris clarito `#f1f2f4`, superficies blancas, tinta casi negra, un acento cobalto, Geist y Geist Mono (`web/src/style.css`). Falta el voto de los otros 3.
- [x] **W9.2 Landing.** `web/src/screens/home.js`, con el G1 en vivo y Empujar en el hero, y la política entrenada cargada. Las 8 secciones de `docs/marca.md` (hero con el G1 en vivo, problema, cómo funciona, pruébalo, resultados, para quién, tecnología, cierre).
- [x] **W9.3 Consola.** Mismo estilo en las tres pantallas; los robots de puntos quedan en gris, sin cara, como una nube de datos que se arma en robot (pantalla de carga y espera del G1). Salieron el fondo de puntos, la luz del cursor y las tarjetas inclinables. Cámara, Subir y Simulaciones con el mismo estilo, como la parte "producto" de la landing. Las funciones no cambian.
- [x] **W9.4 Cifras.** Cada número enlaza a su README: ~40 s por 10 s de video (`data/`), 3,2 cm (`physics/`), 73 min, 40 M pasos, 4 de 4 empujones y la escalera (`training/`). Sin logos ni empresas como clientes. Cada número de la web sale de un README del repo y respeta "Lo que NO podemos decir" de `docs/pitch/diferencia.md`. Sin logos ni nombres de empresas como clientes.

## M7. Pulido para la demo

- [ ] **W7.1 Modo demo.** Loop automático por las precargadas para la pantalla del stand.
- [ ] **W7.2 Errores claros.** Mensajes en español, sin trazas técnicas.
- [ ] **W7.3 Rendimiento.** 30 fps o más en una Mac y en un celular, porque el voto público abre el link desde el teléfono.

## Orden propuesto

1. **Viernes en la noche:** M0, M1 y M2 con datos falsos. Al terminar ya hay una web desplegada que nunca está vacía.
2. **Sábado en la mañana:** M3, integrando la escena de Pastor apenas exista.
3. **Sábado en la tarde:** M4 y M5, integrando a Juan.
4. **Sábado en la noche:** M6.
5. **Domingo temprano:** M7, antes del cierre de las 08:30.

## Lo que necesito de otros

| De | Qué | Para |
| --- | --- | --- |
| Pastor | Host del deploy (W0.2); `loadClip` y `loadPolicy` en `createSimView` | W0.2, M3 |
| Juan | Módulo de pose en vivo y endpoint para subir y procesar | M4, M5, M6 |
| `training/` | Una `policy.onnx` de prueba, aunque sea mala | W3.4 |
| Los 4 | Contrato aceptado y formato del manifiesto de precargadas | W0.3, W2.1 |
