# data/: de video a `PoseClip`

Video (o `.zip` de videos) → se elige y se sigue a un sujeto → su pose 3D por frame → `PoseClip` como dice [`../docs/contrato.md`](../docs/contrato.md). Dueño: Juan.

La cámara en vivo (el mismo `PoseClip`, en el navegador) está en [`live/`](live).

**Espejo para deploy:** [`juanevillam/tridi-data`](https://github.com/juanevillam/tridi-data) copia `main` del repo del equipo; no se commitea ahí. Tras cada ship: `ALLOW_MAIN_PUSH=1 git push mirror origin/main:main` (el remoto `mirror` apunta a ese repo; la variable salta el hook que bloquea pushes a `main`, que aquí no aplica porque se copia `main` tal cual). Hoy no se despliega nada desde ahí: el servidor de videos va a correr en la Mac de Juan con un túnel.

## Uso

Requiere [uv](https://docs.astral.sh/uv/) (`brew install uv`). La primera corrida instala Python 3.12 y las dependencias, y baja los modelos a `data/models/` (no se versionan).

```bash
# Desde la raíz del repo
uv run --project data python -m data.extract video.mp4                 # sujeto automático
uv run --project data python -m data.extract video.mp4 --click 640,360 # la persona en ese punto del primer frame
uv run --project data python -m data.extract videos.zip                # lote: uno por uno, un video roto no tumba el lote
uv run --project data python -m data.overlay data/clips/<clip>.npz video.mp4  # dibuja al sujeto sobre el video
uv run --project data python -m data.extract video.mp4 --id clip_2026-10-23_caminar-perfil_01  # regenera una precargada con su mismo id
uv run --project data python -m data.jitter data/clips/*.json                  # cuánto tiembla cada clip
uv run --project data python -m data.check_scene                              # la geometría de la escena, sin video
```

Sale `data/clips/<id>.json` (el `PoseClip`), `data/scenes/<id>.json` (el [lugar del video](#escena-del-video)) y `<id>.npz` con lo mismo para entrenar: `joints [F, 33, 4]`, `t [F]` y `meta` (el JSON sin los frames). El `.npz` lleva además `valid [F]` (frames detectados, no interpolados), `frame_index`, `joints2d` y `boxes` (para el overlay y para dibujar sobre el video en la web).

## Servidor para la web

La web sube videos al servidor ([`server.py`](server.py)), que los procesa en cola con lo mismo que el CLI y reporta el progreso por etapas. La API está en el [contrato](../docs/contrato.md#api-del-servidor-de-video-dataserverpy); el cliente JS para la web es `uploadVideo`, `watchJob` y `chooseSubject` de [`live/`](live/README.md).

```bash
data/serve.sh             # servidor en la Mac + túnel; imprime y copia el link de la web con ?api=<túnel>
uv run --project data python -m data.server              # solo el servidor, en http://127.0.0.1:8000
uv run --project data python -m data.check_server video1.mp4 video2.mp4  # prueba de punta a punta
uv run --project data python -m data.check_training  # clips de la cámara y cola de entrenamiento, con la cadena real (~20 s)
```

- **Dónde corre:** en la Mac de Juan (MPS: ~40 s por video de 10 s) con un túnel rápido de Cloudflare (`brew install cloudflared`). El túnel no pide cuenta, pero **su URL cambia cada vez que arranca**: por eso la web la lee de `?api=` y `serve.sh` imprime el link listo. Antes de la demo: correr `data/serve.sh` y abrir ese link en la pantalla del stand. El mismo código corre en Render (lee `PORT`) si después hace falta, pero sin GPU es varias veces más lento.
- **Un video a la vez:** la cola tiene un solo trabajador, porque YOLO y MediaPipe ya ocupan toda la GPU.
- **Límites por estar en internet:** 60 MB por subida (`TRIDI_MAX_UPLOAD_MB`) y 30 s por video (`TRIDI_MAX_DURATION_S`), solo extensiones de video o `.zip`, ids aleatorios validados, y CORS solo para la web desplegada y los servidores de desarrollo (`TRIDI_CORS_ORIGINS`).
- **Solo se guardan los `PoseClip`:** el video se borra al fallar o cancelar, y a los 10 minutos de terminar (el tiempo para elegir a otra persona). Topes: 60 MB por subida y 30 s por video ([decisión](../docs/decisiones/2026-10-24-servidor-de-video-en-la-mac.md)).
- **Los trabajos viven en memoria:** si el servidor se reinicia, la web pierde el progreso de lo que estaba en cola. Los clips quedan en `data/server_data/clips/` (no se versiona).
- **Clips de la cámara y entrenamiento:** `POST /clips` recibe el `PoseClip` de la cámara (5 MB, 30 s y `valid_ratio` ≥ 0,8; el servidor le pone su propio id). `POST /clips/{clip_id}/train` lo pone en una **cola aparte** de la de videos: de a uno y 3 en espera (`TRIDI_TRAIN_WAITING`). Cada entrenamiento corre como subprocesos `node physics/scripts/retarget-clip.mjs --out` → `training.ppo --task mimic --motion` (exporta cada checkpoint a ONNX al guardarlo, cada `TRIDI_TRAIN_EVERY` pasos) → `training.rollout`, con logs en `server_data/train/<train_id>/`. El progreso sale de `progress.csv` y de los `.json` exportados (`followed_s`). Resultados en `server_data/motions/`, `policies/` y `datasets/`, servidos por los `GET` del contrato. `TRIDI_TRAIN_STEPS` (20 M por defecto, ~30 min en una M2) baja el presupuesto para probar.

## Cómo funciona

| Paso | Archivo | Qué hace |
| --- | --- | --- |
| 1. Seguir a todos | [`track.py`](track.py) | YOLO11-pose + ByteTrack ([`bytetrack.yaml`](bytetrack.yaml)) da una caja, 17 puntos y un id por persona en cada frame. |
| 2. Elegir al sujeto | [`track.py`](track.py) | Puntaje = altura de la caja × cercanía al centro × tiempo en pantalla. Con `--click`, la caja que contiene el punto en el primer frame. Si ByteTrack le cambia el id tras una oclusión, se empalma con el track nuevo que aparece cerca y del mismo tamaño. |
| 3. 3D | [`lift.py`](lift.py) | MediaPipe Pose Landmarker (heavy, world landmarks en metros) sobre un recorte cuadrado del sujeto. Un frame vale solo si MediaPipe coincide con los puntos de YOLO (si no, agarró a otra persona), el cuerpo es visible y no está "volteado" respecto a sus vecinos. Los frames malos se interpolan y quedan con visibilidad 0. |
| 3b. Suavizado | [`smooth.py`](smooth.py) | Savitzky-Golay en el tiempo sobre los 33 puntos (ver [Suavizado temporal](#suavizado-temporal)). |
| 4. Trayectoria | [`lift.py`](lift.py) | MediaPipe da la pose centrada en las caderas, sin desplazamiento. Se reconstruye por dos vías: el pie de apoyo quieto en el suelo, y el ajuste de la pose 3D a la imagen. En cada eje del suelo gana la que más se movió (cada una falla viendo de menos). Al final, Savitzky-Golay de 0,6 s. |

Cada umbral tiene su porqué en un comentario junto a él.

## Suavizado temporal

MediaPipe estima cada cuadro por separado, así que cada punto tiembla unos centímetros de un cuadro al otro. En el robot se nota más: el retargeting apoya el pie más bajo en el piso cuadro a cuadro, y el temblor de los tobillos se vuelve temblor de la pelvis. Más puntos no sirven (MediaPipe da 33 fijos); lo que sirve es filtrar en el tiempo.

- **Video ([`smooth.py`](smooth.py), en [`lift.py`](lift.py)):** Savitzky-Golay, que ajusta un polinomio a cada ventana en vez de promediarla, así que respeta lo rápido pero real (el golpe del talón, el giro arriba del paso). Los 33 puntos van con una ventana de 0,4 s y orden 4. La trayectoria de las caderas va con 0,6 s y orden 2, y reemplaza el promedio móvil de 0,2 s que había. El porqué de cada número está junto a él.
- **Cámara en vivo ([`live/src/oneeuro.js`](live/src/oneeuro.js)):** en vivo no hay cuadros futuros, así que se usa un filtro causal, One Euro: un pasabajos cuyo corte sube con la velocidad de cada punto. Lo lento queda quieto y lo rápido sigue con ~1 cuadro de retraso (`minCutoff` 1,5 Hz, `beta` 1,0). Lo ven `mimic`, el dibujo y la grabación; `createLiveCapture(video, { smooth: false })` lo apaga. La trayectoria del clip grabado lleva el mismo Savitzky-Golay que el video.
- **Medirlo:** `uv run --project data python -m data.jitter data/clips/<clip>.json` da la velocidad y la aceleración cuadro a cuadro (p50/p95) de caderas, rodillas, tobillos y pelvis, más tres cosas que el filtro no debe cambiar: cuánto patina el pie de apoyo, cuánto se levantan los pies y cuánto avanza el cuerpo.

Antes → después en los clips precargados (aceleración p95 en m/s², del `PoseClip`; pelvis del `RobotMotion` que sale de `physics/scripts/retarget-clip.mjs`, sin tocar `physics/motions/`):

| Clip | Tobillos | Rodillas | Caderas | Pelvis del robot, altura: máx | Ángulos de las piernas del robot: aceleración p95 | `valid_ratio` |
| --- | --- | --- | --- | --- | --- | --- |
| `caminar-perfil` | 177 → 55 | 109 → 30 | 63 → 14 | 2,41 → 1,10 m/s | 161 → 93 rad/s² | 1,000 → 1,000 |
| `correr-perfil` | 383 → 108 | 176 → 62 | 107 → 59 | 2,96 → 1,45 m/s | 388 → 159 rad/s² | 0,967 → 0,967 |
| `jumping-jacks-nasm` | 52 → 21 | 37 → 15 | 18 → 12 | 0,47 → 0,43 m/s | 40 → 23 rad/s² | 1,000 → 1,000 |

Lo que no debía cambiar: el rango de la rodilla del robot queda igual (caminata 1,40 → 1,38 rad, carrera 1,65 → 1,75, jumping jacks 0,44 → 0,44). El pie de apoyo patina menos (caminata 1,09 → 0,87 m/s, carrera 3,43 → 3,18). La caminata avanza 9,0 m en vez de 8,4: con los pies menos ruidosos, ahora gana la trayectoria de los pies sobre la de la cámara (0,76 m/s).

- **En la cámara en vivo**, con la caminata de Mixkit 4855 como cámara en el navegador (modelo `full`, 30 fps), la aceleración de rodillas y tobillos baja de p95 84 a 43 y de p50 30 a 13 m/s². Sobre las detecciones de los tres clips, One Euro conserva el 94% del recorrido de los tobillos en la caminata (90% del offline en la carrera).
- **Cómo se eligieron los valores:** se guardaron las detecciones de MediaPipe de los tres videos y se barrieron ventanas y órdenes contra estas métricas. Con 0,3 s y orden 3 en los puntos se quita lo mismo, pero la carrera pierde más altura del pie. Una trayectoria con 0,8 s deja patinar el pie de apoyo, y el promedio de 0,2 s (lo de antes) deja ~5 veces más aceleración horizontal en la pelvis.

## Escena del video

Para que la simulación recree el lugar (una cocina, una oficina), [`scene.py`](scene.py) mira el primer cuadro del clip y ubica en el piso los objetos que importan para un robot. El formato está en el [contrato](../docs/contrato.md#escenas-lugares-con-muebles-2026-10-24), en el mismo formato que las escenas a mano de `physics/scenes/`.

- **Qué detecta:** YOLO11m (COCO) con confianza ≥ 0,35: silla, sofá, cama, mesa, inodoro, heladera, horno, lavaplatos (como la mesada que lo sostiene), banco, maceta, valija, hidrante, bicicleta, moto y auto. Quedan fuera las personas (se mueven) y lo que está apoyado sobre otro mueble (TV, microondas): su caja no toca el piso.
- **Dónde está:** sin modelo de profundidad. El piso es el plano bajo los pies de la persona, en el espacio de la cámara (el mismo ajuste que da la trayectoria). La vertical sale del cuerpo, sin la inclinación de la marcha. El objeto se apoya donde el rayo por la base de su caja toca ese piso. Ancho y alto se miden con los rayos de las esquinas; el fondo, que no se ve, es un tamaño típico por tipo. La escala son los pies de la persona.
- **Rumbo:** sigue el recorrido de la persona (la gente camina a lo largo de mesadas y paredes); quieta, los muebles miran a la cámara.
- **Por donde caminó no hay nada:** un objeto a menos de 0,35 m del recorrido de las caderas es un error de profundidad. Se corre a lo largo del rayo de la cámara hasta dejar el paso libre.
- **Fricción:** con heladera, horno, lavaplatos o inodoro, `friction_hint` 0,6 (baldosa); si no, `null`.
- **Dónde queda:** `data.extract` la escribe en `scenes/` junto a la carpeta de los clips (`data/clips` → `data/scenes`). El servidor la sirve en `GET /scenes/{clip_id}.json`; los clips de la cámara llevan una escena vacía (el servidor no recibe su video). Si algo falla, la escena sale vacía con el motivo en `why`: nunca tumba el clip.
- **Prueba:** `uv run --project data python -m data.check_scene` proyecta dos sillas con una cámara conocida a 1,5 m y exige encontrarlas: sale a 1 cm de donde está, con el alto a 5 cm. La que está sobre el recorrido se corre. Con videos reales: en `decelera_landscape` la cámara sale a 0,48 m (está sobre la arena) y la silla de playa 1,1 m detrás y 2,6 m a la izquierda de la persona; en `People-counting` (cámara de seguridad) la cámara sale a 3,8 m.
- **Límites:** un solo cuadro, así que lo que la persona tapa no aparece. El rumbo de cada mueble no se mide. Un objeto cortado por abajo no se ubica (su base está fuera de la imagen). Con la cámara muy alta y mirando hacia abajo (cámaras de seguridad), la caja de una maceta incluye las hojas: el ancho de las macetas se limita a 0,6 m.

## Límites conocidos

- **Graba de perfil.** De frente o de espaldas MediaPipe casi no ve la profundidad de los pies, y si la cámara además sigue a la persona, el avance sale ≈ 0. De perfil (cámara fija o paneando) el avance sale bien: 0.7 m/s caminando, 3.6 m/s trotando.
- **La distancia focal se supone** (65° en el lado largo, cámara 1x de teléfono). Con teleobjetivo (mucho video de stock) el avance hacia la cámara sale corto.
- **La escala de MediaPipe es aproximada**: los cuerpos salen ~10-20% más bajos de lo real.
- En la fase de vuelo de una carrera las caderas no suben (el apoyo se toma del pie más bajo).
- Videos en cámara lenta dan movimientos lentos: no hay forma de saberlo desde el archivo.
- El suavizado le quita algo de amplitud al tobillo en la carrera (24 cuadros/s, pasos de ~0,3 s): parte es ruido, pero los pies de la carrera ya se veían mal por la profundidad de MediaPipe.

## Clips precargados

En [`clips/`](clips), de videos de [Mixkit](https://mixkit.co) (licencia libre de Mixkit):

| Clip | Video | Calidad |
| --- | --- | --- |
| `clip_2026-10-23_caminar-perfil_01` | Mixkit 4855, Young man walking listening to music | 100% válido, 11.8 s, 0.71 m/s |
| `clip_2026-10-23_correr-perfil_01` | Mixkit 4831, View of a park while a girl runs across | 97% válido, 3.8 s, 2.6 m/s |
| `clip_2026-10-24_jumping-jacks-nasm_01` | YouTube [`uLVt6u15L98`](https://www.youtube.com/watch?v=uLVt6u15L98), NASM, How to do a Jumping Jack (segundos 0 a 5,2) | 100% válido, 5.2 s, en el lugar |

El de jumping jacks es el respaldo de ENT-1: un movimiento en el lugar, sin recorrido del que alejarse. Del video se usan solo los primeros 5,2 s (de pie y ~4 ciclos a velocidad real, 1,2 s por ciclo): de 5,3 a 8,3 s la cámara hace zoom y corta cabeza y pies, y un zoom cambia la escala del esqueleto 3D. En el repo queda solo el `PoseClip`, nunca el video. Los videos se bajan de YouTube con `yt-dlp --cookies-from-browser chrome -f "bv*[ext=mp4]/bv*"` (sin audio); desde la red del evento YouTube pide sesión, por eso las cookies.

Prueba de selección con varias personas: Mixkit 4519, Students walking in a university: 5 personas de espaldas, los 5 ids se mantienen todo el video y el sujeto automático es el del centro; con `--click` se sigue a otra.
