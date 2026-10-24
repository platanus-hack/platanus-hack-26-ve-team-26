# Contrato entre las partes

Lo que une el trabajo de cada uno: formato de mensajes, tipos y esquema de los datos. Se define el viernes en los primeros 15 minutos.

Cada cambio aquí es su propio commit y se entrega con `scripts/ship.sh` antes del código que lo usa. Avisar en el grupo.

## Estado: vigente

Propuesto por Juan el 2026-10-23 y en uso desde entonces.

**Entrenar cada video (Pastor, 2026-10-24; vigente desde la revisión de Juan el mismo día).** Lo que pide el [plan técnico](plan-producto.md): clips de la cámara al servidor, una cola de entrenamiento por clip, políticas de imitación, datos para entrenar robots y mundos. Las partes nuevas dicen *(2026-10-24)*. La revisión sumó `followed_s` y `duration_s` a `policy.json` (el servidor los lee de ahí para el progreso), `push_n` a los parámetros de cada episodio de los datos y el campo `why` de los mundos, y puso el ejemplo de mundo igual a `physics/worlds/piedras.json`.

## Flujo y dueños

```
cámara / .mp4 / .zip ──► data/ (Juan) ──PoseClip──► training/ ──policy.onnx──► web/ (César) + physics/ (Pastor)
                                                       ▲
                                    physics/ (Pastor): escena MuJoCo, robot, retargeting
```

Con el entrenamiento por video *(2026-10-24)*:

```
cámara ──PoseClip (POST /clips)───────────┐
.mp4 / .zip ──► extracción ──PoseClip─────┤
                                          ▼
                       POST /clips/{clip_id}/train ──► cola de entrenamiento (de a uno)
                                          │   retarget ─► training ─► data
                                          ▼
     RobotMotion · policy.onnx + policy.json (un checkpoint cada tanto) · datos (.zip)
                                          ▼
              web: el robot con su política, Empujar, mundos y descargas
```

## `PoseClip`: el movimiento de un sujeto

Lo produce `data/` (cámara en vivo o video subido). Lo consumen el retargeting, el entrenamiento y la web (para dibujar el esqueleto).

```jsonc
{
  "id": "clip_2026-10-24_pastor-corre_01",
  "source": "camera" | "upload",
  "source_file": "pastor-corre.mp4",      // null si viene de la cámara
  "fps": 30,
  "skeleton": "mediapipe33",               // 33 puntos de MediaPipe Pose, en su orden
  "units": "m",                            // metros, ejes del mundo: y arriba, z hacia la cámara
  "origin": "hips",                        // centro de las caderas del primer frame = (0, 0, 0)
  "subject": {
    "track_id": 3,                         // id del tracker en el video
    "selected_by": "auto" | "user"
  },
  "frames": [
    { "t": 0.0, "joints": [[x, y, z, visibility], ...] }   // 33 entradas
  ],
  "quality": { "valid_ratio": 0.94 }       // frames con el sujeto bien detectado / total
}
```

Para entrenar se guarda también como `.npz` con la misma información (`joints`: `[frames, 33, 4]`).

## `RobotMotion`: el clip pasado al robot

Lo produce el retargeting en `physics/`. Ángulos de cada articulación del robot (`qpos` de MuJoCo) por frame.

```jsonc
{
  "clip_id": "clip_2026-10-24_pastor-corre_01",
  "robot": "unitree_g1",                   // carpeta del modelo en physics/models/
  "fps": 30,
  "qpos": [[...], ...]                     // [frames, 36]
}
```

Se genera con `cd physics && npm run retarget -- ../data/clips/<clip>.json` y queda en [`physics/motions/<clip_id>.json`](../physics/motions). Los de los clips precargados están versionados ahí: son lo que imita `training/` y lo que la web reproduce junto a la persona.

*(2026-10-24)* `npm run retarget -- <clip>.json --out <carpeta>` lo escribe en otra carpeta (ya existe): el servidor guarda ahí los `RobotMotion` de los clips de usuarios, para no tocar `physics/motions/`, que está versionada.

`training/` no imita el `RobotMotion` tal cual: `imitate.Motion` lo limpia para el modelo de entrenamiento (suaviza, apoya un pie en el piso cuadro a cuadro con las esferas de sus pies y saca de ahí los objetivos de los pies). Quien corra una política de imitación fuera de Python tiene que repetir esa limpieza.

