---
persona: Juan
rama: juan/data
sesion: 32e0dcb2-9db9-43bc-8c85-e727bde56451
inicio: 2026-10-23 23:00
estado: en curso
---

# data/: video → PoseClip, cámara en vivo y servidor de video

## Objetivo

CLI `python -m data.extract <video|zip> [--click x,y]` que sigue a un sujeto entre varias personas y saca su `PoseClip` (JSON + `.npz`) según el contrato, más 2 o 3 clips precargados.

## Qué se hizo

- Proyecto Python con uv en `data/` (Python 3.12: torch no tiene ruedas para el 3.15 de Homebrew).
- `track.py`: YOLO11s-pose + ByteTrack, puntaje tamaño × centro × tiempo, `--click`, empalme de ids tras oclusión.
- `lift.py`: MediaPipe Pose Landmarker heavy sobre recorte cuadrado; chequeo contra los puntos de YOLO; filtro de frames "volteados"; trayectoria de caderas; normalización al contrato.
- `extract.py`: CLI, `.zip` video por video con progreso y resumen; `overlay.py` dibuja al sujeto sobre el video.
- Precargadas en `data/clips/`: `caminar-perfil` (100% válido, 0.71 m/s) y `correr-perfil` (97%, 3.6 m/s). Uso y límites en [`../../data/README.md`](../../data/README.md).

## Qué funcionó

- Video de 5 estudiantes de espaldas (Mixkit 4519): los 5 ids de ByteTrack duran los 603 frames sin cambios; el automático elige al del centro; `--click 180,450` sigue a la de vestido verde. Comprobado con el overlay.
- `.zip` con un video cortado a 50 KB, un `.txt` y dos videos buenos: 2 clips, 1 falla con mensaje claro y el lote sigue.
- Caminata de perfil con gente al fondo: 100% de frames válidos, la gente del fondo no interfiere.

## Qué no funcionó

- Comparar MediaPipe con YOLO tal cual rechazaba el 65% de frames de la gente de espaldas: uno de los dos modelos cambia izquierda por derecha. Ahora el emparejamiento espejado también cuenta y un filtro aparte quita los frames donde el cuerpo mira al revés que sus vecinos (±0.5 s).
- Personas de espaldas con los pies fuera del cuadro: ~50% válido. Es correcto descartarlos (sin piernas no sirven para el robot).
- Trayectoria solo por ajuste a la cámara: con cámara que sigue a la persona el avance sale 0. Solo por pies: de frente sale 0 (MediaPipe casi no ve la profundidad de los pies). Se combinan por eje, quedándose con la que más se mueve. Aun así, correr de frente con cámara siguiendo sigue en ≈ 0: **hay que grabar de perfil**.
- El modo IMAGE de MediaPipe (detectar en cada frame en vez de seguir) no mejoró el caso de espaldas: 45% vs 44%. Se quedó VIDEO, que es más suave.

## Decisiones

- `.npz` lleva extras además de lo del contrato (`valid`, `frame_index`, `joints2d`, `boxes`): no cambian el contrato, solo agregan.
- Frames malos se interpolan y llevan visibilidad 0 en el JSON, en vez de cortar el clip.
- Para los clips nuestros (precargadas buenas y la demo): grabar de perfil, cámara fija o paneando, cuerpo entero en cuadro. César: vale la pena decirlo en la UI de subida.

## Fase 2: cámara en vivo (`data/live/`)

