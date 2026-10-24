---
sesion: 681d7f66-e9b3-48ed-a124-57b0942d8f43
inicio: 2026-10-24 18:12
estado: en curso
---

# Planning: brazos que se mueven como los de una persona en En vivo

## Objetivo

Juan reporta en En vivo: el robot no distingue palmas hacia adelante o hacia atrás, y al subir los codos a veces parece que baja las manos. Ronda de planning de todo lo que falta para que el G1 copie los brazos como un humano, porque eso es el dato que entrena la política.

## Qué se hizo

- Plan en [`docs/investigacion/2026-10-24-brazos-humanos-en-vivo.md`](../investigacion/2026-10-24-brazos-humanos-en-vivo.md): diagnóstico, tareas B0..B8, orden y dueños.
- Diagnóstico de la palma (seguro): `wrist_roll_joint` no lo resuelve nadie en `retarget.js`, y el costo del brazo (codo + muñeca) no depende del giro con el brazo estirado. Palma adelante y atrás dan el mismo robot.
- Diagnóstico del codo (hipótesis): profundidad del codo hacia la cámara, IK que sacrifica el codo, o `clearance`/espejo del brazo oculto actuando sin querer. Se distingue con el set de gestos (B0).

## Decisiones

- Primero un set de ~12 gestos grabados con su condición esperada y `check-gestures.mjs`, antes de tocar el IK.
- El signo de la palma sale de la imagen 2D (lado del pulgar respecto a meñique→índice), no de la profundidad.

## Sigue

- B0, después B1 (palmas) y B3/B4 (codos). B1, B3, B4 tocan `physics/` (Pastor): avisarle.