Cada fila de `qpos` sigue el orden de MuJoCo para el G1: posición de la pelvis en metros (`x, y, z`, con z hacia arriba), su orientación como cuaternión (`w, x, y, z`) y los ángulos de las 29 articulaciones en radianes, en el orden en que aparecen en `g1_mjx.xml` (de la pierna izquierda a la muñeca derecha). La pelvis sigue el recorrido de la persona (sus caderas, con z hacia arriba y el origen en la primera posición) **escalado por el largo de pierna del G1 sobre el de la persona** (unos ×0,83: las piernas del robot son más cortas, y sin escalar los pies patinarían), y mira hacia donde avanza; si la persona está quieta, hacia donde apuntan sus caderas. Los pies quedan sobre el piso (z de la pelvis ajustada).

## `Policy`: el modelo entrenado

Lo produce `training/`. Lo corre la web con onnxruntime-web junto a MuJoCo WASM.

- `policy.onnx`: entrada = observación del robot (`[obs_dim]`), salida = acción (`[nu]`, objetivos de los motores).
- `policy.json`: `{ "id", "robot", "mjcf", "obs_dim", "nu", "trained_on": [clip_ids], "steps", "created_at" }`.
- `mjcf` es la escena con que se entrenó, relativa a `physics/models/` (por ejemplo `"unitree_g1/scene_mjx.xml"`). Una política solo funciona sobre ese modelo, así que la web carga esa escena antes de correrla.

*(2026-10-24)* Hay dos tipos de política, y `policy.json` suma campos para distinguirlas:

| Campo | Qué es | Hoy |
| --- | --- | --- |
| `task` | `"stand"` (de pie, aguanta empujones) o `"mimic"` (imita un `RobotMotion`; en `training.ppo` es `--task mimic`, o su nombre viejo `walk`) | Lo escribe `training/export.py`. En políticas viejas sin el campo, `obs_dim` las distingue: 93 es `stand`, otro valor es `mimic` |
| `motion` | El `clip_id` del `RobotMotion` que imita (solo `mimic`) | Lo escribe `training/export.py` |
| `lookahead_s` | Qué tan adelante muestra la observación la referencia, en segundos (solo `mimic`) | Lo escribe `training/export.py`: `[0.1, 0.25]` |
| `worlds` | Los ids de los mundos con que se entrenó (ver "Mundos") | Lo escribe `training/export.py`. `["plano"]` hasta que la imitación sortee mundos (ENT-3) |
| `followed_s`, `duration_s` | Cuántos segundos del clip sigue este checkpoint desde el principio, sin caerse ni alejarse más de 0,6 m del recorrido, en el mundo plano y sin ruido (como `training/evaluate_walk.py`), y cuánto dura el clip (solo `mimic`) | Lo escribe `training/export.py` al exportar cada checkpoint |

La observación de cada tipo, número por número:

- `stand` (93): la tabla de [`training/README.md`](../training/README.md).
- `mimic` (190): los 93 de `stand`; los ángulos de la referencia a 20 ms menos la pose de pie (29); la velocidad de la pelvis de la referencia en el marco de la pelvis (3); la altura de la pelvis de la referencia menos la actual (1); y por cada valor de `lookahead_s`, los ángulos de la referencia en ese instante menos la pose de pie (29) y la posición de su pelvis menos la actual, en el marco de la pelvis (3). El detalle está en `MimicEnv.observe()` de `training/imitate.py`. La salida ya trae sumada la pose de referencia: se escribe tal cual en `data.ctrl`.

## API del servidor de video (`data/server.py`)

Lo corre `data/` (Juan); lo llama la web para subir videos (W5) y seguir el progreso (W6). JSON salvo donde se indica. La URL base la configura la web (cambia según dónde corra el servidor).

**Subida por partes.** Un archivo (`.mp4`, `.mov`, `.m4v`, `.webm` o un `.zip` de esos) se parte en pedazos de `chunk_size` bytes; el último puede ser más corto. Si un pedazo falla se reenvía el mismo: reenviar pisa, no duplica.

