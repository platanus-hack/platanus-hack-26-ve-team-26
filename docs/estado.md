# Estado

Dónde está cada parte **ahora**. Es lo primero que lee un agente al empezar. Cada uno actualiza solo su sección, al cerrar una sesión o cuando algo cambia (para que dos personas no editen las mismas líneas). El detalle de cada sesión está en [`bitacora/`](bitacora).

**Track:** 🧊 Three-Dimensional · **Idea:** Tridi: de video humano a un robot simulado que aprende a moverse solo ([decisión](decisiones/2026-10-23-idea-tridi.md)) · **Cierre de repos:** domingo 25, 08:30

---

## Pastor: física, render y entrenamiento (`physics/`, `training/`)

Escena MuJoCo, robot Unitree G1, retargeting de `PoseClip` a `RobotMotion`, render three.js; arranca `training/` ([decisión](decisiones/2026-10-23-robot-g1.md)).

- **Funciona:** el G1 en MuJoCo WASM dentro del navegador, con three.js, a tiempo real ([`physics/README.md`](../physics/README.md)). Sobre eso: `view.mimic(pose)` (copia a una persona desde la cámara), `view.playClip(motion)` (reproduce un `RobotMotion`, con el reloj de la web), `view.loadPolicy(onnx, json)` (una política de `training/`: se equilibra y se recupera de empujones, 150 N de los cuatro lados y 250 N de tres) y `npm run retarget` (un `PoseClip` completo → `physics/motions/`, con recorrido y rumbo de la pelvis). `npm run check` prueba física, retargeting y política en Node. **Integrado en `web/`:** la pantalla de simulaciones muestra al robot repitiendo el clip junto al esqueleto, con la política cargada (Empujar y un selector de checkpoints). **Deploy:** https://tridi-alpha.vercel.app.
- **En curso:** —
- **Bloqueado por:** nada. Falta probar `mimic` con una webcam real.
- **Sigue:** con Juan, que el botón Empujar (250 N) salga bien siempre; probar `mimic` (pantalla En vivo) con una webcam real.

---

## Juan: extracción de datos (`data/`)

Cámara en vivo y videos subidos → elegir y seguir al sujeto → `PoseClip` limpio.

- **Funciona:** `python -m data.extract <video|zip> [--click x,y]` saca el `PoseClip` (JSON + `.npz`) de un sujeto entre varias personas; `data.overlay` lo comprueba sobre el video. Precargadas `caminar-perfil` y `correr-perfil` en `data/clips/`. Uso y límites en [`../data/README.md`](../data/README.md). Cámara en vivo en el navegador: `createLiveCapture` en [`../data/live/`](../data/live/README.md), mismo `PoseClip`, 30 fps. Espejo propio `juanevillam/tridi-data`. Servidor de videos (`data/server.py`, API en el contrato) con subida por partes, cola, progreso por etapas y elegir sujeto con un click; corre en la Mac con `data/serve.sh` (túnel de Cloudflare). Cliente JS `uploadVideo`/`watchJob` en `data/live`.
- **En curso:** `training/`: la primera política (`training/policies/g1-stand.onnx`) sostiene al G1 de pie y aguanta los 4 empujones de 250 N de la prueba (40 M pasos, ~73 min en una M2). Sigue: imitación con los `RobotMotion` de Pastor. Formato de la observación para la web en [`../training/README.md`](../training/README.md).
- **Bloqueado por:** —
- **Integración probada (24/10):** servidor + túnel: el clip sale en 25 s por internet. Los dos clips mueven al G1 con `mimic` (356/356 cuadros, 3,2 cm). La galería de César los muestra. Se arregló un salto de 6 m en `correr-perfil` (ajuste a la cámara atípico al entrar al cuadro). Detalle en la [bitácora](bitacora/2026-10-24-0010-juan-integracion.md).
- **Sigue:** César conecta `web/` con `resolveApiUrl` (la URL del servidor llega por `?api=`, que imprime `data/serve.sh`). Pastor: `playClip` con la trayectoria de la pelvis. Revisar por qué en vivo la velocidad sale 50% más alta que offline. Grabar precargadas propias de perfil. Límite clave: de frente el avance sale ≈ 0, hay que grabar de perfil.

---

## César: experiencia de usuario de la simulación (`web/`)

App web: captura, subida, galería de precargadas, vista de la simulación y progreso. Nunca una pantalla de carga vacía.

- **Funciona:** plan en [`../web/TAREAS.md`](../web/TAREAS.md). Web con menú 3D ([decisión](decisiones/2026-10-24-ui-menu-y-carga-por-etapas.md)) y sus tres pantallas: **En vivo** (cámara con `data/live` y el G1 copiando con `view.mimic`), **Subir** (subida por partes, etapas, elegir persona y el clip en la galería) y **Simulaciones**. Si el servidor de video no responde, "Subir" queda visible como "No disponible ahora". "Empujar" flota sobre el robot y se ve sin scroll.
- **En curso:** —
- **Bloqueado por:** nada. Falta subir un video real de punta a punta con el servidor de Juan (la conexión y el CORS ya responden).
- **Sigue:** Pastor pasa la raíz de Vercel a `web/` (la web ya hace todo lo de la página de `physics/`). W4.3 (grabar desde la cámara a la galería) si hay tiempo.

---

## Ale: estrategia, pitch y guion (`docs/`)

Pitch, README, diferencia con lo que ya existe, video para el voto público.

- **Funciona:** investigación de competencia cerrada y escrita en [`pitch/diferencia.md`](pitch/diferencia.md); borrador 1 del guion de 3 minutos en [`pitch/guion-3-minutos.md`](pitch/guion-3-minutos.md), con el banco de preguntas del jurado.
- **En curso:** leer el guion en voz alta con reloj (está cronometrado sobre el papel: 143 s de habla + 29 s de pantalla, con `pitch/tools/cronometro.py`) y decidir quién presenta y quién maneja la pantalla.
- **Bloqueado por:** el bloque más fuerte del pitch (la escalera del aprendizaje) necesita **checkpoints intermedios guardados** del entrenamiento (0, 1k, 10k, 100k pasos). Sin eso hay que reescribir el guion.
- **Sigue:** plan B grabado el sábado en la noche (video de 40 s de la demo, sirve también para el voto público); `README.md` y los archivos de entrega cuando haya deploy.
