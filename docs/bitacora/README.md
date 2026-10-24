# Bitácora

El historial de git, pero con contexto: por cada sesión de trabajo (una conversación con un agente, o un rato trabajando a mano) queda un archivo con qué se buscaba, qué se hizo, qué funcionó, qué no y qué sigue. Así cualquiera de los 4, o su agente, sabe en un minuto qué pasó mientras no estaba.

## Reglas

- **Un archivo por sesión**, no por prompt. Se crea en el primer prompt que cambia algo y **se actualiza después de cada prompt** de esa misma sesión.
- **Nombre:** `AAAA-MM-DD-HHMM-<persona>-<tema>.md` (por ejemplo `2026-10-24-0130-pastor-colisiones.md`). La hora y la persona evitan choques entre los 4.
- **Cada uno escribe solo sus archivos.** Nadie edita la bitácora de otro: si algo de otra sesión estaba mal, se dice en la tuya.
- La línea `sesion:` lleva el id de la sesión de Claude Code (el hook se lo da al agente en cada prompt). Así el agente encuentra su archivo aunque la conversación se compacte. Si trabajas a mano, pon `manual`.
- Se commitea con el trabajo y llega a `main` con `scripts/ship.sh`.
- Corto y concreto: lo que le sirve a otro para seguir, no una narración. Los números, con su porqué.
- Al terminar la sesión: `estado: cerrada`, y si cambió algo del estado general, se actualiza tu sección en [`../estado.md`](../estado.md).

## Plantilla

```markdown
---
persona: Pastor
rama: pastor/fisica
sesion: <id de la sesión, o "manual">
inicio: 2026-10-24 01:30
estado: en curso
---

# <Tema en pocas palabras>

## Objetivo

Qué se quería lograr en esta sesión.

## Qué se hizo

- Cambio concreto, con el archivo o el commit.

## Qué funcionó

- Lo que quedó andando y cómo se comprobó.

## Qué no funcionó

- Lo que se intentó y falló, y por qué. Ahorra que otro lo intente de nuevo.

## Decisiones

- Decisión y su porqué. Si afecta a otros, va también a [`../decisiones/`](../decisiones).

## Sigue

- Lo pendiente, y quién lo necesita.
```
