# Estado

Dónde está cada parte **ahora**. Es lo primero que lee un agente al empezar. Cada uno actualiza solo su sección, al cerrar una sesión o cuando algo cambia (para que dos personas no editen las mismas líneas). El detalle de cada sesión está en [`bitacora/`](bitacora).

**Track:** 🧊 Three-Dimensional · **Idea:** Tridi: de video humano a un robot simulado que aprende a moverse solo ([decisión](decisiones/2026-10-23-idea-tridi.md)) · **Cierre de repos:** domingo 25, 08:30

---

## Pastor: física, render y entrenamiento (`physics/`, `training/`)

Escena MuJoCo, robot Unitree G1, retargeting de `PoseClip` a `RobotMotion`, render three.js; arranca `training/` ([decisión](decisiones/2026-10-23-robot-g1.md)).

- **Funciona:** el G1 de pie en MuJoCo WASM dentro del navegador, con three.js, a tiempo real, y se cae si se lo empuja. `createSimView(canvas)` lista para la web ([`physics/README.md`](../physics/README.md)). `npm run check` prueba la física en Node. **Deploy:** https://tridi-alpha.vercel.app (Vercel, desde el espejo `Torpass/tridi` que actualiza `ship.sh`; [decisión](decisiones/2026-10-23-deploy.md)).
- **En curso:** —
- **Bloqueado por:** nada para empezar. Para imitar desplazamientos hace falta la trayectoria de la pelvis en `PoseClip` (pregunta abierta para Juan).
- **Sigue:** Render para el servidor de video cuando `data/` tenga uno; entorno de entrenamiento con `scene_mjx.xml` (Python, MuJoCo 3.16.0) y una primera política que se sostenga de pie, con checkpoints desde el paso 0; retargeting de `PoseClip` a `RobotMotion`, empezando por un clip sintético.

---

## Juan: extracción de datos (`data/`)

Cámara en vivo y videos subidos → elegir y seguir al sujeto → `PoseClip` limpio.

- **Funciona:** `python -m data.extract <video|zip> [--click x,y]` saca el `PoseClip` (JSON + `.npz`) de un sujeto entre varias personas; `data.overlay` lo comprueba sobre el video. Precargadas `caminar-perfil` y `correr-perfil` en `data/clips/`. Uso y límites en [`../data/README.md`](../data/README.md). Cámara en vivo en el navegador: `createLiveCapture` en [`../data/live/`](../data/live/README.md), mismo `PoseClip`, 30 fps. Espejo propio `juanevillam/tridi-data`.
- **En curso:** —
- **Bloqueado por:** —
- **Sigue:** servidor de videos subidos (FastAPI en la Mac de Juan + túnel) para W5/W6 de César. Grabar precargadas propias de perfil. Límite clave: de frente el avance sale ≈ 0, hay que grabar de perfil.

---

## César: experiencia de usuario de la simulación (`web/`)

App web: captura, subida, galería de precargadas, vista de la simulación y progreso. Nunca una pantalla de carga vacía.

- **Funciona:** plan de subtareas en [`../web/TAREAS.md`](../web/TAREAS.md) (M0 a M7).
- **En curso:** —
- **Bloqueado por:** nada para empezar (se trabaja con datos falsos). Para integrar: interfaz del visor (Pastor) y servidor de subida (ver preguntas abiertas).
- **Sigue:** M0 a M2 (proyecto, deploy temprano, galería de precargadas con datos falsos).

---

## Ale: estrategia, pitch y guion (`docs/`)

Pitch, README, diferencia con lo que ya existe, video para el voto público.

- **Funciona:** investigación de competencia cerrada y escrita en [`pitch/diferencia.md`](pitch/diferencia.md); borrador 1 del guion de 3 minutos en [`pitch/guion-3-minutos.md`](pitch/guion-3-minutos.md), con el banco de preguntas del jurado.
- **En curso:** cronometrar el guion y decidir quién presenta.
- **Bloqueado por:** el bloque más fuerte del pitch (la escalera del aprendizaje) necesita **checkpoints intermedios guardados** del entrenamiento (0, 1k, 10k, 100k pasos). Sin eso hay que reescribir el guion.
- **Sigue:** plan B grabado el sábado en la noche (video de 40 s de la demo, sirve también para el voto público); `README.md` y los archivos de entrega cuando haya deploy.