**Qué se guarda.** Solo los `PoseClip`: son los datos que sirven para entrenar. Los videos se borran en cuanto dejan de hacer falta: al fallar o cancelar, en el acto; al terminar bien, a los 10 minutos (el tiempo para elegir otra persona). Una subida abandonada se borra a la hora. Topes: **60 MB por subida** (`413`) y **30 s por video** (el video queda `failed` con el motivo).

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /uploads` | `{ "filename": "pastor-corre.mp4", "size": 52428800 }` | `201 { "upload_id", "chunk_size", "total_chunks" }` |
| `PUT /uploads/{upload_id}/chunks/{index}` | bytes del pedazo (`application/octet-stream`), `index` desde 0 | `{ "received": [0, 1, 2], "total_chunks" }` |
| `GET /uploads/{upload_id}` | | `{ "received": [...], "total_chunks" }`, para retomar una subida cortada |
| `POST /uploads/{upload_id}/complete` | | `202 { "job_id" }`: arma el archivo y lo pone en la cola |
| `DELETE /uploads/{upload_id}` | | `204`: cancela la subida y borra lo recibido |

**Progreso.** La web consulta `GET /jobs/{job_id}` cada ~0,5 s:

```jsonc
{
  "job_id": "…",
  "state": "queued" | "running" | "done" | "failed",
  "position": 0,                      // trabajos antes que este en la cola (0 = es el siguiente o ya corre)
  "videos": [                         // uno por video (un .zip trae varios)
    {
      "name": "pastor-corre.mp4",
      "stage": "waiting" | "tracking" | "pose3d" | "done" | "failed",
      "progress": 0.42,               // 0 a 1 dentro de la etapa
      "frame_size": [1280, 720],      // null hasta que empieza
      "first_frame": 12,              // primer cuadro con personas (el 0 puede estar vacío); null hasta que termina "tracking"
      "people": [                     // personas de ese cuadro, al terminar "tracking"
        { "track_id": 3, "box": [x0, y0, x1, y1], "selected": true }
      ],
      "clip_id": "clip_…",            // al terminar "pose3d"
      "valid_ratio": 0.94,
      "error": null                   // mensaje en español si "failed"
    }
  ]
}
```

Las etapas de la web (W6.1) se mapean así: subiendo (la web) → detectando personas (`tracking`) → pose 3D (`pose3d`) → retargeting y entrenamiento (en la cola de entrenamiento de abajo).

**Elegir otro sujeto (W5.3).**

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /jobs/{job_id}/videos/{n}/first-frame.jpg` | | el cuadro `first_frame`, en sus píxeles originales, para dibujar `people` encima |
| `POST /jobs/{job_id}/videos/{n}/subject` | `{ "x": 640, "y": 360 }`, píxeles del cuadro `first_frame` | `202`; el video vuelve a `pose3d` con esa persona (`selected_by: "user"`), sin repetir el tracking. `410` si ya pasaron los 10 minutos y el video se borró |

**Cancelar.** `DELETE /jobs/{job_id}` → `204`: saca el trabajo de la cola y borra sus videos (los clips ya hechos se quedan).

**Resultado.** `GET /clips/{clip_id}.json` devuelve el `PoseClip`. *(2026-10-24)* `GET /scenes/{clip_id}.json` devuelve su escena (ver "Escenas"). `GET /health` responde `{ "ok": true, "queue": 0 }`.

### Clips de la cámara y entrenamiento *(2026-10-24)*

**Mandar un clip de la cámara.** La cámara arma el `PoseClip` en el navegador (`source: "camera"`); para entrenarlo hay que mandarlo.

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /clips` | un `PoseClip` | `201 { "clip_id" }`. El servidor le pone su propio id (los ids nombran archivos: no se usa el del navegador). `400` si no sigue el esquema, `413` si pesa más de 5 MB, `422` con el motivo en español si dura más de 30 s o si `valid_ratio` es menor que 0,8 |

- 5 MB: un `PoseClip` de 30 s a 30 cuadros por segundo pesa ~0,9 MB (medido sobre los clips de `data/clips/`); el tope deja margen sin aceptar cualquier cosa.
- `valid_ratio` mínimo de 0,8: por debajo, el cuerpo no se vio en más de 1 cuadro de cada 5, y el robot imitaría los huecos. Vale también para los videos subidos antes de entrenarlos.

**Entrenar un clip.** Sirve para clips de la cámara y de videos subidos.

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /clips/{clip_id}/train` | | `202 { "train_id" }`. Si ese clip ya está en la cola o entrenado, devuelve el mismo `train_id` (no se entrena dos veces). `404` si el clip no existe, `409` si la cola está llena |
| `GET /train/{train_id}` | | el progreso (abajo). La web lo consulta cada ~2 s: un checkpoint tarda minutos |
| `DELETE /train/{train_id}` | | `204`: lo saca de la cola o lo corta. Los checkpoints ya exportados se quedan |