- Deploy: Pastor ya tenía el espejo `torpass/tridi`. Juan pidió uno propio: [`juanevillam/tridi-data`](https://github.com/juanevillam/tridi-data), con `main` copiado. Nada se despliega desde ahí por ahora; el servidor de videos va a correr en la Mac de Juan con un túnel. El hook `pre-push` bloquea cualquier push a `main`, también al espejo: se usa `ALLOW_MAIN_PUSH=1` (anotado en `data/README.md`).
- `data/live/`: paquete JS como `physics/` (Vite, sin framework). `createLiveCapture(video, opts)` para César, `buildPoseClip` (mismos pasos que `lift.py`, remuestreado a 30 fps), `drawSkeleton`, página demo y `npm run check`.
- Funcionó: `npm run check` (persona sintética a 1,2 m/s → 1,18 m/s, el cuadro espejado se descarta). En el navegador, con un video como cámara: 30 fps con el modelo `full`, 100% válidos, 1,0 m/s caminando. Con los mismos landmarks, JS da 0,77 m/s y Python 0,71: paridad.
- No funcionó al principio: 0,10 m/s en el navegador. Causa: saltar a otro punto del video cortaba el stream (10 muestras en 5 s), y la integración por pie apoyado pierde pasos con huecos. También el pane del navegador oculto pausa `requestAnimationFrame`. Se agregó `fps()` y la demo avisa bajo 20 fps.
- Límite: en vivo no hay tracker; con varias personas MediaPipe elige a cualquiera (en la prueba del grupo, al de la derecha).

## Servidor de video (`data/server.py`)

- API primero en el contrato (dos commits de contrato shipeados antes del código): subida por partes, `GET /jobs/{id}` con etapas `tracking` y `pose3d`, primer cuadro con personas y elegir otra con un click, `GET /clips/{id}.json`.
- FastAPI con un solo trabajador en cola (YOLO y MediaPipe ya ocupan la GPU). Al elegir otra persona se reusa el tracking: solo se repite la pose 3D (38 s en vez de ~60 s).
- `data/serve.sh`: servidor + túnel rápido de Cloudflare. Probado desde internet: `/health`, preflight CORS desde `tridi-alpha.vercel.app` y error en español. Se apagó después de probar.
- `data/check_server.py`: prueba de punta a punta con los modelos reales, `.zip` con 2 videos buenos, uno roto y un `.txt`, un pedazo reenviado, errores 400/404/409/413/415/416/422 y cambio de sujeto. Pasa.
- Cliente JS `data/live/src/upload.js` probado en Node contra el servidor local.
- Se arregló: el video de carrera no tiene a nadie en el cuadro 0, así que no había a quién hacer click. Ahora se elige en el primer cuadro con personas (`first_frame`), también en el CLI.
- Los mensajes de error del pipeline pasaron a español, porque la web los muestra tal cual.
- Ojo: la decisión de deploy de Pastor dice "servidor en Render"; Juan eligió su Mac con túnel por la GPU. El código sirve para los dos. Queda como pregunta abierta la URL fija.

## URL del servidor en la web

- Juan decidió: la web lee la URL de `?api=` y Juan arranca `data/serve.sh` antes de la demo. `resolveApiUrl` y `checkApi` en `data/live/src/api.js`; `serve.sh` imprime y copia `https://tridi-alpha.vercel.app/?api=<túnel>`.
- Probado en el navegador con un túnel real: el link da la URL, se recuerda al recargar sin el parámetro, `checkApi` da `true` por el túnel (CORS ok) y `false` con un servidor que no existe; `?api=javascript:…` se ignora. Todo apagado después.
- No se tocó `web/`: es de César; la llamada va en su W5.

## Espejo del deploy tras el ship de Ale

- El ship de Ale (`0d1ba20`) mergeó bien, pero `scripts/mirror.sh` falló: solo empujaba por SSH, y la clave SSH de Ale no está registrada en GitHub (su `origin` es HTTPS con `gh`). Su invitación a `Torpass/tridi` sí estaba aceptada.
- El espejo ya estaba al día: los ships siguientes de Juan lo resincronizaron (`Torpass/tridi` = `main` = `7ab3cbf`).
- Arreglo en `scripts/mirror.sh` (de Pastor, commit aparte): si SSH falla, empuja por HTTPS autenticando con `gh auth git-credential`, sin configurar nada. Probado: SSH sigue funcionando en la Mac de Juan; la vía HTTPS autentica con `gh`. No se pudo probar SSH roto de punta a punta en esta Mac porque aquí `origin` también es SSH.
- Ale: hacer `scripts/ship.sh` de su rama para llevar su bitácora pendiente (`1f692c4`).

## Investigación de los otros equipos (Ale)

- Juan pidió un prompt para que Ale estudie los 24 repos públicos de Caracas (`platanus-hack-26-ve-team-N`), con foco en Three-Dimensional, y lo guarde en `platanus-ideas`.
- Para que la investigación llegue a todos sin hacer `pull` a mano, `scripts/sync-main.sh` ahora también hace fast-forward de `../platanus-ideas` en cada prompt (solo si está en `main` y sin cambios locales). Probado: trae el commit nuevo y lo anuncia; sin novedades no dice nada.
- Error en la prueba: un `reset --hard` en `platanus-ideas` deshizo un borrado sin commitear de `campo/` que había en la Mac de Juan. No se perdió nada (todo está en git); Juan confirmó que el borrado no era a propósito, así que `campo/` queda como está.

## Mensajes al Discord del equipo

- `scripts/discord.py`: publica en el canal privado del equipo por un webhook y etiqueta solo a las personas nombradas (`scripts/discord.py pastor cesar < mensaje.txt`). El webhook y los ids de Discord viven en `~/.config/tridi/`, fuera del repo, porque el repo es público. Probado en seco: divide los mensajes de más de 2.000 caracteres y no deja pasar `@everyone`.

## Sigue

- Pastor: probar el retargeting con `data/clips/*.npz`.
- Grabar a Pastor/César caminando y corriendo de perfil con el teléfono (focal conocida) para precargadas propias.
- César: integrar `createLiveCapture` en W4 (ver `data/live/README.md`).
- César: W5/W6 con `uploadVideo` y `watchJob` (`data/live/README.md`).
- César: `resolveApiUrl`/`checkApi` al arrancar la web; si no hay servidor, solo galería.
- Juan: probar la demo de `data/live` con la webcam real; antes de la demo, `data/serve.sh`.
- Shipeado a `main` como `14045b3`. Al rebasear entró el G1 de Pastor; su pregunta de la traslación de la pelvis quedó respondida en [`../preguntas-abiertas.md`](../preguntas-abiertas.md): ya viene en el `PoseClip`. Ojo Pastor: el contrato usa y arriba, MuJoCo z arriba.
