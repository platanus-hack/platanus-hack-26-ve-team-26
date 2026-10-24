---
persona: Juan
rama: juan/camara-telefono
sesion: bff48bc3-18e3-4671-a686-8a7c2b44ea8f
inicio: 2026-10-24 20:00
estado: en curso
---

# Entrenar en los cuatro mundos (ENT-3)

## Objetivo

Que el robot se corrija más rápido y aguante más sin caerse. Se descartó enseñarle a levantarse del piso: cuesta 100-500 M pasos y no cabe en la hackatón.

## Qué se hizo

- `training/worlds.py`: los mundos de `physics/worlds/` en Python (fricción, masa, motores, viento, empujones, escena de piedras), con las fórmulas de `applyWorld()`. Salen de `rollout.py`, que ahora los importa.
- `ppo.py --worlds plano,piedras,resbaloso,viento`: cada robot vive en un mundo (robot i → mundo i mod n) y en cada reinicio sortea valores nuevos dentro de sus rangos. Sirve para `stand` y para `mimic`. Los empujones salen del mundo, con `--push-max` como tope (currículum).
- El checkpoint guarda `worlds`, y `export.py` lo escribe en `policy.json` (los viejos siguen diciendo `["plano"]`).
- Corrida `stand-worlds-v1`: continúa `g1-stand-quiet` (`stand-v7b` @ 8 M) con los mismos términos de quietud, 12 M pasos en los 4 mundos.

## Qué funcionó

- `rollout.py` da lo mismo que antes con `g1-walk` (plano 4,1 s, piedras 3,0, resbaloso 1,6, viento 0,8): el refactor no cambió el dataset.
- Smoke test de 40 k pasos con `--worlds` en `stand` y `mimic`: corre, exporta, y `policy.json` trae los 4 mundos.
- Línea base de las políticas de hoy en los mundos (8 episodios de 20 s con empujones): `g1-stand-quiet` aguanta 8/8 en plano, 7/8 en piedras, 7/8 en resbaloso y **3/8 con viento** (media 8,8 s). El viento es el punto débil.

## Qué no funcionó

- La caminata no se puede reentrenar con mundos desde esta Mac: sus `.pt` (`walk-v4`) están en la de Pastor, y el ONNX no sirve para `--init`.

- `stand-worlds-v1` (25,7 min) no supera a `g1-stand-quiet`. Medidas con 16 episodios de 20 s por mundo, aguantan 20 s:

  | Mundo | `g1-stand-quiet` | v1 @ 10 M | v1 @ 12 M (final) |
  | --- | --- | --- | --- |
  | Plano | 15/16 | 14/16 | 6/16 |
  | Piedras | 15/16 | 14/16 | 9/16 |
  | Resbaloso | 15/16 | 11/16 | 5/16 |
  | Viento | 4/16 (6,9 s) | 5/16 (8,7 s) | 1/16 (2,7 s) |

  La curva sube hasta ~1,5 M (episodio de 20 s) y después oscila y se degrada (8-12 M: episodios de 7-12 s). Sospecha: el viento de hasta 14 m/s (~59 N constantes) es casi imposible para una postura quieta y desestabiliza todo lo demás, y `--std 0.3` reabrió demasiada exploración sobre una política ya afinada. No se exporta.

## Decisiones

- Cada robot se queda en un mundo y sortea dentro de él (no cambia de mundo en cada reinicio): la escena de piedras es otro modelo de MuJoCo, y cargarlo en cada reinicio sería lento.

## Sigue

- v2: currículum de viento (tope más bajo al principio), sin reabrir `--std`, y quedarse con el mejor checkpoint medido, no el último.
- Pastor: reentrenar la caminata con `--worlds` y `--push-max 100` desde `walk-v4`.