La cola entrena **de a uno** y admite **3** en espera: con unos 30 min cada uno, el último espera hora y media, y más que eso ya no es una demo. Cada entrenamiento corre `retarget → training → data`:

```jsonc
{
  "train_id": "…",
  "clip_id": "clip_…",
  "state": "queued" | "running" | "done" | "failed",
  "position": 0,                          // entrenamientos antes que este (0 = es el siguiente o ya corre)
  "stage": "retarget" | "training" | "data",
  "steps": 3000000, "total_steps": 20000000,
  "followed_s": 4.2, "duration_s": 11.8,  // cuánto del clip sigue el último checkpoint, desde el principio
  "checkpoints": [{ "steps": 3000000, "policy_id": "clip_…-step-3000000" }],
  "eta_s": 1500,                          // tiempo estimado hasta "done"
  "error": null                           // en español si "failed"
}
```

**Resultados.** Se guardan: son lo que entrega el producto. Los videos se siguen borrando como arriba.

| Método y ruta | Respuesta |
| --- | --- |
| `GET /motions/{clip_id}.json` | el `RobotMotion` del clip |
| `GET /policies/{policy_id}.onnx` y `.json` | cada checkpoint exportado, apenas existe. El último es la política final |
| `GET /datasets/{clip_id}.zip` | los datos para entrenar robots (abajo), al terminar la etapa `data` |

## Datos para entrenar robots *(2026-10-24)*

Lo produce `training/` (etapa `data`): la política final corrida en varios episodios por mundo, con la física. Es el movimiento de la persona corregido para que el robot lo pueda hacer, en condiciones distintas.

`datasets/<clip_id>.zip` trae:

- `meta.json`:

  ```jsonc
  {
    "clip_id": "clip_…",
    "policy_id": "clip_…-step-20000000",
    "robot": "unitree_g1",
    "mjcf": "unitree_g1/scene_mjx.xml",
    "hz": 50,                                  // una fila por decisión de la política (20 ms)
    "episodes": [                              // uno por episodio, en el orden de rollouts.npz
      { "world": "piedras",
        "params": { "friction": 0.9, "wind_mps": 0.0, "mass_scale": 1.04, "motor_scale": 0.93, "push_n": 210.0 },
        "fell": false, "seconds": 11.8 }      // push_n: fuerza máxima de los empujones al azar de ese episodio
    ]
  }
  ```

- `rollouts.npz`, todos los episodios uno detrás de otro (`N` filas en total):

  | Arreglo | Forma | Qué es |
  | --- | --- | --- |
  | `episode` | `[N]` | a qué episodio de `meta.json` pertenece cada fila |
  | `t` | `[N]` | segundos desde el inicio del episodio |
  | `qpos` | `[N, 36]` | la pose, como en `RobotMotion` |
  | `qvel` | `[N, 35]` | velocidades de MuJoCo |
  | `ctrl` | `[N, 29]` | objetivos de los motores que dio la política |
  | `foot_force` | `[N, 2, 3]` | fuerza de contacto del piso en cada pie (izquierdo, derecho), en el mundo, en N |
  | `pose_error` | `[N]` | error medio de los ángulos contra la referencia, en rad |
  | `pelvis_error` | `[N]` | distancia de la pelvis a la de la referencia, en m |

## La entrega de un clip *(propuesta de Juan, 2026-10-24)*

Lo que el cliente se lleva cuando termina el entrenamiento de un video, reunido en una carpeta para mostrarlo en un panel y descargarlo. Lo arma `training/deliver.py` a partir de la política final y del dataset (`training/rollout.py`), en la etapa `data` de la cola de entrenamiento y para las precargadas. Todas las rutas son **relativas a `delivery.json`**: la misma carpeta sirve como archivos estáticos (las precargadas, en `data/deliveries/<clip_id>/`, van en el deploy y no dependen del servidor) o desde el servidor.

`delivery.json`:

