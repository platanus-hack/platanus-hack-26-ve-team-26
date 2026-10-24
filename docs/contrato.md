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

## Simulaciones precargadas

Carpeta pública con pares `PoseClip` + `Policy` ya hechos (por ejemplo "Pastor caminando"), que la web muestra mientras un video nuevo se procesa.
