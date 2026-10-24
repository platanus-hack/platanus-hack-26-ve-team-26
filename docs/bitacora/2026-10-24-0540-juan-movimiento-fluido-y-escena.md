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

## Parte 3: la landing (pedido de Juan)

Seis quejas: el robot siempre se tambalea (y se ve bugueado "en el giro"), la mano lejana desaparece en Capture, las etapas del Gym no van con el scroll, el plano de Policy tiembla en círculo, "Sube un video" está apagado y la navbar se pierde sobre el texto.

### Qué se encontró (diagnóstico en paralelo, medido en el navegador, en Node y en Python)

- **El tambaleo es real y es la política:** `g1-stand` (v2, 40 M) no se queda quieta. Gira sobre el pie derecho a ~57°/s (una vuelta cada 6 s) golpeteando con el izquierdo, y la pelvis traza un círculo de ~45 cm. El premio de `training/env.py` no castiga girar. Lo mismo en el navegador, en Node y en el entorno de Python, así que no es un error del puerto a la web.
- **La cámara lo amplificaba:** `viewer.follow()` pega la cámara a la pelvis cada cuadro, y la calle se deslizaba con cada paso. En el plano de Policy (piernas a 1,6 m) eso era el "círculo".
- **El "giro":** al entrar a Capture la cámara orbitaba 166°. El robot giraba 90° de golpe (la caminata mira a +y) y saltaba 1,9 m (`view.seek` con el video donde se había pausado). Al pasar del Gym a Policy se reiniciaba el robot.
- **La mano:** el esqueleto escondía los puntos con visibilidad < 0,5 (el codo izquierdo nunca llega). Los dos paneles 3D miraban desde el lado tapado. El brazo del robot quedaba congelado; Pastor lo arregló en paralelo (`24131af`: el brazo tapado copia al visible en fase opuesta).
- **Gym:** el capítulo medía una pantalla, igual que su panel fijo, así que nunca se fijaba; las etapas iban con su propio reloj (decisión de César en `9a4a944` porque el scroll se sentía trabado).
- **Navbar:** sin fondo; el texto del cierre pasa por debajo con el mismo color (contraste 1:1).
- **Servidor de videos:** no estaba corriendo (ni `data.server` ni `cloudflared`); la web lo ve apagado. Juan pidió no prenderlo por ahora.

### Qué se hizo

- `physics/src/viewer.js` (commit aparte, opcional): `followTau`, la cámara se acerca a la pelvis con suavidad y corta cuando la pelvis salta más de 0,3 m en un cuadro (un reinicio, un clip que vuelve a empezar). Por defecto 0, como hoy en las otras pantallas. Revisado por un segundo agente: `npm run check` 116 ok, y con 0 da exactamente lo mismo que antes.
- `web/src/screens/home.js`, `landing.css`, `skeleton.js`:
  - Cada plano dice qué tan rápido lo sigue la cámara.
  - Policy muestra el robot entero, desde un poco arriba.
  - Capture: la caminata empieza en el cuadro 0 con el video, girada para mirar a +x como el robot de pie. Se ve desde el lado que filmó el celular, y el robot y el esqueleto caminan hacia la derecha como el video.
  - El esqueleto dibuja tenue el brazo estimado en vez de esconderlo.
  - Del Gym a Policy no se reinicia el robot.
  - El Gym mide 4 pantallas, una etapa por pantalla. Un ruedazo se frena en cada etapa hasta que el robot la muestra (la caída o el primer empujón, a los 2 s; máximo 2,5 s).
  - La navbar pasa a vidrio oscuro con línea fina después del hero.
- Probado en el navegador: tres ruedazos de 10 pasos se frenan en "No sirve", el robot se cae a 1,2 s y el siguiente gesto pasa a "Más o menos". La navbar sale sólida sobre el cierre y transparente arriba. Capture camina a la derecha de perfil, Policy muestra el robot entero. A 375 px no hay scroll lateral. `vite build` ok.

### Qué no funcionó

- **`stand-v3`** (giro sumado al término "still", 10 M pasos desde v2, 16 min): sigue girando a −52°/s y se desplaza más (1 m contra 0,36 m). No se usa.
- Nuestro brazo "estimado" (seguir la estimación de MediaPipe en vez de inventarlo) quedó descartado: Pastor shipeó su versión en `physics/` mientras tanto.

