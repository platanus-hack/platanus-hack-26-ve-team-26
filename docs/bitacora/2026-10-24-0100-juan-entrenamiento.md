---
persona: Juan
rama: juan/training
sesion: 36a3f126-4715-4a55-9191-253aba742917
inicio: 2026-10-24 01:00
estado: en curso
---

# training/: el G1 aprende a sostenerse y aguantar el empujón

## Objetivo

Primera fase de `training/`: entorno de RL legible sobre `scene_mjx.xml`, una política PPO que se sostenga de pie y aguante el empujón de 250 N de la web, checkpoints desde el paso 0 para el pitch, y export a `policy.onnx` + `policy.json` según el contrato. Después, imitación de `RobotMotion`.

## Qué se hizo

- Reparto con Pastor: Juan toma `training/`; Pastor sigue con el retargeting de `PoseClip` a `RobotMotion` y la infra (storage). Se trabaja en un worktree aparte (`../tridi-training`) porque la sesión de integración usa la carpeta principal.
- `training/env.py`: observación de 93 números, acción de 29 objetivos de motor, recompensa, caída, empujones al azar. `vec.py`: 64 robots en 8 procesos. `ppo.py`: PPO con checkpoints. `evaluate.py`: de pie 20 s con los 4 empujones de la web. `export.py`: ONNX con todo adentro (normalización, escala, rangos), verificado contra torch.

## Qué funcionó

- Sin política el G1 de entrenamiento se cae en 1 s (motores blandos, `kp=75`): el entorno tiene algo real que aprender.
- 11.400 pasos de política por segundo con 64 robots en una M2. 20 M de pasos ≈ 30 min.
- ONNX igual a torch (3e-8 rad), 265 KB.

- Primer entrenamiento `stand-v1`: 20 M pasos en 38,5 min. La política se sostiene 20 s sin empujones, aguanta los 4 empujones hasta 150 N, y con 250 N aguanta 2,2 de 4 (13,4 s de pie). Escalera para el pitch: 1,1 s (sin entrenar), 4,2 s (3 M), 9,6 s (10 M), 13,4 s (20 M). Exportada a `training/policies/` (`g1-stand.onnx` y los checkpoints `g1-stand-step-*`).

## Qué no funcionó

- La primera evaluación decía que todo se caía a los 4,4 s, hasta con 50 N. Era un bug de la evaluación, no de la política: con los empujones al azar apagados, `_push()` salía sin limpiar la fuerza y el empujón quedaba aplicado para siempre. Arreglado en `env.py`; el entrenamiento no lo tenía, porque ahí los empujones siempre están prendidos.
- MPS más lento que CPU para esta red (10.100 vs 11.200 pasos/s): se queda CPU por defecto.

## Decisiones

- El ONNX devuelve `ctrl` directo (no la acción cruda): el navegador solo arma `obs` y escribe `data.ctrl`. El formato de `obs` está en `training/README.md`.
- Checkpoint de 1k pasos descartado: es menos que una actualización (4.096), igual al paso 0.
- No se cambia el contrato por ahora: `policy.json` lleva solo sus campos; el detalle de `obs` va en el README.

## Sigue

- Seguir entrenando desde `stand-v1` con empujones más fuertes, para que aguante los 4 de 250 N.
- Pastor/César: cargar `policy.onnx` en la web con el `obs` del README.
- Imitación: recompensa por seguir un `RobotMotion` cuando Pastor lo tenga.
