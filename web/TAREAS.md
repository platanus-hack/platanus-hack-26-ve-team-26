# Tareas de `web/` (César)

La app web de Tridi: capturar o subir un video, ver siempre una simulación y seguir el progreso. Regla que manda sobre todo lo demás: **nunca una pantalla de carga vacía**. Mientras algo carga o se procesa, el visor muestra una simulación precargada.

Para no esperar a nadie, la web arranca con **datos falsos**: un `PoseClip` sintético y un visor provisional. Cuando lleguen el `PoseClip` real (Juan) y la escena MuJoCo (Pastor), se reemplazan sin tocar la UI.

Estado de cada tarea: `[ ]` pendiente, `[~]` en curso, `[x]` lista.

**Correr la web:** `cd web && npm install && npm run dev`. El clip sintético se regenera con `node scripts/make-synthetic-clip.mjs`.

## M0. Base (bloquea todo lo demás)

- [x] **W0.1 Proyecto.** JavaScript y three.js sin framework; Vite solo para desarrollar y empaquetar a un `dist/` estático ([decisión](../docs/decisiones/2026-10-23-web-sin-framework.md)).
- [ ] **W0.2 Deploy temprano.** Publicar `web/dist/` en el host que elija Pastor y poner la URL real en `deploy-url` de `platanus-hack-project.jsonc`.
- [~] **W0.3 Tipos del contrato.** Copia provisional del borrador, como JSDoc, en `web/src/contract.js`. Cuando el contrato pase a "vigente", se mueve al archivo de tipos compartido en un commit de contrato aparte, y se agrega el manifiesto de precargadas.
- [x] **W0.4 Datos falsos.** `web/public/preloaded/clip_synthetic_march_01.json`: 2,4 s de una persona marchando en el lugar, generado por `web/scripts/make-synthetic-clip.mjs`.

## M1. Layout y estados

- [ ] **W1.1 Pantalla única.** HTML y CSS a mano. El visor ocupa casi toda la pantalla; al costado, un panel con tres pestañas: Capturar, Subir y Galería. Los botones principales se ven sin hacer scroll, también en el proyector.
- [ ] **W1.2 Máquina de estados.** `idle → capturando | subiendo → procesando → en cola → listo`, y `error` desde cualquiera. Un objeto de estado con suscriptores en JS plano, para que cada panel sepa qué mostrar.

## M2. Galería de precargadas (lo que se ve siempre)

- [ ] **W2.1 Manifiesto.** Leer `preloaded/manifest.json`: lista de pares `PoseClip` + `Policy` con nombre y miniatura.
- [ ] **W2.2 Tarjetas.** Click en una tarjeta la carga en el visor.
- [ ] **W2.3 Arranque.** Al abrir la página se reproduce una precargada sola, en loop.

## M3. Visor de la simulación (junto con Pastor)

- [ ] **W3.1 Interfaz con `physics/`.** Pastor ya la publicó: `createSimView(canvas, { onProgress, onStats })` con `play`, `pause`, `setSpeed`, `reset`, `push` y `dispose` ([`physics/README.md`](../physics/README.md)). Falta importarla en la web; `loadClip` y `loadPolicy` llegan después.
- [ ] **W3.2 Visor provisional.** Esqueleto del `PoseClip` en three.js, para tener algo que mostrar antes de que exista el robot.
- [ ] **W3.3 Controles.** Play y pausa, velocidad, reiniciar, cámara orbital, y ver humano, robot o los dos lado a lado.
- [ ] **W3.4 Carga pesada.** MuJoCo WASM, onnxruntime-web y la política se descargan con barra de progreso, y la precargada ya visible no se corta.

## M4. Captura en vivo

- [ ] **W4.1 Cámara.** Pedir permiso, mostrar la vista previa y explicar qué hacer si el usuario lo rechaza.
- [ ] **W4.2 Pose en vivo.** Esqueleto dibujado sobre el video y en 3D en el visor. El módulo de MediaPipe es de `data/` (Juan); la web lo llama y lo muestra.
- [ ] **W4.3 Grabar.** Cuenta regresiva, grabar y parar. El resultado es un `PoseClip` con `source: "camera"`.

## M5. Subir archivos

- [ ] **W5.1 Drop zone.** Arrastrar un `.mp4` o un `.zip` de `.mp4`, con validación de tipo y tamaño antes de subir.
- [ ] **W5.2 Subida por partes.** Barra de progreso por archivo, y que siga si falla una parte. Necesita el endpoint del servidor (ver preguntas abiertas).
- [ ] **W5.3 Elegir sujeto.** Primer frame con una caja por persona; la elegida sola aparece marcada y un click elige otra (`selected_by: "user"`).

## M6. Progreso

- [ ] **W6.1 Etapas.** Subiendo → detectando personas → pose 3D → retargeting → entrenamiento (en cola) → listo, cada una con su avance.
- [ ] **W6.2 Resultado.** Cuando el clip está listo, aparece en la galería y se puede ver junto a la precargada.

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
