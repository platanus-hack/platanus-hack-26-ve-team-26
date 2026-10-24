# El retargeting es la IK de Sombra, corrida sobre la cinemática de MuJoCo

- **Fecha:** 2026-10-24 · **Quién:** Pastor · **Estado:** vigente

## Contexto

Hay que convertir una pose humana (33 puntos de MediaPipe) en los ángulos del G1. Primero con la cámara en vivo, y después con los clips de `data/`. En Sombra (`real-steel/src/robot.js`, repo `platanus-ideas`) ya teníamos esto resuelto para el Apollo y para el G1, pero sobre una copia del robot en three.js.

## Decisión

1. **Se reutiliza el método de Sombra:** ejes del cuerpo a partir de hombros y caderas, cinemática inversa por descenso de coordenadas, filtro One Euro y visibilidad con histéresis. Se porta a `physics/src/` (`pose.js`, `filters.js`, `retarget.js`).
2. **La cadena cinemática es el modelo de MuJoCo**, no una copia en three.js: cada evaluación de la IK corre `mj_kinematics` sobre una copia de los datos. Así los ángulos son los de este G1, y el resultado sale ya como una fila de `qpos` (36 valores), que es exactamente `RobotMotion` ([contrato](../contrato.md)).
3. **Se copian cintura, brazos, piernas y rumbo de la pelvis; pies planos.** Sombra copiaba solo torso y brazos, y dejaba las piernas en guardia. Aquí también van las piernas, porque el entrenamiento necesita el movimiento de cuerpo entero como referencia. Lo que la cámara no ve se queda en la pose de pie.
4. **La entrada es lo que entrega `onPose` de `data/live`** (los `world` crudos de MediaPipe), por `view.mimic(pose)`. La web de César solo conecta las dos cosas.
5. **La pelvis se coloca en modo "marioneta"** (`sim.puppet(qpos)`): sin dinámica, solo `mj_forward`. Es una referencia, no un robot físico; el robot físico que la imite será la política de `training/`.

## Por qué

- **Reutilizar y no reescribir:** la IK de Sombra ya estaba probada con cámara real en iPhone y Android; reescribirla era perder horas.
- **Una sola cinemática:** con una copia en three.js habría dos modelos del mismo robot que pueden discrepar, y habría que convertir ángulos al formato de MuJoCo. Con MuJoCo el costo es 1,7 ms por cuadro (medido), sobrado para 30 fps.
- **Fidelidad con los clips:** el clip real de caminata de Juan pasa por el mismo código (356 cuadros, error mediano 3,2 cm), así que lo que se vea en vivo es lo mismo que se va a entrenar.

Descartado: **llevar la copia de three.js de Sombra tal cual** (`mjcf.js`, 145 líneas más, y dos modelos del robot). **Retargeting con una red entrenada** (GMR, SONIC): es el trabajo de entrenar que queremos mostrar como nuestro, no un paso previo.

## Consecuencias

- **César:** `onPose: (pose) => view.mimic(pose)` ([`physics/README.md`](../../physics/README.md)). Si importa `tridi-live` desde `web/`, necesita el alias de `@mediapipe/tasks-vision` que está en `physics/vite.config.js`, porque `data/live` no tiene `node_modules` en el deploy.
- **Juan:** `data/live` ya no es solo de la web: la página de `physics/` (el deploy actual) lo importa. Un cambio que rompa `createLiveCapture`, `drawSkeleton` o `CameraError` rompe ese deploy.
- **`training/`:** la referencia de imitación sale de aquí, por frame, con los mismos 36 valores de `qpos`.
- **Pendiente para clips:** retargetear un `PoseClip` completo con su trayectoria de la pelvis (hoy la pelvis queda en el origen) y sacar el rumbo del desplazamiento, porque de perfil el eje de las caderas es ruidoso (en el clip de carrera oscila entre 24° y 101°).
