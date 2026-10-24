# Estado

Dónde está cada parte **ahora**. Es lo primero que lee un agente al empezar. Cada uno actualiza solo su sección, al cerrar una sesión o cuando algo cambia (para que dos personas no editen las mismas líneas). El detalle de cada sesión está en [`bitacora/`](bitacora).

**Track:** 🧊 Three-Dimensional · **Idea:** Tridi: de video humano a un robot simulado que aprende a moverse solo ([decisión](decisiones/2026-10-23-idea-tridi.md)) · **Cierre de repos:** domingo 25, 08:30

---

## Pastor: física, render y entrenamiento (`physics/`, `training/`)

Escena MuJoCo, robot Unitree G1, retargeting de `PoseClip` a `RobotMotion`, render three.js; arranca `training/` ([decisión](decisiones/2026-10-23-robot-g1.md)).

- **Funciona:** el G1 de pie en MuJoCo WASM dentro del navegador, con three.js, a tiempo real, y se cae si se lo empuja. `createSimView(canvas)` lista para la web ([`physics/README.md`](../physics/README.md)). **Retargeting en vivo:** `view.mimic(pose)` convierte lo que entrega `onPose` de `data/live` en los 36 valores de `qpos` del G1 (cintura, brazos, piernas, rumbo de la pelvis, pies planos), con la IK de Sombra sobre la cinemática de MuJoCo ([decisión](decisiones/2026-10-24-retargeting-sombra-en-mujoco.md)); 1,7 ms por cuadro, y con el clip real de caminata de Juan queda a 3,2 cm de error mediano. Botón "Cámara" en la página de desarrollo. `npm run check` prueba física y retargeting en Node. **Deploy:** https://tridi-alpha.vercel.app (Vercel, desde el espejo `Torpass/tridi` que actualiza `ship.sh`; [decisión](decisiones/2026-10-23-deploy.md)).
- **En curso:** —
- **Bloqueado por:** nada. Falta probar el retargeting con una webcam real (solo se probó con poses sintéticas, el clip de Juan y la página con una pose inyectada).
- **Sigue:** probar la cámara en vivo; retargetear un `PoseClip` completo (trayectoria de la pelvis y rumbo del desplazamiento) para `RobotMotion`; Render para el servidor de video cuando `data/` tenga uno; entorno de entrenamiento con `scene_mjx.xml` (Python, MuJoCo 3.16.0) y una primera política que se sostenga de pie, con checkpoints desde el paso 0.

---

## Juan: extracción de datos (`data/`)

Cámara en vivo y videos subidos → elegir y seguir al sujeto → `PoseClip` limpio.

- **Funciona:** `python -m data.extract <video|zip> [--click x,y]` saca el `PoseClip` (JSON + `.npz`) de un sujeto entre varias personas; `data.overlay` lo comprueba sobre el video. Precargadas `caminar-perfil` y `correr-perfil` en `data/clips/`. Uso y límites en [`../data/README.md`](../data/README.md). Cámara en vivo en el navegador: `createLiveCapture` en [`../data/live/`](../data/live/README.md), mismo `PoseClip`, 30 fps. Espejo propio `juanevillam/tridi-data`. Servidor de videos (`data/server.py`, API en el contrato) con subida por partes, cola, progreso por etapas y elegir sujeto con un click; corre en la Mac con `data/serve.sh` (túnel de Cloudflare). Cliente JS `uploadVideo`/`watchJob` en `data/live`.
- **En curso:** `training/`: la primera política (`training/policies/g1-stand.onnx`) sostiene al G1 de pie 20 s y aguanta 2,2 de 4 empujones de 250 N; sigue entrenando con empujones más fuertes. Formato de la observación para la web en [`../training/README.md`](../training/README.md).
- **Bloqueado por:** —
- **Integración probada (24/10):** servidor + túnel: el clip sale en 25 s por internet. Los dos clips mueven al G1 con `mimic` (356/356 cuadros, 3,2 cm). La galería de César los muestra. Se arregló un salto de 6 m en `correr-perfil` (ajuste a la cámara atípico al entrar al cuadro). Detalle en la [bitácora](bitacora/2026-10-24-0010-juan-integracion.md).
- **Sigue:** César conecta `web/` con `resolveApiUrl` (la URL del servidor llega por `?api=`, que imprime `data/serve.sh`). Pastor: `playClip` con la trayectoria de la pelvis. Revisar por qué en vivo la velocidad sale 50% más alta que offline. Grabar precargadas propias de perfil. Límite clave: de frente el avance sale ≈ 0, hay que grabar de perfil.

---

## César: experiencia de usuario de la simulación (`web/`)

App web: captura, subida, galería de precargadas, vista de la simulación y progreso. Nunca una pantalla de carga vacía.

- **Funciona:** plan en [`../web/TAREAS.md`](../web/TAREAS.md). Web rediseñada ([decisión](decisiones/2026-10-24-ui-menu-y-carga-por-etapas.md)): menú con tres opciones, cada una con un robot de puntos que forma su cara con hover, tarjetas 3D que se inclinan con el cursor y un fondo que reacciona a él. Rutas por hash y carga por etapas: el menú solo baja three.js, y MuJoCo y el G1 se precargan al acercarse a "Ver simulaciones". Simulaciones (galería, persona y G1 en paleta clara) funciona; En vivo y Subir solo explican los pasos.
- **En curso:** —
- **Bloqueado por:** nada. Pastor: la raíz de Vercel sigue en `physics/`.
- **Sigue:** conectar En vivo (M4, con `tridi-live` y `view.mimic`) y Subir (M5 y M6, con la API del servidor de video).

---

## Ale: estrategia, pitch y guion (`docs/`)

Pitch, README, diferencia con lo que ya existe, video para el voto público.

- **Funciona:** investigación de competencia cerrada y escrita en [`pitch/diferencia.md`](pitch/diferencia.md); borrador 1 del guion de 3 minutos en [`pitch/guion-3-minutos.md`](pitch/guion-3-minutos.md), con el banco de preguntas del jurado.
- **En curso:** leer el guion en voz alta con reloj (está cronometrado sobre el papel: 143 s de habla + 29 s de pantalla, con `pitch/tools/cronometro.py`) y decidir quién presenta y quién maneja la pantalla.
- **Bloqueado por:** el bloque más fuerte del pitch (la escalera del aprendizaje) necesita **checkpoints intermedios guardados** del entrenamiento (0, 1k, 10k, 100k pasos). Sin eso hay que reescribir el guion.
- **Sigue:** plan B grabado el sábado en la noche (video de 40 s de la demo, sirve también para el voto público); `README.md` y los archivos de entrega cuando haya deploy.
