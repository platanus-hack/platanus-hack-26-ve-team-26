---
persona: Pastor
rama: pastor/fisica
sesion: 31e53a9d-8fda-41b3-88f5-830539865f59
inicio: 2026-10-24 10:00
estado: cerrada
---

# Dónde está el producto: estado y plan al día

## Objetivo

Comparar el repo con la visión del producto (Physical AI: video → imitación en mundos variados → política + datos), contar los retos superados y lo que falta, y dejar `estado.md` y `plan-producto.md` al día.

## Qué se hizo

- Revisión de las bitácoras, `estado.md`, `plan-producto.md`, los commits de `main` y los entrenamientos en `training/runs/` (los `followed_s` de cada checkpoint).
- [`../estado.md`](../estado.md), sección de Pastor: SIM-1/2/4/6/7 hechos, ENT-1 en curso con los números de `walk-v4` y `jacks-v2`, la escalera del aprendizaje y lo que sigue.
- [`../plan-producto.md`](../plan-producto.md): columna "Hoy" del flujo, ENT-1 con `walk-long`, `walk-v4` y `jacks-v2`, punto de control de las 12:00, ENT-6 nueva (la escalera), DOC-1 en curso y una lista de lo que falta en orden de importancia.

## Qué funcionó

- Seguimiento desde el inicio del clip, leído de los `.json` de cada checkpoint:

  | Pasos | 0 | 10 k | 100 k | 1 M | 3 M | 10 M | 20 M |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `walk-v4` (de 11,85 s; parte de `walk-long`) | 0,86 | 0,88 | 1,00 | 2,88 | 1,98 | 3,68 | 3,54 |
  | `jacks-v2` (de 5,17 s; desde cero) | 0,74 | 0,74 | 0,74 | 0,76 | 0,76 | 1,26 | |

## Qué no funcionó

- La caminata no mejora entre 10 M y 20 M pasos (3,68 → 3,54 s): más práctica sola ya no alcanza.

## Decisiones

- Los checkpoints de la escalera viven en `training/runs/`, que no se versiona; se copian a `training/policies/` solo los de la corrida elegida (ENT-6), como `g1-stand-step-*`.

## Sigue

- Punto de control de ENT-1 a las 12:00: si la caminata no pasa de ~4 s, la demo se apoya en jacks (20 a 30 M pasos más) o en un ciclo de paso corto.
- **Ale:** la escalera ya no está bloqueada; falta elegir la corrida (ENT-6).
- **César:** WEB-2 y WEB-3, con el servidor listo.
- Esta rama va 5 commits atrás de `main`: sincronizar antes de shipear.
