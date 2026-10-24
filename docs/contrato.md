# Contrato entre las partes

Lo que une el trabajo de cada uno: formato de mensajes, tipos y esquema de los datos. Se define el viernes en los primeros 15 minutos.

Cada cambio aquí es su propio commit y se entrega con `scripts/ship.sh` antes del código que lo usa. Avisar en el grupo.

## Estado: propuesta (Juan, 2026-10-23)

Borrador para revisar entre los 4 antes de escribir código. Cuando se acepte, se crea el archivo de tipos y esta sección pasa a "vigente".

## Flujo y dueños

```
cámara / .mp4 / .zip ──► data/ (Juan) ──PoseClip──► training/ ──policy.onnx──► web/ (César) + physics/ (Pastor)
                                                       ▲
                                    physics/ (Pastor): escena MuJoCo, robot, retargeting
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

Cada fila de `qpos` sigue el orden de MuJoCo para el G1: posición de la pelvis en metros (`x, y, z`, con z hacia arriba), su orientación como cuaternión (`w, x, y, z`) y los ángulos de las 29 articulaciones en radianes, en el orden en que aparecen en `g1_mjx.xml` (de la pierna izquierda a la muñeca derecha).

## `Policy`: el modelo entrenado

Lo produce `training/`. Lo corre la web con onnxruntime-web junto a MuJoCo WASM.

- `policy.onnx`: entrada = observación del robot (`[obs_dim]`), salida = acción (`[nu]`, objetivos de los motores).
- `policy.json`: `{ "id", "robot", "mjcf", "obs_dim", "nu", "trained_on": [clip_ids], "steps", "created_at" }`.
- `mjcf` es la escena con que se entrenó, relativa a `physics/models/` (por ejemplo `"unitree_g1/scene_mjx.xml"`). Una política solo funciona sobre ese modelo, así que la web carga esa escena antes de correrla.

## API del servidor de video (`data/server.py`)

Lo corre `data/` (Juan); lo llama la web para subir videos (W5) y seguir el progreso (W6). JSON salvo donde se indica. La URL base la configura la web (cambia según dónde corra el servidor).

**Subida por partes.** Un archivo (`.mp4`, `.mov`, `.m4v`, `.webm` o un `.zip` de esos) se parte en pedazos de `chunk_size` bytes; el último puede ser más corto. Si un pedazo falla se reenvía el mismo: reenviar pisa, no duplica.

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /uploads` | `{ "filename": "pastor-corre.mp4", "size": 52428800 }` | `201 { "upload_id", "chunk_size", "total_chunks" }` |
| `PUT /uploads/{upload_id}/chunks/{index}` | bytes del pedazo (`application/octet-stream`), `index` desde 0 | `{ "received": [0, 1, 2], "total_chunks" }` |
| `GET /uploads/{upload_id}` | | `{ "received": [...], "total_chunks" }`, para retomar una subida cortada |
| `POST /uploads/{upload_id}/complete` | | `202 { "job_id" }`: arma el archivo y lo pone en la cola |

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

Las etapas de la web (W6.1) se mapean así: subiendo (la web) → detectando personas (`tracking`) → pose 3D (`pose3d`) → retargeting y entrenamiento (fuera de este servidor).

**Elegir otro sujeto (W5.3).**

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /jobs/{job_id}/videos/{n}/first-frame.jpg` | | el cuadro `first_frame`, en sus píxeles originales, para dibujar `people` encima |
| `POST /jobs/{job_id}/videos/{n}/subject` | `{ "x": 640, "y": 360 }`, píxeles del cuadro `first_frame` | `202`; el video vuelve a `pose3d` con esa persona (`selected_by: "user"`), sin repetir el tracking |

**Resultado.** `GET /clips/{clip_id}.json` devuelve el `PoseClip`. `GET /health` responde `{ "ok": true, "queue": 0 }`.

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
- **Políticas:** cuando `training/` tenga la primera, cada entrada suma `"policy"` con el id de su `policy.json`.
