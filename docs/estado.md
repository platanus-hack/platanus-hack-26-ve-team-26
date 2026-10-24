# Estado

Dónde está cada parte **ahora**. Es lo primero que lee un agente al empezar. Cada uno actualiza solo su sección, al cerrar una sesión o cuando algo cambia (para que dos personas no editen las mismas líneas). El detalle de cada sesión está en [`bitacora/`](bitacora).

**Track:** 🧊 Three-Dimensional · **Idea:** Tridi: de video humano a un robot simulado que aprende a moverse solo ([decisión](decisiones/2026-10-23-idea-tridi.md)) · **Cierre de repos:** domingo 25, 08:30

---

## Pastor: motor de física y render (`physics/`)

Escena MuJoCo, modelo del robot, retargeting de `PoseClip` a `RobotMotion`, render three.js.

- **Funciona:** —
- **En curso:** —
- **Bloqueado por:** —
- **Sigue:** —

---

## Juan: extracción de datos (`data/`)

Cámara en vivo y videos subidos → elegir y seguir al sujeto → `PoseClip` limpio.

- **Funciona:** flujo de ramas, commits y bitácora del equipo. Idea, roles y contrato en borrador.
- **En curso:** —
- **Bloqueado por:** —
- **Sigue:** —

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