```jsonc
{
  "clip_id": "clip_2026-10-23_caminar-perfil_01",
  "title": "Caminar",                         // lo que dice el panel
  "created_at": "2026-10-24T12:00:00+00:00",
  "duration_s": 11.85,                        // lo que dura el clip
  "policy": {                                 // la política que se entrega (la final)
    "id": "g1-walk", "task": "mimic", "steps": 20000768,
    "followed_s": 3.54,                       // cuánto del clip sigue desde el principio, en el mundo plano y sin empujones
    "trained_worlds": ["plano"],
    "onnx": "policy.onnx", "json": "policy.json"
  },
  "checkpoints": [{ "steps": 3000000, "followed_s": 1.2 }],  // la escalera, si quedaron los checkpoints; si no, []
  "worlds": [                                 // un resumen por mundo, en el orden de la prueba
    { "id": "piedras", "title": "Piedras", "episodes": 8, "completed": 0,
      "seconds": { "mean": 3.1, "min": 2.2, "max": 4.4 },
      "params": { "friction": [0.8, 1.2], "wind_mps": [0, 0], "mass_scale": [0.95, 1.05], "motor_scale": [0.9, 1.1], "push_n": [0, 300] } }  // el rango sorteado
  ],
  "episodes": [                               // uno por episodio, en el orden de rollouts.npz
    { "world": "piedras", "params": { "friction": 0.93, "wind_mps": 0, "mass_scale": 1.02, "motor_scale": 0.97, "push_n": 210 },
      "fell": true, "seconds": 3.1,
      "pose_error": 0.21,                     // rad, media del episodio
      "pelvis_error": 0.48,                   // m, máximo del episodio
      "foot_force_peak": 1350 }               // N, la mayor fuerza vertical de un pie contra el piso
  ],
  "replay": "replay.json",                    // para verlo: abajo
  "files": [                                  // lo que se descarga, con su peso
    { "name": "policy.onnx", "bytes": 271360, "what": "La política: 190 números de entrada, 29 objetivos de motor" }
  ]
}
```

`replay.json`, para ver cada episodio sin bajar el dataset: el mismo `rollouts.npz` a 25 Hz (la mitad), redondeado a 0,1 mm y 0,001 rad.

```jsonc
{
  "hz": 25,
  "episodes": [
    { "qpos": [[...36]],                      // la pose, como en RobotMotion: se reproduce con view.playClip
      "foot_force": [[310.2, 0.0]],           // N, fuerza vertical de cada pie (izquierdo, derecho)
      "pose_error": [0.12],                   // rad
      "pelvis_error": [0.03] }                // m
  ]
}
```

`files` lista lo que hay en la carpeta para descargar: `policy.onnx`, `policy.json`, `dataset.zip` (el de "Datos para entrenar robots"), `motion.json` (el `RobotMotion`), `poseclip.json` (el `PoseClip`) y `scene.json` (la escena del video, si hay).

Servidor: `GET /deliveries/{clip_id}/delivery.json` y cada archivo de la carpeta en `GET /deliveries/{clip_id}/{nombre}` (solo esos nombres). La web abre el panel en `#/entrega/<clip_id>`: primero busca la entrega estática y, si no está, la pide al servidor.

## Mundos *(2026-10-24)*

Las condiciones en que el robot practica. Un archivo por mundo en `physics/worlds/<id>.json`, el mismo para el entrenamiento y la web: así lo que se ve es lo que se entrenó. El entrenamiento sortea cada valor dentro de su rango en cada episodio; la web muestra el valor del medio.

```jsonc
{
  "id": "piedras",
  "title": "Piedras",                          // lo que dice el selector de la web
  "scene": "unitree_g1/scene_mjx_stones.xml",  // relativa a physics/models/; el piso plano es scene_mjx.xml
  "friction": [0.8, 1.2],                      // fricción del piso (los pares de contacto pies-piso)
  "wind_mps": [0.0, 0.0],                      // viento horizontal sobre el torso, en dirección al azar
  "mass_scale": [0.95, 1.05],                  // multiplica la masa y la inercia de cada cuerpo
  "motor_scale": [0.9, 1.1],                   // multiplica kp, kv y el torque máximo de cada motor
  "push_n": [0.0, 300.0],                      // empujones, como en training/env.py
  "why": "Piedras de hasta 3 cm …"             // el porqué de los valores, para quien lea el archivo
}
```

Hay cuatro: `plano`, `piedras`, `resbaloso` y `viento`, en [`physics/worlds/`](../physics/worlds). El viento se vuelve fuerza con ½·ρ·Cd·A·v² (`physics/src/worlds.js`, ~30 N a 10 m/s); Python usa la misma fórmula.

## Escenas: lugares con muebles *(2026-10-24)*

Un lugar donde el robot comparte el piso con cosas: una cocina, un depósito, una vereda. Las precargadas están en [`physics/scenes/<id>.json`](../physics/scenes); `data/` produce una por clip a partir del video (`GET /scenes/{clip_id}.json`, con el mismo formato). Se combina con el mundo: una cocina con piso resbaloso.

