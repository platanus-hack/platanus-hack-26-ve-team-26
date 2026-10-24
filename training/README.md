# training/: el G1 aprende a sostenerse

MuJoCo resuelve la física; el mundo donde el robot aprende es nuestro: qué ve, qué puede hacer, qué cuenta como bien y qué como caída ([`env.py`](env.py)). Una red pequeña (MLP) aprende con PPO a mantener al Unitree G1 de pie y a aguantar el empujón del botón "Empujar". Se exporta a `policy.onnx` + `policy.json` según el [contrato](../docs/contrato.md). Dueño: Juan.

## Cómo correrlo

Requiere [uv](https://docs.astral.sh/uv/). Desde la raíz del repo:

```bash
uv run --project training python -m training.ppo --steps 20000000 --run stand      # ~30 min en una M2
uv run --project training python -m training.evaluate training/runs/stand/step_*.pt  # de pie y empujones, por checkpoint
uv run --project training python -m training.export training/runs/stand/step_20000000.pt --id g1-stand
```

Los checkpoints quedan en `training/runs/<run>/` (no se versionan) en los pasos 0, 10k, 100k, 1M, 3M, 10M… y al final, con `progress.csv` para la curva. Las políticas exportadas van a [`policies/`](policies).

## El mundo (`env.py`)

| Pieza | Qué es | Por qué |
| --- | --- | --- |
| Modelo | `physics/models/unitree_g1/scene_mjx.xml`, MuJoCo 3.16.0 | La variante para entrenar (cápsulas, motores más blandos), la misma versión que corre la web en WASM |
| Decisión | 50 veces por segundo (5 pasos de física de 4 ms) | Atrapa un tropezón (una caída dura ~0,5 s) |
| Acción | 29 números; objetivo de cada motor = pose de pie + 0,25 rad × acción, dentro de su rango | Una política sin entrenar solo tiembla alrededor de la pose de pie |
| Recompensa | Erguido 0,4 + altura 0,3 + cerca de la pose de pie 0,2 + quieto 0,1, menos cambios bruscos | ~1 por paso de pie; todo positivo, así que caerse (que corta el episodio) es lo peor |
| Caída | Pelvis bajo 0,5 m o torso inclinado más de 60° | Desde ahí el G1 no se levanta |
| Empujones | Cada 2-4 s, hasta 300 N durante 0,1 s, dirección al azar | El botón de la web empuja 250 N: queda dentro de lo aprendido |
| Episodio | 20 s, arrancando con la pose de pie ±0,05 rad | Aprende a sostenerse desde muchas poses, no a repetir una |

## Para correr la política en el navegador (Pastor y César)

`policy.onnx` recibe `obs` `[1, 93]` y devuelve `ctrl` `[1, 29]`: los objetivos de los motores, listos para `data.ctrl`. Adentro ya están la normalización, la escala y los rangos. Hay que llamarla cada 20 ms (cada 5 pasos de física de 4 ms, con `scene_mjx.xml`) y armar `obs` así, con `qpos` y `qvel` de MuJoCo:

| Índices | Valor |
| --- | --- |
| 0-2 | Velocidad angular de la pelvis en su propio marco: `qvel[3:6] × 0,25` |
| 3-5 | Gravedad vista desde la pelvis: `-(2(xz − wy), 2(yz + wx), 1 − 2(x² + y²))` con `qpos[3:7] = (w, x, y, z)` |
| 6-34 | Ángulos menos la pose de pie: `qpos[7:36] − default` |
| 35-63 | Velocidades de las articulaciones: `qvel[6:35] × 0,05` |
| 64-92 | Los `ctrl` anteriores como acción: `(ctrl_anterior − default) / 0,25` (al empezar, `ctrl_anterior = default`) |

`default` es el `ctrl` del keyframe `home` de `scene_mjx.xml`. El orden de los 29 motores es el de los actuadores del modelo (de la cadera izquierda a la muñeca derecha).

## Números medidos (Mac M2)

| Qué | Valor |
| --- | --- |
| Simulación, 64 robots en 8 núcleos | 11.400 pasos de política por segundo |
| PPO en CPU vs MPS | 11.200 vs 10.100 pasos/s: la red es tan chica que mandar cada lote a la GPU cuesta más de lo que ahorra |
| Sin política (motores fijos en la pose de pie) | Se cae en 1 s |
| ONNX vs torch | Misma salida (diferencia máxima 3e-7 rad), 265 KB |
| Primer entrenamiento (`stand-v1`, 20 M pasos) | 38,5 min |

## La política de hoy: `policies/g1-stand.onnx`

Evaluada con `evaluate.py`: 5 arranques, 20 s cada uno, y el empujón de la web (250 N, 0,1 s, en el torso) a los 4, 8, 12 y 16 s desde adelante, la izquierda, atrás y la derecha.

| Checkpoint (`policies/`) | De pie (de 20 s) | Empujones de 250 N aguantados (de 4) |
| --- | --- | --- |
| Sin política (motores fijos en la pose de pie) | 1,1 s | 0 |
| `g1-stand-step-0` (sin entrenar) | 1,1 s | 0 |
| paso 1 M | 2,2 s | 0 |
| `g1-stand-step-3000000` | 4,2 s | 0 |
| `g1-stand-step-10000000` | 9,6 s | 1,2 |
| `g1-stand-step-20000768` = `g1-stand` | 13,4 s | 2,2 |

Sin empujones se sostiene los 20 s. Aguanta los 4 empujones hasta 150 N; con 200 N aguanta 3,2 y con 250 N, 2,2. La escalera de checkpoints es la del pitch: el mismo robot sin entrenar, a medias y entrenado. La curva de recompensa está en `policies/g1-stand-progress.csv`.
