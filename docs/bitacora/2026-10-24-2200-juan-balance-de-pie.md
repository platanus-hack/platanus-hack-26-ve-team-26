---
persona: Juan
rama: juan/camara-telefono
sesion: ed253965-bbbd-4468-a3ca-c76cf89ee36e
inicio: 2026-10-24 22:00
estado: cerrada
---

# Por qué el balance de pie se ve peor que antes

## Objetivo

Juan notó que el robot de pie de la web aguanta menos que una versión anterior y no sabía por qué.

## Qué se hizo

- Causa: `6b9bb38` cambió `g1-stand` de la v2 (40 M) a `stand-v7d` (60 M en total), la postura quieta. Medidas con `training.evaluate`, de 4 empujones de 250 N:

  | Política | Empujones | Giro quieto | Pisadas/s |
  | --- | --- | --- | --- |
  | v2 (40 M, ya no está en `policies/`) | 4,0 | 55°/s | 3,9 |
  | `g1-stand` (`stand-v7d`) | 3,6 | 1,6°/s | 0,2 |
  | `g1-stand-quiet` (`stand-v7b`) | 3,0 | 0,9°/s | 0,3 |

- `web/src/policies.js`: `g1-stand` decía "40 millones de pasos" y ahora dice "60 millones de pasos". Va después de `g1-stand-quiet` (48 M) para que la escalera quede en orden.
- `web/src/screens/home.js`: se quitó `data-level="g1-stand-quiet"` de Policy y del cierre. Nadie lo leía (`modeAt()` solo mira `data-mode`), así que la landing ya usaba `g1-stand`. Comprobado en el navegador: carga `g1-stand.onnx`.
- `training/README.md`: la tabla de la política de hoy decía que `g1-stand` es la v2 y que aguanta 4 de 4.

## Decisiones

- Se queda `stand-v7d` como `g1-stand`: aguanta más empujones que `g1-stand-quiet` y se ve igual de quieta. La v2 aguantaba todos los empujones, pero pivotaba y pataleaba.

## Sigue

- Quedan afirmaciones viejas en la landing (carpeta de César): el Gym muestra `g1-stand` con 40 M pasos y "4 de 4"; Policy dice "La de pie aguanta 4 de 4 empujones de 250 N"; la prueba del hero dice "4 de 4 empujones"; el aviso al caer dice "1 de cada 15", y con v7d es más o menos 1 de cada 4. También la tabla "qué es verdad hoy" del pitch.
