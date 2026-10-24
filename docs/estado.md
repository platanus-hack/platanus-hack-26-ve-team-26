# Estado

Dónde está cada parte **ahora**. Es lo primero que lee un agente al empezar. Cada uno actualiza solo su sección, al cerrar una sesión o cuando algo cambia (para que dos personas no editen las mismas líneas). El detalle de cada sesión está en [`bitacora/`](bitacora).

**Track:** 🧊 Three-Dimensional · **Idea:** Tridi: de video humano a un robot simulado que aprende a moverse solo ([decisión](decisiones/2026-10-23-idea-tridi.md)) · **Cierre de repos:** domingo 25, 08:30

---

## Pastor: física, render y entrenamiento (`physics/`, `training/`)

Escena MuJoCo, robot Unitree G1, retargeting de `PoseClip` a `RobotMotion`, render three.js; arranca `training/` ([decisión](decisiones/2026-10-23-robot-g1.md)).

- **Funciona:** el G1 en MuJoCo WASM dentro del navegador, con three.js, a tiempo real ([`physics/README.md`](../physics/README.md)). Sobre eso: `view.mimic(pose)` (copia a una persona desde la cámara), `view.playClip(motion)` (reproduce un `RobotMotion`, con el reloj de la web), `view.loadPolicy(onnx, json)` (una política de `training/`: se equilibra y se recupera de empujones; la v2 aguanta los 250 N del botón desde los cuatro lados) y `npm run retarget` (un `PoseClip` completo → `physics/motions/`, con recorrido y rumbo de la pelvis). `npm run check` prueba física, retargeting y política en Node. **Integrado en `web/`:** la pantalla de simulaciones muestra al robot repitiendo el clip junto al esqueleto, con la política cargada (Empujar y un selector de checkpoints). **Deploy:** https://tridi-alpha.vercel.app.
- **Imitación en el navegador (SIM-1, SIM-2):** `view.loadPolicy(onnx, json, { motion })` corre políticas de imitación con la misma observación que Python (`check-mimic`: 3e-8). También hechos SIM-4 (`retarget --out`), SIM-6 (cocina, depósito, vereda), SIM-7 (sin temblor) y el retargeting sin piernas cruzadas. Un robot caído queda quieto en vez de agitarse.
- **En curso: ENT-1, que la imitación haga el clip entero.** Lo único que separa la cadena armada de un producto que entrega algo útil. Seguimiento desde el inicio del clip (`followed_s`):
  - Caminata: `walk-v4` (20 M pasos sobre los 30 M de `walk-long`, con las referencias nuevas) sigue **3,5 s de 11,8** (antes 1,4 s), y 8 de 40 episodios llegan al final. Ya está en `training/policies/g1-walk` y en la web.
  - Jumping jacks: `jacks-v2` (desde cero, referencia nueva, 10 M pasos, 19 min) sigue **1,3 s de 5,2**. Los episodios desde instantes al azar duran 3,2 s y la curva sigue subiendo: más pasos deberían ayudar.
