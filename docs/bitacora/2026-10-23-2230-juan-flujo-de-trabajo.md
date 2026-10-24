---
persona: Juan
rama: juan/workflow
sesion: 6d6a16f8-89ab-486e-90c1-d69cc5411b05
inicio: 2026-10-23 22:30
estado: en curso
---

# Flujo de trabajo del equipo

## Objetivo

Que los 4 trabajemos en paralelo con agentes sin tener que ponernos al día a mano, y que cada agente sepa qué pasó en las otras sesiones.

## Qué se hizo

- Ramas por persona (`<nombre>/<tema>`) que se rebasean sobre `main` antes de cada prompt (`scripts/sync-main.sh`, hook de Claude Code).
- Entrega con `scripts/ship.sh`: PR, squash a `main` y la rama queda igual a `main` para seguir.
- Hook local que bloquea el push directo a `main` (`.githooks/pre-push`), activado con `scripts/setup.sh`.
- Bitácora por sesión, `docs/estado.md`, `docs/decisiones/` y `docs/preguntas-abiertas.md`, con un hook que le dice al agente cuál es el archivo de su sesión (`scripts/bitacora-hint.sh`).
- Skill `platanus-hack` (`.claude/skills/platanus-hack/`) para preparar la máquina de cada uno con los dos repos.

## Qué funcionó

- El flujo se ensayó antes en un repo de prueba (`juanevillam/plat-hack`): el rebase automático conserva los cambios sin commitear y, si hay conflicto, no toca nada y avisa.
- `ship.sh` probado de punta a punta con dos PR reales.

## Qué no funcionó

- La primera versión de `ship.sh` buscaba el PR por nombre de rama; al reusar la rama encontraba el PR viejo ya mergeado y el reset borraba los commits nuevos. Ahora solo usa el PR abierto y confirma el merge antes de tocar la rama.
- No podemos proteger `main` en GitHub: tenemos permiso de escritura, no de admin, en el repo de la organización. Lo cubre el hook local.

## Decisiones

- Squash por PR y rama personal reutilizable, en vez de una rama por prompt o por feature: menos ramas que manejar y `main` con un commit por entrega.
- Bitácora con nombre `fecha-hora-persona-tema` y decisiones con fecha en vez de numeración, para que los 4 no choquen.

## Sigue

- Cada uno: instalar la skill y correr `/platanus-hack setup`.
- Definir la idea, el stack, las carpetas por persona y el contrato.
- Resolver el espejo para el deploy (ver `docs/preguntas-abiertas.md`).
