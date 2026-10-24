# training/: el G1 aprende a sostenerse

MuJoCo resuelve la física; el mundo donde el robot aprende es nuestro: qué ve, qué puede hacer, qué cuenta como bien y qué como caída ([`env.py`](env.py)). Una red pequeña (MLP) aprende con PPO a mantener al Unitree G1 de pie y a aguantar el empujón del botón "Empujar". Se exporta a `policy.onnx` + `policy.json` según el [contrato](../docs/contrato.md). Dueño: Juan.

## Cómo correrlo

Requiere [uv](https://docs.astral.sh/uv/). Desde la raíz del repo:

```bash
uv run --project training python -m training.ppo --steps 20000000 --run stand      # ~30 min en una M2
uv run --project training python -m training.evaluate training/runs/stand/step_*.pt  # quieto (giro, desplazamiento, pisadas, brusquedad) y empujones, por checkpoint
uv run --project training python -m training.watch training/runs/stand --steps 20000000  # el progreso en vivo de un run
uv run --project training python -m training.export training/runs/stand/step_20000000.pt --id g1-stand
uv run --project training python -m training.diagnose_reference [clip_id ...]        # ¿el G1 puede hacer este RobotMotion? Antes de imitarlo
uv run --project training python -m training.ppo --task mimic --motion <clip_id o RobotMotion.json> --steps 10000000 --run <run>
uv run --project training python -m training.browser_fixture training/policies/<id>.onnx  # estados para la prueba del navegador (physics/)
```

Para que se corrija más rápido y aguante más, en los cuatro mundos de la web y no solo en el plano (`--worlds`, [`worlds.py`](worlds.py)); `rollout.py` usa los mismos mundos para el dataset:

El viento entra de a poco con `--wind-max` (m/s): `stand-worlds-v1` lo recibió entero desde el primer paso (hasta 14 m/s, ~59 N constantes), con `--std 0.3`, y a los 12 M pasos aguantaba menos que `g1-stand-quiet` en todos los mundos (6/16 episodios de 20 s en plano, contra 15/16). Por eso, por etapas y sin reabrir la exploración:

```bash
uv run --project training python -m training.ppo --run stand-worlds-v2a --steps 6000000 --every 1000000 --init training/runs/stand-v7b/step_8000000.pt \
  --reward turn=0.3,feet=0.5,planted=0.1,rate=0.02 --push-every 4,8 --push-min 50 --push-max 300 \
  --worlds plano,piedras,resbaloso,viento --wind-max 6
uv run --project training python -m training.ppo --task mimic --motion <clip_id> --worlds plano,piedras,resbaloso,viento --init <walk.pt> --push-max 100
```

Una postura quieta (ver "La política de hoy"): los términos de quietud de `env.Stance` se activan con `--reward`, los empujones se espacian con `--push-every`, y al continuar un run `--std` vuelve a abrir la exploración:

```bash
uv run --project training python -m training.ppo --run stand-v7a --steps 12000000 --init <checkpoint.pt> \
  --reward turn=0.3,feet=0.5,planted=0.1,rate=0.02 --push-every 4,8 --push-min 50 --push-max 300 --std 0.3
```

`diagnose_reference.py` revisa una referencia de imitación sin política, en 2 s: pies contra el piso, objetivos de los pies de la recompensa, rangos de los motores, y la referencia jugada por los motores con la pelvis sostenida (error, retraso de cada motor y contacto de los pies).

Los checkpoints quedan en `training/runs/<run>/` (no se versionan) en los pasos 0, 10k, 100k, 1M, 3M, 10M… (y cada `--every` pasos) y al final, con `progress.csv` para la curva. **Cada checkpoint se exporta a ONNX apenas se guarda** (`<prefix>-step-<N>.onnx` + `.json`, en la carpeta del run o en `--export-dir`; `--no-export` lo apaga), así la web puede cargarlo mientras sigue el entrenamiento. En imitación, el `.json` trae `followed_s`: cuánto del clip sigue desde el principio (la medida de `evaluate_walk.py`). Las políticas que se versionan van a [`policies/`](policies).

Entrenar un clip cualquiera y sacar sus datos, como lo hace el servidor (el `RobotMotion` puede estar fuera de `physics/motions/`):

```bash
uv run --project training python -m training.ppo --task mimic --motion <RobotMotion.json> --run <clip_id> \
  --steps 20000000 --every 2000000 --export-dir <carpeta> --policy-prefix <clip_id>
uv run --project training python -m training.rollout <carpeta>/<clip_id>-step-<N>.json --motion <RobotMotion.json> --out <clip_id>.zip
```

`rollout.py` corre la política final (el ONNX) desde el inicio del clip en N episodios por mundo de `physics/worlds/`, con cada parámetro sorteado en su rango y aplicado como `applyWorld()` de `physics/src/sim.js`, y guarda `meta.json` + `rollouts.npz` con el formato del [contrato](../docs/contrato.md#datos-para-entrenar-robots-2026-10-24).

## La entrega de un clip

Lo que se lleva el cliente, en una carpeta: la política final (`.onnx` + `.json`), el dataset, el `RobotMotion`, el `PoseClip` y la escena del video, más `delivery.json` (resumen por mundo y por episodio, la escalera de checkpoints y los archivos con su peso) y `replay.json` (cada episodio a 25 Hz y siempre con su última fila, para verlo sin bajar el dataset). Formato en el [contrato](../docs/contrato.md#la-entrega-de-un-clip-propuesta-de-juan-2026-10-24); el servidor la arma sola después del dataset ([`data/`](../data/README.md)).

```bash
uv run --project training python -m training.deliver <policy.json> --clip <PoseClip.json> --out <carpeta> \
  [--motion <RobotMotion.json>] [--scene <escena.json>] [--dataset <dataset.zip>] [--title "Caminar"] [--checkpoints <carpeta>] [--since <ISO UTC>]
```

- Sin `--dataset` corre `training.rollout` (8 episodios por mundo) y lo deja en la carpeta como `dataset.zip`. Con `--dataset`, tiene que ser de este clip y de esta política (`clip_id` y `policy_id` de su `meta.json`): si no, sale sin tocar la carpeta.
- `--motion` por defecto es `physics/motions/<clip_id>.json`; `--scene`, `data/scenes/<clip_id>.json` si existe; `--title`, el nombre del video (o "Clip de la cámara").
- `--checkpoints` es la carpeta de los `<prefijo>-step-<N>.json` exportados: la escalera toma los de este clip que traen `followed_s`. Sin ella, `checkpoints` queda `[]`. `--since` (la hora de inicio del entrenamiento, como el `created_at` de `policy.json`) deja fuera los que sobraron de un entrenamiento anterior del mismo clip.
- `delivery.json` se borra al empezar y se escribe al final y entero: si está, el resto de la carpeta está listo. Un `scene.json` que ya no va también se borra.
- En `replay.json` la fila `i` está a (2i + 1)/50 s del inicio del episodio; si la última fila del dataset quedó entre dos, se agrega al final y está a `seconds` del episodio (es donde terminó). Su `foot_force` es el pico de las filas que representa, para que el golpe de un talón (una o dos filas de 20 ms) no se pierda.

La precargada de la caminata está en [`data/deliveries/clip_2026-10-23_caminar-perfil_01/`](../data/deliveries/clip_2026-10-23_caminar-perfil_01) (2,4 MB; `replay.json` pesa 494 KB, 124 KB con gzip):

```bash
uv run --project training python -m training.deliver training/policies/g1-walk.json \
  --clip data/clips/clip_2026-10-23_caminar-perfil_01.json --out data/deliveries/clip_2026-10-23_caminar-perfil_01 --title "Caminar"
```

Para regenerarla con los mismos números, sin volver a correr los 32 episodios: `--dataset data/deliveries/clip_2026-10-23_caminar-perfil_01/dataset.zip`. La escalera sale de `--checkpoints training/runs/walk-v4` (los checkpoints exportados de esa corrida, que están en la Mac de Pastor y no se versionan): sin esa carpeta, la entrega queda sin escalera.

| Mundo | Episodios | Llegan al final (11,85 s) | Segundos: media (mín-máx) |
| --- | --- | --- | --- |
| Piso plano | 8 | 0 | 4,1 (3,0-5,0) |
| Piedras | 8 | 0 | 3,0 (2,2-5,2) |
| Piso resbaloso | 8 | 0 | 1,6 (1,2-1,8) |
| Viento | 8 | 0 | 0,9 (0,6-1,2) |

Ninguno llega al final: `g1-walk` sigue 3,5 s del clip desde el inicio y se entrenó solo en el piso plano. Unos 3 de cada 4 episodios terminan por alejarse más de 0,6 m del recorrido de la persona, no por caerse (`fell` cuenta las dos cosas, como en el entrenamiento). Su escalera queda vacía: los checkpoints de `walk-v4` no quedaron exportados con su `followed_s`.

## El mundo (`env.py`)

| Pieza | Qué es | Por qué |
| --- | --- | --- |
| Modelo | `physics/models/unitree_g1/scene_mjx.xml`, MuJoCo 3.16.0 | La variante para entrenar (cápsulas, motores más blandos), la misma versión que corre la web en WASM |
| Decisión | 50 veces por segundo (5 pasos de física de 4 ms) | Atrapa un tropezón (una caída dura ~0,5 s) |
| Acción | 29 números; objetivo de cada motor = pose de pie + 0,25 rad × acción, dentro de su rango | Una política sin entrenar solo tiembla alrededor de la pose de pie |
| Recompensa | Erguido 0,4 + altura 0,3 + cerca de la pose de pie 0,2 + quieto 0,1, menos cambios bruscos | ~1 por paso de pie; todo positivo y nunca bajo 0, así que caerse (que corta el episodio) es lo peor |
| Quietud (`Stance`, apagada por defecto) | Castigo cuadrático al giro de la pelvis; castigo a la velocidad de los pies y premio por tenerlos apoyados, solo si no hubo empujón en el último segundo; peso del cambio brusco | `g1-stand` aprendió a equilibrarse pivotando sobre un pie a 57°/s porque nada lo castigaba. Un paso es como se aguanta un empujón de 250 N (mueve la pelvis a 0,7 m/s, fuera del pie): cobrarlo desde el paso 0 es por lo que `stand-v5` nunca aprendió a darlo. Cuadrático y no `exp`: saturado no tiene gradiente |
| Caída | Pelvis bajo 0,5 m o torso inclinado más de 60° | Desde ahí el G1 no se levanta |
| Empujones | Cada 2-4 s (`--push-every`), hasta 300 N durante 0,1 s, dirección al azar | El botón de la web empuja 250 N: queda dentro de lo aprendido. Para una postura quieta, cada 4-8 s: con 5-9 empujones por episodio nunca se asienta |
| Episodio | 20 s, arrancando con la pose de pie ±0,05 rad | Aprende a sostenerse desde muchas poses, no a repetir una |
| Mundos (`--worlds`, [`worlds.py`](worlds.py), apagado por defecto) | Cada robot vive en un mundo de `physics/worlds/` (el robot i en el mundo i mod n) y en cada reinicio sortea fricción, masa, fuerza de los motores, viento y empujón máximo dentro de sus rangos, con las fórmulas de `applyWorld()` de la web | Una política que solo vio el piso plano no sabe corregirse con viento ni en piso resbaloso (la caminata dura 0,9 s con viento). Los empujones salen del mundo, con `--push-max` como tope, así que sigue sirviendo de currículum |

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

Dos vueltas en una M2: `stand-v1` (20 M pasos, 38,5 min, empujones al azar de 0 a 300 N) y `stand-v2`, que la continúa con empujones de 100 a 350 N (20 M pasos más, 34,5 min). Evaluada con `evaluate.py`: 5 arranques de 20 s, y el empujón de la web (250 N, 0,1 s, en el torso) a los 4, 8, 12 y 16 s desde adelante, la izquierda, atrás y la derecha.

| Política (`policies/`) | De pie (de 20 s) | Empujones de 250 N aguantados (de 4) |
| --- | --- | --- |
| Sin política (motores fijos en la pose de pie) | 1,1 s | 0 |
| `g1-stand-step-0` (sin entrenar) | 1,1 s | 0 |
| `g1-stand-step-3000000` (v1, 3 M) | 4,2 s | 0 |
| `g1-stand-step-10000000` (v1, 10 M) | 9,6 s | 1,2 |
| `g1-stand-step-20000768` (v1, 20 M) | 13,4 s | 2,2 |
| v2 (40 M en total; fue `g1-stand` hasta `6b9bb38`, sigue en git) | 20 s, girando a 55°/s y con 3,9 pisadas/s | 4 |
| `g1-stand-quiet` (`stand-v7b` @ 8 M, 48 M en total: v2 + términos de quietud) | 20 s, sin girar (0,9°/s) | 3,0 (falla desde la derecha) |
| **`g1-stand`** (`stand-v7d` @ 12 M desde `stand-v7b`, 60 M en total) | **20 s, sin girar (1,6°/s), 0,2 pisadas/s** | **3,6** (falla desde la derecha) |

La v2 aguantaba todos los empujones hasta 250 N (con 300 N, 3,2 de 4; con 350 N, 1,2), pero lo lograba pivotando sobre un pie. `g1-stand` es la postura quieta que se ve en la web, a cambio de unos empujones: con el botón de la web, que empuja en dirección al azar, se cae más o menos 1 de cada 4 veces. Medidas de `training.evaluate`, el 2026-10-24. La escalera de `g1-stand-step-*` es la del pitch: el mismo robot sin entrenar, a medias y entrenado. Curvas: `policies/g1-stand-progress.csv` (v1) y `policies/g1-stand-v2-progress.csv`.