- **Escalera del aprendizaje:** hay checkpoints en 0, 10 k, 100 k, 1 M, 3 M y 10 M de `jacks-v2` (desde cero: 0,74 → 0,76 → 1,26 s) y de `walk-v4` (que no arranca de cero: parte de `walk-long`). La entrega de Caminar ya trae la de `walk-v4` y el [panel de entrega](https://tridi-alpha.vercel.app/#/entrega/clip_2026-10-23_caminar-perfil_01) la dibuja. Para el pitch conviene la de `jacks-v2`, que es la única desde cero; los checkpoints de `training/runs/` no se versionan.
- **Bloqueado por:** nada. Falta probar `mimic` con una webcam real.
- **Propuesta para el equipo:** [pitch del producto](pitch/pitch-producto.md) y su [plan técnico](plan-producto.md), con lo que falta por área. Falta que el equipo lo acepte y lo reparta.
- **Sigue:** punto de control de ENT-1 a las 12:00: si la caminata no pasa de ~4 s, apostar al movimiento en el lugar (`jacks-v2` con más pasos) o a un ciclo de paso de 2 a 3 s. Una entrega de jacks con su escalera desde cero. Después, ENT-3 (empujones y mundos en la imitación) y SIM-5 (robustez medida).

---

## Juan: extracción de datos (`data/`)

Cámara en vivo y videos subidos → elegir y seguir al sujeto → `PoseClip` limpio.

- **Funciona:** `python -m data.extract <video|zip> [--click x,y]` saca el `PoseClip` (JSON + `.npz`) de un sujeto entre varias personas; `data.overlay` lo comprueba sobre el video. Precargadas `caminar-perfil` y `correr-perfil` en `data/clips/`. Uso y límites en [`../data/README.md`](../data/README.md). Cámara en vivo en el navegador: `createLiveCapture` en [`../data/live/`](../data/live/README.md), mismo `PoseClip`, 30 fps. Espejo propio `juanevillam/tridi-data`. Servidor de videos (`data/server.py`, API en el contrato) con subida por partes, cola, progreso por etapas y elegir sujeto con un click; corre en la Mac con `data/serve.sh` (túnel de Cloudflare). Cliente JS `uploadVideo`/`watchJob` en `data/live`.
- **En curso:** `training/`: la primera política (`training/policies/g1-stand.onnx`) sostiene al G1 de pie y aguanta los 4 empujones de 250 N de la prueba (40 M pasos, ~73 min en una M2). Sigue: imitación con los `RobotMotion` de Pastor. Formato de la observación para la web en [`../training/README.md`](../training/README.md).
- **Bloqueado por:** —
- **Integración probada (24/10):** servidor + túnel: el clip sale en 25 s por internet. Los dos clips mueven al G1 con `mimic` (356/356 cuadros, 3,2 cm). La galería de César los muestra. Se arregló un salto de 6 m en `correr-perfil` (ajuste a la cámara atípico al entrar al cuadro). Detalle en la [bitácora](bitacora/2026-10-24-0010-juan-integracion.md).
- **Decidió:** la web es un producto para empresas de humanoides, con estilo corporativo propio ([decisión](decisiones/2026-10-24-marca-b2b-robotica.md), [guía de marca](marca.md)); César la aplica en M9.
- **Landing nueva (rama `juan/landing`, sin shippear):** marca "instrumento de laboratorio" (papel, tinta y naranja señal) y landing de 7 bloques con el pitch, donde toda la media es el G1 real, el esqueleto real y la curva de entrenamiento real ([decisión](decisiones/2026-10-24-marca-instrumento-de-laboratorio.md)). Falta que César la revise.
- **Cadena de entrenamiento (24/10, mañana):** contrato del entrenamiento por video vigente. ENT-4 (cada checkpoint a ONNX con `followed_s`), ENT-5 (`training/rollout.py`: datos en los 4 mundos) y SRV-1..3 (`POST /clips`, cola de entrenamiento de a uno con 3 en espera, `GET` de motions, policies y datasets) hechos y probados con `data/check_training.py` ([bitácora](bitacora/2026-10-24-0510-juan-cadena-entrenamiento.md)). Falta que la política camine (ENT-1, Pastor) para que lo entregado valga.
- **Movimiento fluido y escena (24/10, mañana, [bitácora](bitacora/2026-10-24-0540-juan-movimiento-fluido-y-escena.md)):** los 33 puntos se suavizan en el tiempo: Savitzky-Golay en video y One Euro en la cámara en vivo. La pelvis del robot en la caminata baja de 2,41 a 1,10 m/s de máximo en altura, con `valid_ratio` igual. Precargadas regeneradas. Escena del video: `data/scene.py` ubica en el piso los muebles del primer cuadro (`GET /scenes/{clip_id}.json`, contrato en "Escenas"). Falta una precargada de cocina u oficina: YouTube pide sesión desde esta Mac y Mixkit y Pexels no tienen una buena.
- **El teléfono como cámara (24/10, tarde, rama `juan/camara-telefono`, sin shippear, [bitácora](bitacora/2026-10-24-1814-juan-camara-telefono.md)):** en En vivo, "Usar el teléfono como cámara" muestra un QR; el iPhone abre `#/camara/<sesión>`, manda las poses por el servidor (`data/relay.py`, `POST /live`, contrato "El teléfono como cámara") y la Mac las reproduce con la misma interfaz que la webcam: el robot copia y Grabar guarda el mismo `PoseClip`. Probado el relay de punta a punta sin navegador (`npm run check-relay`: la caminata sintética llega a 1,20 m/s) y la pantalla de la Mac en Chromium sin cabeza (QR que se lee, sesión, cuadros, grabación, cierre). **Falta probar con un iPhone real y el túnel**; recién entonces shippear y actualizar la tabla del pitch.
- **Sigue:** César conecta `web/` con `resolveApiUrl` (la URL del servidor llega por `?api=`, que imprime `data/serve.sh`). Pastor: `playClip` con la trayectoria de la pelvis. Revisar por qué en vivo la velocidad sale 50% más alta que offline. Grabar precargadas propias de perfil. Límite clave: de frente el avance sale ≈ 0, hay que grabar de perfil.

---

## César: experiencia de usuario de la simulación (`web/`)

App web: captura, subida, galería de precargadas, vista de la simulación y progreso. Nunca una pantalla de carga vacía.

- **Funciona:** Cámara en vivo (el G1 copia con `mimic`; graba hasta 30 s y guarda el clip en la galería, WEB-1), Subir (subida por partes, etapas, elegir persona) y Simulaciones (clip + política + escalera + selector de mundos). Mundos de SIM-3 en `physics/` (`physics/worlds/`, `view.setWorld`, terreno de piedras, `check-worlds`). Un solo G1 para toda la web, listo en 6,6 s ([decisión](decisiones/2026-10-24-robot-unico-y-carga-al-abrir.md)). La landing la rehízo Juan ([decisión](decisiones/2026-10-24-marca-instrumento-de-laboratorio.md)); las dos slides de César quedaron reemplazadas.
- **En curso:** la landing y las pantallas de la app con el estilo nuevo (M12 en [`../web/TAREAS.md`](../web/TAREAS.md)).
- **Bloqueado por:** nada. El lector de mundos en Python lo hace Juan (ENT-3).
- **Sigue:** pasar En vivo, Subir y Simulaciones al estilo de la landing; mandar el clip de la cámara (`POST /clips`); WEB-2 y WEB-3, ya desbloqueadas.

---

## Ale: estrategia, pitch y guion (`docs/`)

Pitch, README, diferencia con lo que ya existe, video para el voto público.

- **Funciona:** investigación de competencia en [`pitch/diferencia.md`](pitch/diferencia.md); guion de 3 minutos cronometrado (borrador 4, alineado con [`marca.md`](marca.md): mismo titular y mismas 3 cifras) en [`pitch/guion-3-minutos.md`](pitch/guion-3-minutos.md), con hoja de cola y banco de preguntas; voto de referencias de estilo en la [decisión de marca](decisiones/2026-10-24-marca-b2b-robotica.md).
- **Funciona también:** el formato es **1 minuto de láminas + 2 min de video de demo** ([`pitch/guion-1-minuto.md`](pitch/guion-1-minuto.md), 26 s de habla medidos) y el deck de **7 láminas** con el branding y el copy de la web, en [`pitch/deck/`](pitch/deck) (HTML + PDF), generado desde los números del repo.
- **En curso:** el relato largo quedó en [`pitch/relato.md`](pitch/relato.md), verificado contra el repo (tres afirmaciones todavía no son ciertas: randomización, imitación medida y "cientos de condiciones"). Falta leer el guion en voz alta con reloj (está cronometrado sobre el papel: 143 s de habla + 29 s de pantalla, con `pitch/tools/cronometro.py`) y decidir quién presenta y quién maneja la pantalla.
- **Bloqueado por:** el bloque más fuerte del pitch (la escalera del aprendizaje) necesita **checkpoints intermedios guardados** del entrenamiento (0, 1k, 10k, 100k pasos). Sin eso hay que reescribir el guion.
- **Sigue:** **grabar el video de 2 minutos**, ahora de storytelling ([guion](pitch/guion-video-2-minutos.md): las 36 horas contadas por el robot) (es el centro de la presentación y sirve para el voto público); repartir quién narra cada tramo (video de 40 s de la demo, sirve también para el voto público); `README.md` y los archivos de entrega cuando haya deploy.
