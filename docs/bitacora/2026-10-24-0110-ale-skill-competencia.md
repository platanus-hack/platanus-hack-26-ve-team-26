---
persona: Ale
rama: ale/pitch
sesion: ce48d8e0-393f-4433-8ca2-04915fe77665
inicio: 2026-10-24 01:10
estado: en curso
---

# La competencia, dentro del skill

## Objetivo

Que el estudio de los otros equipos no dependa de que alguien se acuerde de pedirlo: que el skill `platanus-hack` lo haga siempre, al empezar cada sesión y cada media hora.

## Qué se hizo

- Sección **"Competition study (always on)"** en `.claude/skills/platanus-hack/SKILL.md`: el comando de la pasada, la regla de parar en `SIN NOVEDADES`, qué actualizar cuando sí hay novedades, el agendado cada media hora con CronCreate en minuto raro (`7,37 * * * *`), y las dos advertencias (un repo en plantilla no prueba nada; esto no va a la bitácora).
- La `description` del skill ahora dispara también con "actualiza la competencia" y con trabajo dentro de platanus-ideas, no solo dentro de este repo.
- Copia de usuario (`~/.claude/skills/platanus-hack/SKILL.md`) al día.
- El estudio en sí vive en platanus-ideas (privado): pasadas 2 y 3 escritas y pusheadas ahí.

## Qué funcionó

- Probado el comando tal como lo escribe el skill, desde este repo: `../platanus-ideas/docs/research/competencia/actualizar.sh` corre bien y detectó 2 equipos con cambios.
- La pasada automática quedó agendada y la copia de usuario del skill se recargó sola (la descripción nueva ya está activa).

## Qué no funcionó

- La primera versión del script perdía la referencia: con un solo archivo de estado, 60 pasadas automáticas convertían "cambios desde la última pasada" en "cambios desde hace media hora". Se arregló con dos estados (`.estado.tsv` y `.estado-documentado.tsv`) y un `--marcar` que solo se corre al terminar de escribir.

## Decisiones

- **El skill nombra la rutina pero no el contenido.** Este repo es público: el skill dice que la pasada existe y cómo correrla; las fichas de los rivales y las recomendaciones de pitch se quedan en platanus-ideas. Ale lo pidió explícitamente sabiendo que el skill se publica.
- El agendado vive en la sesión de Claude Code, no en el sistema: si se cierra, se vuelve a pedir.

## Sigue

- Decidir el empujón de la demo: la política aguanta los cuatro empujones de 150 N pero solo 2,2 de 4 a 250 N, y el botón de `physics/` empuja con 250 N. O el botón de la demo baja a 150 N, o el guion asume la caída.
- Actualizar el guion con la escalera real (0 / 3M / 10M / 20M pasos, 38,5 min en una M2); `pitch/diferencia.md` todavía dice 0/1k/10k/100k.
- Idea prestada del equipo 25: una tabla de estado pieza por pieza en el `README.md` de Tridi, porque el jurado y su agente entran por ahí.
