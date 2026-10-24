---
persona: Juan
rama: juan/workflow
sesion: 3c1c46ec-0668-47fa-87ad-fca493716c81
inicio: 2026-10-23 23:30
estado: en curso
---

# Idea Tridi, roles y contrato

## Objetivo

Pasar el esquema del cuaderno (captura → simulación → entrenar modelo → robot) a una idea escrita, con stack, roles y el formato de datos que une a los 4.

## Qué se hizo

- Decisión de la idea y el stack: [`../decisiones/2026-10-23-idea-tridi.md`](../decisiones/2026-10-23-idea-tridi.md).
- Contrato en borrador: `PoseClip`, `RobotMotion`, `Policy` y precargadas ([`../contrato.md`](../contrato.md)).
- Roles y carpetas en `estado.md` y en la tabla de `AGENTS.md`.
- Dos preguntas abiertas: quién entrena la política y qué robot.
- Platanus marcó el commit `4e5b8ac` como "Submission Invalid" en Discord: `platanus-hack-project.jsonc` y `project-description.md` seguían con la plantilla. Se llenaron con Tridi y se agregó `scripts/check-submission.sh`, que `ship.sh` corre antes de mergear.

## Qué funcionó

- `check-submission.sh` probado con los archivos de plantilla (falla con los mismos errores del bot) y con los llenos (pasa).

## Qué no funcionó

- La primera versión del chequeo usaba `\s` en `sed -E`, que no existe en el sed de macOS: no detectaba `<FILL THIS>`. Ahora usa `[[:space:]]`.

## Decisiones

- Lo que se entrena es una política neuronal pequeña (imitación + PPO), no un LLM: un LLM de texto no aprende control motor y el jurado técnico lo detecta.
- MuJoCo para la física (Python para entrenar, WASM en la web) y render propio en three.js.
- Entrenamiento en Macs (PyTorch MPS); la web desplegada corre políticas ya entrenadas en ONNX.
- `deploy-url` apunta al repo hasta que exista el deploy de la web (el bot exige una URL válida). Hay que cambiarlo apenas haya deploy.
- Sujeto: automático (más grande y central, seguido con ByteTrack) y click para cambiarlo.

## Sigue

- Los 4: revisar el contrato y aceptarlo o cambiarlo.
- Decidir quién entrena y qué robot.
- Juan: primer `PoseClip` desde un `.mp4` con varias personas (YOLO pose + ByteTrack + MediaPipe sobre el recorte).
