---
persona: Juan
rama: juan/pipeline
sesion: defcc784-f5a3-4adf-9878-528b78712c19
inicio: 2026-10-24 05:10
estado: en curso
---

# Cadena de entrenamiento por clip: contrato, ENT-4, ENT-5 y SRV-1..3

## Objetivo

Que un clip (de la cámara o de un video) se entrene solo en el servidor y entregue política y datos: revisar el contrato propuesto, exportar cada checkpoint a ONNX (ENT-4), generar los datos (ENT-5) y la cola de entrenamiento del servidor (SRV-1 a SRV-3). Sin tocar `imitate.py`, la recompensa ni la observación (son de Pastor). Respaldo para las 12:00: un clip de jumping jacks.

## Qué se hizo

- **Contrato vigente** (shipeado, `docs(contract)`): las partes del 2026-10-24 sirven como están. Cambios: `policy.json` suma `followed_s` y `duration_s` (el servidor los lee de ahí para el progreso); cada episodio de los datos suma `push_n`; el ejemplo de mundo ahora es el `piedras.json` real (escena `scene_mjx_stones.xml`, campo `why`); `task: "mimic"` es `--task walk` en `training.ppo`; `worlds` es `["plano"]` hasta ENT-3.
- **ENT-4** (`training/ppo.py`, `export.py`): cada checkpoint se exporta a ONNX al guardarse (`<prefix>-step-<N>.onnx` + `.json`), con `worlds`, `followed_s` y `duration_s` sumados a lo que ya escribía (`task`, `motion`). `--every N` guarda checkpoints extra; `--export-dir`, `--policy-prefix`, `--no-export`.
- **ENT-5** (`training/rollout.py`): la política final (el ONNX, lo que recibe el cliente) en N episodios por mundo desde el inicio del clip, con cada parámetro sorteado en el rango de `physics/worlds/<id>.json` y aplicado igual que `applyWorld()` de `physics/src/sim.js` (fricción de los pares pie-piso, masa e inercia, kp/kv/torque, viento con la misma fórmula, empujones). Guarda `datasets/<clip_id>.zip` con `meta.json` + `rollouts.npz` del contrato.
- **SRV-1..3** (`data/server.py`): `POST /clips` con sus validaciones; cola de entrenamiento aparte de la de videos (de a uno, 3 en espera) que encadena `retarget --out → training.ppo --task mimic --motion (exporta cada checkpoint) → training.rollout` como subprocesos en su propio grupo de procesos (cancelar mata también los workers de PPO); `GET /train/{id}` lee `progress.csv` y los `.json` exportados; `GET` de motions, policies y datasets. Prueba nueva: `data/check_training.py`.

## Qué funcionó

- `uv run --project data python -m data.check_training`: 29 comprobaciones en ~20 s con la cadena real y 8 k pasos (validaciones 400/413/422, id propio, mismo `train_id` para el mismo clip, cola llena 409, cancelar en espera, 3 checkpoints exportados con `followed_s`, motion, políticas y dataset con las formas del contrato, rutas fuera de las carpetas 404).
- Cancelar un entrenamiento corriendo: el `uv`, el `python` y los 8 workers terminan (sin procesos huérfanos).
- La fuerza de contacto de los pies sale con signo bien: de pie, +z ≈ el peso del robot.
- La política `stand` sigue exportando igual (con `task: "stand"`).

## Qué no funcionó

- **Choque con Pastor:** mientras trabajaba, Pastor shipeó ENT-2 (`--task mimic --motion`, el checkpoint guarda `task` y `motion`) y SIM-4 (`--out`), y yo había hecho lo mismo en `ppo.py`, `vec.py` y el retargeting. El rebase chocó en 4 archivos: descarté mi versión de `--motion` y de `--out` (la suya es más completa) y rehice ENT-4 encima de la suya. Mi rama vieja quedó como `backup/juan-pipeline-pre-rebase` (local).
- Límite: la política no camina (ENT-1 sigue en Pastor), así que hoy los datos tienen episodios de menos de 1 s. La cadena se probó con entrenamientos cortísimos, no con 20 M pasos.

## Decisiones

- Los checkpoints extra de `--every` se nombran por el umbral (como los de siempre), no por el paso exacto.
- Los datos se generan con el ONNX y no con los pesos de torch: es lo que se entrega.
- Los trabajos de entrenamiento viven en memoria como los de video; sus archivos quedan en `TRIDI_DATA_DIR`.

## Sigue

- Respaldo de las 12:00: clip de jumping jacks en el lugar → `data/clips/` → `npm run retarget` → pasarle el `clip_id` a Pastor.
- César: WEB-2/WEB-3 ya pueden usar `POST /clips`, `POST /clips/{id}/train`, `GET /train/{id}` y las descargas.
- Pastor: `ppo.py` ahora exporta cada checkpoint por defecto (en la carpeta del run); `--no-export` lo apaga si molesta en sus pruebas. `export.py` mide `followed_s` (suma ~1 s por checkpoint).
