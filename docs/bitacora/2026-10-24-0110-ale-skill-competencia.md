---
persona: Ale
rama: ale/pitch
sesion: ce48d8e0-393f-4433-8ca2-04915fe77665
inicio: 2026-10-24 01:10
estado: en curso
---

# La competencia en el skill, y la escalera en el guion

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
- La pasada automática de la 01:16 salió `SIN NOVEDADES` y no escribió ni commiteó nada: la regla de pararse en seco funciona.
- Shipeado a `main` con `scripts/ship.sh`.

## Qué no funcionó

- La primera versión del script perdía la referencia: con un solo archivo de estado, 60 pasadas automáticas convertían "cambios desde la última pasada" en "cambios desde hace media hora". Se arregló con dos estados (`.estado.tsv` y `.estado-documentado.tsv`) y un `--marcar` que solo se corre al terminar de escribir.

## Qué se hizo después (03:15)

- **Puntuación con la rúbrica real** en los dos archivos de competencia: técnico 25, impacto 20, ejecución 20, ambición 20, originalidad 15, puntuando solo lo que existe en el repo y el deploy de cada equipo. Top 3 de hoy: Tridi 78, el equipo 24 con 72 y el 25 con 69.
- Nuestras notas, sin maquillar: técnico 22/25 y ejecución 17/20 lo mejor; **impacto 12/20 y originalidad 10/15** lo peor. El impacto es el flanco por donde nos pasan cuatro equipos.
- El skill y la pasada automática repuntúan en cada ronda, mirando también nuestro propio repo y deploy antes de ponernos nota.

## Decisiones

- **El skill nombra la rutina pero no el contenido.** Este repo es público: el skill dice que la pasada existe y cómo correrla; las fichas de los rivales y las recomendaciones de pitch se quedan en platanus-ideas. Ale lo pidió explícitamente sabiendo que el skill se publica.
- El agendado vive en la sesión de Claude Code, no en el sistema: si se cierra, se vuelve a pedir.

## Qué se hizo después (01:50)

- **Borrador 3 del guion** ([`pitch/guion-3-minutos.md`](../pitch/guion-3-minutos.md)): el bloque de la escalera con los números medidos de `training/README.md`, su tabla de checkpoints y la cuenta de dónde sale "decenas de miles de caídas". Recronometrado: 151 s de habla + 24 s de pantalla = 175 s, con 5 s de margen (antes 143 + 29).
- El bloque del empujón pasó de "se cae" a **comparación**: la política v2 aguanta los cuatro empujones de 250 N, así que se empuja al entrenado (aguanta) y al sin entrenar (se cae). Hoja de cola actualizada.
- Salió del guion la frase de los pasos de física por segundo hasta que Pastor confirme el número con una política cargada: `physics/` va a 2 ms, pero la política decide cada 20 ms sobre `scene_mjx.xml`, que usa pasos de 4 ms.
- [`pitch/diferencia.md`](../pitch/diferencia.md): la recomendación 1 queda marcada como hecha con los números reales, y se agregó a "lo que NO podemos decir" la frase *"el robot aprendió a caminar con tu video"*.

## Decisión de contenido

**La escalera se cuenta por lo que es: aprender a sostenerse de pie y aguantar empujones, no imitar el clip.** El borrador 2 decía "el robot intentó parecerse a ese video"; `training/env.py` entrena otra cosa (recompensa de erguido, altura, pose y quietud) y la imitación de hoy es retargeting cinemático. Con un jurado que interroga a un agente dentro del repo, esa frase era un error verificable.

## Qué se hizo después (11:40)

- **[`docs/videos-para-datos.txt`](../videos-para-datos.txt): 188 enlaces de YouTube** para alimentar el pipeline, agrupados en 15 categorías (referencias de animación de perfil, rehabilitación y marcha clínica, Parkinson, análisis de marcha, trote, saltar la cuerda, salsa, bachata, merengue, Just Dance, motricidad gruesa infantil, ejercicio funcional, tai chi, boxeo de sombra y zumba).
- Sacados de búsquedas reales en YouTube leyendo `ytInitialData` desde el navegador, no de memoria. **Los 188 verificados uno por uno con el endpoint `oembed`: ninguno caído.**
- El archivo arranca con los seis criterios de selección que salen de `data/README.md` y `physics/`: de perfil (de frente el avance sale ≈ 0), cuerpo entero con pies visibles, cámara quieta, una sola persona o varias separadas, clips de 10-30 s, y movimiento lento antes que acrobacias.
- La primera sección son **referencias de animación grabadas a propósito de lado**, con fondo limpio y una sola persona: es el material más fácil para `data.extract` y por eso va primero.

## Sigue

- ~~Decidir el empujón de la demo.~~ Resuelto por la política v2: aguanta los cuatro de 250 N, que es lo que empuja el botón de la web. Si alguna vez se quiere una caída del entrenado en vivo, hay que subir a 350 N (ahí aguanta 1,2 de 4).
- **Para César:** la vista de los cuatro checkpoints lado a lado en `web/`. Hoy `view.loadPolicy` corre una política, no cuatro. Es el plano que más vale del pitch y el guion ya lo da por hecho a los 0:16.
- **Para Pastor:** confirmar los pasos de física por segundo con una política cargada, para poder decir el número en el bloque del empujón.
- Idea prestada del equipo 25: una tabla de estado pieza por pieza en el `README.md` de Tridi, porque el jurado y su agente entran por ahí.
