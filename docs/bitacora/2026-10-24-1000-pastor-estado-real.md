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

## Parte 2: la escalera en la entrega de Caminar

- **Revisión del panel de entrega de Juan** (`3561e6b`, en `main` y en el deploy desde las 10:03): repetición de los 32 episodios, la matriz de 4 mundos × 8 episodios, telemetría, las 6 descargas (las 6 responden 200 en el deploy) y la escalera, que venía vacía porque Juan no tenía los checkpoints de `walk-v4`.
- **Rama sincronizada** con `main` (rebase sin conflictos).
- **Entrega regenerada** con `training.deliver ... --dataset <copia del mismo dataset.zip> --checkpoints training/runs/walk-v4`: solo cambia `delivery.json` (la escalera y `created_at`); el dataset y los demás archivos son idénticos (mismo sha1 del zip, mismos números por mundo). Escalera: 0,86 → 0,88 → 1,00 → 2,88 → 1,98 → 3,68 → 3,54 s, a los 0, 10 k, 100 k, 1 M, 3 M, 10 M y 20 M pasos.
- **Verificado en el navegador** (`npm run dev` en `web/`, `#/entrega/clip_2026-10-23_caminar-perfil_01`): el gráfico dibuja los 7 puntos con el final marcado, sin errores salvo el aviso esperable de que el servidor de videos local está apagado.
- `plan-producto.md`, `estado.md` y `training/README.md` (cómo regenerarla con la escalera) al día.

### Qué no está bien todavía

- **El "0 pasos" de `walk-v4` no es un robot sin entrenar:** la corrida arrancó de los 30 M pasos de `walk-long`, y la ficha dice "20,0 M pasos" cuando en total practicó 50 M (30 M con las referencias viejas). Es lo que guardan los checkpoints; no se cambió el panel (es de Juan). Para mostrar en el pitch cómo aprende desde cero, la escalera buena es la de `jacks-v2`.