```jsonc
{
  "id": "cocina",                       // para un video, su clip_id
  "title": "Cocina",                    // lo que dice el selector de la web
  "objects": [
    {
      "label": "mesada",                // qué es; la web le da un color por etiqueta
      "kind": "box" | "cylinder",
      "size": [0.6, 3.2, 0.9],          // m: ancho (x), largo (y) y alto (z); en un cilindro, x es el diámetro
      "pos": [-2.1, 1.6],               // m, el centro sobre el piso, con el origen del PoseClip (las caderas del primer cuadro, z arriba)
      "yaw": 0,                         // rad, giro sobre la vertical
      "movable": false,                 // true: suelto, se puede empujar y voltear
      "mass": 4,                        // kg, solo si es suelto (5 si falta)
      "confidence": 0.9                 // opcional, de la detección en el video
    }
  ],
  "why": "…"                            // el porqué de la distribución, para quien lea el archivo
}
```

**La escena de un video** *(propuesta de Juan, 2026-10-24)*. `data/` la saca del primer cuadro del clip, junto con el `PoseClip`, con el mismo formato y estos detalles:

- `id` es el `clip_id`; `title` es `"Lugar del video"`; `why` dice cómo se estimó.
- `floor: { "friction_hint": 0.6 | null }`: una pista para elegir el mundo, no una medida. Sale del tipo de lugar que sugieren los objetos: con heladera, horno, lavaplatos o inodoro (cocina o baño, piso de baldosa) es 0,6; si no hay pistas, `null` y se usa la fricción del mundo.
- **Ejes y escala de `pos`:** `pos = [z, x]` del `PoseClip` (x del robot = z del `PoseClip`, hacia la cámara; y del robot = x del `PoseClip`), en metros de la persona, sobre el piso. El `RobotMotion` escala el recorrido por el largo de pierna (×0,83). Para que el robot pase junto a los muebles donde pasó la persona, `physics/` multiplica `pos` (no `size`) por esa misma escala.
- `size` mide el ancho y el alto en la imagen; el fondo (la medida que no se ve) sale de un tamaño típico por tipo de objeto. `yaw` sigue el recorrido de la persona (la gente camina a lo largo de mesadas y paredes): el detector no ve hacia dónde mira un mueble.
- `movable` y `mass` salen del tipo: una silla o una maceta se empujan, una heladera no.
- `confidence` es la del detector, rebajada si el objeto está cortado por el borde de la imagen.
- Los objetos que caen sobre el recorrido de la persona se corren a lo largo del rayo de la cámara hasta dejarlo libre: por donde caminó no había nada sólido.
- Lista vacía si no se detectó nada, y siempre en los clips de la cámara (el servidor no recibe su video).

`GET /scenes/{clip_id}.json` la devuelve para cada clip que el servidor hizo (`404` si el clip no existe). Las de las precargadas están en [`data/scenes/<clip_id>.json`](../data/scenes).

`physics/src/scenes.js` lo vuelve geometría sólida de MuJoCo sobre la escena actual: cada objeto choca con todas las partes del robot (pares de contacto explícitos) y los sueltos también con el piso. Hoy se ven y se sienten en la web (`view.setScene`); el entrenamiento todavía no los usa (el robot no aprende a esquivarlos: es el plan).

## Simulaciones precargadas

Clips (y, cuando existan, políticas) ya hechos que la web muestra siempre, también mientras un video nuevo se procesa.

- **La lista** está en `web/src/preloaded.json`, en el orden de la galería; la primera se reproduce al abrir la página:

  ```jsonc
  [
    {
      "clip": "clip_2026-10-23_caminar-perfil_01",   // id del PoseClip, igual al nombre del archivo sin .json
      "title": "Caminar",                            // lo que dice la tarjeta
      "credit": "Video: Mixkit 4855, …"              // de dónde salió el video
    }
  ]
  ```

- **Los archivos** se quedan donde los deja su dueño: `data/clips/*.json` (Juan) y `web/clips/*.json` (sintéticos para pruebas). La web los empaqueta al compilar; no se copian.
- **Agregar uno:** dejar el `PoseClip` en `data/clips/` y sumar una entrada a la lista. Si la entrada nombra un clip que no existe, la web la salta y avisa en la consola.
- **Políticas:** cuando `training/` tenga la primera, cada entrada suma `"policy"` con el id de su `policy.json`. *(2026-10-24)* Para una precargada es su política de imitación (`task: "mimic"`), salida del mismo flujo que un video de usuario.
