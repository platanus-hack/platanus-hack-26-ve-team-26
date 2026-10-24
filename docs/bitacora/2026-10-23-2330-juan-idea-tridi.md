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

## Qué funcionó

- —

## Qué no funcionó

- —

## Decisiones

- Lo que se entrena es una política neuronal pequeña (imitación + PPO), no un LLM: un LLM de texto no aprende control motor y el jurado técnico lo detecta.
- MuJoCo para la física (Python para entrenar, WASM en la web) y render propio en three.js.
- Entrenamiento en Macs (PyTorch MPS); la web desplegada corre políticas ya entrenadas en ONNX.
- Sujeto: automático (más grande y central, seguido con ByteTrack) y click para cambiarlo.

## Sigue

- Los 4: revisar el contrato y aceptarlo o cambiarlo.
- Decidir quién entrena y qué robot.
- Juan: primer `PoseClip` desde un `.mp4` con varias personas (YOLO pose + ByteTrack + MediaPipe sobre el recorte).
