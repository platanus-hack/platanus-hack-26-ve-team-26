---
persona: Juan
rama: juan/pipeline
sesion: 6501dd71-ba50-4750-a389-e56b3e374861
inicio: 2026-10-24 05:40
estado: en curso
---

# Movimiento fluido desde el origen y la escena del video

## Objetivo

Dos prioridades para la demo, en `data/`: (1) que el robot no tiemble, filtrando en el tiempo los 33 puntos de MediaPipe (offline y en vivo) y (2) ver el lugar del video: objetos que importan para un robot, en el piso respecto de la persona, como una "escena" por clip que Pastor convierte en geometría de MuJoCo.

## Qué se hizo

- `data/jitter.py`: mide un `PoseClip` (velocidad y aceleración cuadro a cuadro p50/p95 de caderas, rodillas, tobillos y pelvis; cuánto patina el pie de apoyo, cuánto se levantan los pies y cuánto avanza el cuerpo).
- `data/smooth.py` + `data/lift.py`: Savitzky-Golay en los 33 puntos (0,4 s, orden 4) antes de reconstruir la trayectoria desde los pies, y en la trayectoria (0,6 s, orden 2, en lugar del promedio móvil de 0,2 s). `lift.py` separa la detección del post-proceso (`assemble`) y pierde un par de funciones duplicadas (`_mirror`, `_facing_flips` estaban dos veces).
- `data/extract.py --id`: regenera una precargada con su mismo id.
- Los tres `PoseClip` de `data/clips/` regenerados desde sus videos (Mixkit 4855, 4831 y NASM).
- `data/live/src/oneeuro.js`: One Euro causal por punto, con el corte según la velocidad 3D de cada articulación (el mismo corte filtra su punto en la imagen). `createLiveCapture` lo aplica antes de `onPose` y de la grabación (`smooth: false` lo apaga). `poseclip.js` usa el mismo Savitzky-Golay que `lift.py` para la trayectoria. `npm run check` prueba los dos.
- Números en [`../../data/README.md`](../../data/README.md#suavizado-temporal).

## Qué funcionó

- Caminata: pelvis del robot (`RobotMotion`, retarget a una carpeta temporal) de 2,41 a 1,10 m/s de máximo en altura; aceleración p95 de los tobillos del `PoseClip` de 177 a 55 m/s²; ángulos de las piernas del robot de 161 a 93 rad/s² p95. Carrera: pelvis de 2,96 a 1,45 m/s. `valid_ratio` igual en los tres clips.
- Lo que no debía cambiar no cambió: el rango de la rodilla del robot queda igual y el pie de apoyo patina menos.
- En el navegador, con la caminata como cámara: aceleración p95 de rodillas y tobillos de 84 a 43 m/s², con ~1 cuadro de retraso.
- Para elegir los valores, se guardaron las detecciones de MediaPipe y se barrieron ventanas sin volver a correr el modelo. El barrido reproduce exacto los números de antes con el código viejo.

## Qué no funcionó

- Primera versión con el mismo Savitzky-Golay (0,4 s, orden 4) también en la trayectoria: la pelvis se movía más de costado que con el promedio de 0,2 s (pasa más frecuencia alta). La trayectoria necesita su propia ventana, más larga.
- Una ventana de 0,8 s en la trayectoria suaviza más pero deja patinar el pie de apoyo.
- Error de razonamiento corregido: en los puntos de MediaPipe (centrados en la cadera) el pie apoyado no está quieto, se mueve hacia atrás a la velocidad de la marcha. Lo que protege el contacto en Savitzky-Golay es que deja pasar intacto lo que se mueve a velocidad constante.

## Decisiones

- Savitzky-Golay offline (respeta lo rápido pero real, deja pasar intacto lo que va a velocidad constante); One Euro en vivo (causal, corte según la velocidad). El porqué de cada número está junto a él.

## Sigue

- **Pastor:** `cd physics && npm run retarget -- ../data/clips/<clip>.json` para los tres clips y `npm run check`. En jumping jacks el retarget dice 94% al alcance (antes 98%).
- Parte 2: la escena del video (contrato primero).

## Parte 2: la escena del video

### Qué se hizo

- Shipeado el suavizado (`56f8350`). Pastor había shipeado su propio filtro de pantalla en `physics/` (`f19c720`) y el formato de escenas (SIM-6, `352a1cc`) mientras tanto.
- Contrato (`d8d7107`, shipeado aparte): sobre el formato de escenas de Pastor, sin cambiarlo, se suma lo de un video. `floor.friction_hint`; `pos = [z, x]` del `PoseClip` en metros de la persona; `physics/` multiplica `pos` (no `size`) por la escala del recorrido (×0,83) para que el robot pase junto a los muebles donde pasó la persona. También `GET /scenes/{clip_id}.json`.
- `data/scene.py`: YOLO11m en el primer cuadro, piso bajo los pies de la persona en el espacio de la cámara, objetos ubicados por el rayo de la base de su caja, fondo típico por tipo, rumbo según el recorrido y objetos corridos fuera del recorrido. `lift.py` guarda los puntos en el espacio de la cámara y la focal (`Lifted.camera_points`, `focal`).
- `data.extract` escribe la escena en `data/scenes/`. El servidor la genera junto al `PoseClip` y la sirve; los clips de la cámara llevan una vacía. `check_server` y `check_training` lo prueban; `data/check_scene.py` prueba la geometría con una cámara sintética.

### Qué funcionó

- Geometría sintética: silla a 1 cm de su lugar y alto a 5 cm; la silla sobre el recorrido se corre 15 cm.
- Videos reales: la altura de la cámara sale plausible (0,85 m en la caminata, 0,48 m sobre la arena en `decelera`, 3,8 m en la cámara de seguridad de `People-counting`), la silla de playa queda donde se ve y el auto a 40 m se descarta.
- El "inodoro" que YOLO ve en `People-counting` es un molinete: queda fuera por el umbral de 0,35.

### Qué no funcionó

- **No hay precargada de cocina u oficina todavía.** YouTube pide sesión desde esta red, y `yt-dlp --cookies-from-browser chrome` no puede leer el perfil de Chrome (permiso de macOS, ni dentro ni fuera del sandbox ni en la Terminal de la app). Mixkit tiene oficinas llenas de gente sentada, sin nadie caminando de perfil. Pexels solo tiene tomas de frente y sin muebles. El mejor candidato es YouTube `YS91BvCJFsM` ("Alone Man walking in Office", 28 s: un hombre cruza de perfil una oficina con escritorios).
- `check_server` con un `.mov` falla en "a done video stays for the 10-minute subject window" (`decelera_landscape.mov`). Ya fallaba en `main` antes de esta sesión (probado con `git stash`); con `.mp4` pasa todo. Queda pendiente.
- La caja de una maceta vista desde arriba incluye las hojas (salía de 1,4 m): el ancho de los cilindros se limita al de su base típica.

### Decisiones

- Sin modelo de profundidad: el piso bajo los pies ya da la escala en metros. Un modelo de profundidad agrega una descarga y segundos por video, y su escala igual habría que anclarla en la persona.
- El formato es el de Pastor (`id`, `title`, `movable`, `mass`, `why`); solo se sumó `floor`.

### Sigue

- **Juan:** bajar `YS91BvCJFsM` desde una terminal con acceso a Chrome (o grabar a alguien caminando de perfil frente a sillas y mesas en el evento), y dejarlo como precargada con `--id` y su escena en `data/scenes/`.
- **Pastor:** `cd physics && npm run retarget -- ../data/clips/<clip>.json` para los tres clips regenerados y `npm run check`. Cargar `GET /scenes/{clip_id}.json` (o `data/scenes/`) con `view.setScene`, multiplicando `pos` por la escala del recorrido.