### Sigue

- **`stand-v4`** entrenando en `../tridi-training` (rama `juan/training`): término propio para el giro (0,2; a 14°/s pierde la mitad) y otro para los pies quietos (0,1), 12 M pasos desde v2. Se acepta solo si gira menos de 5°/s y aguanta 4 de 4 empujones de 250 N; si no, se queda v2.
- **Avisar a César:** el Gym vuelve a ir con el scroll (deshace `9a4a944`, con freno para que no se sienta trabado) y `skeleton.js` atenúa los brazos en vez de esconderlos (también en la galería).
- **Avisar a Pastor:** `viewer.followTau` (opcional). La política de pie gira, y el entrenamiento `stand-v4` está en curso.

## Parte 4: la entrega (panel `#/entrega`)

Pedido de Juan: al terminar la demo, un panel donde se vea, se explore y se descargue lo que generó el entrenamiento. Es la prioridad #1 del análisis de pitch: pone "qué se entrega" frente al jurado.

### Qué se hizo

- Contrato (`0f47b73`, `c9a377f`, `96cd5a7`): sección "La entrega de un clip": `delivery.json` (resumen por mundo y por episodio, escalera de checkpoints, archivos con su peso), `replay.json` (cada episodio a 25 Hz, siempre con su última fila, fuerza de los pies como pico de cada tramo) y `GET /deliveries/{clip_id}/{nombre}`.
- `training/deliver.py`: arma la carpeta. `data/deliveries/clip_2026-10-23_caminar-perfil_01/` es la entrega real de la caminata (2,4 MB, estática: va en el deploy y no depende de la Mac).
- `data/server.py`: la cola de entrenamiento arma la entrega después del rollout; si falla, el entrenamiento queda `done` con nota. Solo sirve los nombres del contrato y nada hasta que exista `delivery.json`. `check_training` lo prueba.
- `web/src/screens/delivery.js` (+ `.css`): repetición 3D del episodio elegido tal cual se grabó (`sim.puppet`, porque `playClip` apoyaría en el piso al robot caído), matriz 4 mundos × 8 episodios, 5 canales de telemetría sincronizados, escalera de checkpoints, descargas y guía de formatos. Tarjeta "La entrega" en el cierre de la landing; el texto de Policy ya dice lo que se entrega hoy.
- Revisión por agentes: números recalculados desde `dataset.zip` (coinciden), endpoint probado contra rutas raras (404), prueba en navegador a 1440×900, 1280×720 y 375×812. 29 hallazgos, todos cerrados.
- `training/watch.py`: monitor en vivo de un entrenamiento (`progress.csv`); redibuja la pantalla entera.

### Qué dicen los datos de la caminata (`g1-walk`, 20 M pasos)

| Mundo | Completos | De pie (media) |
| --- | --- | --- |
| Plano | 0/8 | 4,1 s |
| Piedras | 0/8 | 3,0 s |
| Resbaloso | 0/8 | 1,6 s |
| Viento | 0/8 | 0,8 s |

Sigue 3,54 s de 11,85 s. 24 de 32 episodios terminan por alejarse del recorrido, 8 por caída. Solo entrenó en piso plano. El panel lo muestra tal cual.

### Política de pie: intentos de quitarle el giro

| Corrida | Qué | Giro | Equilibrio |
| --- | --- | --- | --- |
| `g1-stand` (v2, 40 M) | la de hoy | −57°/s | 20 s, 4/4 empujones |
| `stand-v3` (+10 M desde v2) | giro sumado a "still" (0,1) | −52°/s | — |
| `stand-v4` (+12 M desde v2) | término "turn" 0,2 + "feet" 0,1 | −25°/s | — |
| `stand-v5` (30 M desde cero, mismo premio) | | −0,9°/s | 4,6 s, 0/4 |
| `stand-v6` (+16 M desde v5, detenida) | | | ~5 s, sin mejorar |

Conclusión: afinar desde v2 hereda el giro; desde cero con el premio nuevo no aprende a equilibrarse en 46 M pasos. Queda `g1-stand`. Sigue un análisis aparte.
