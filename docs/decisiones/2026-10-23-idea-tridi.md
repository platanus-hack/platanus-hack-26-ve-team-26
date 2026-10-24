# La idea es Tridi: de video humano a un robot simulado que aprende a moverse solo

- **Fecha:** 2026-10-23 · **Quién:** Juan, Pastor, César y Ale · **Estado:** vigente

## Contexto

Track: Three Dimensions. Queríamos algo parecido a Sombra (cámara → esqueleto 3D → robot) pero más aterrizado: que el robot no copie en vivo, sino que **aprenda** de muchos videos y después se mueva solo en un mundo físico simulado. Restricciones: 36 horas, solo Macs con Apple Silicon (sin GPU NVIDIA), deploy público obligatorio, jueces técnicos que leen el repo con un agente.

## Decisión

Flujo del producto (esquema del cuaderno):

1. **Capturar datos.** Dos entradas:
   - **Cámara en vivo:** esqueleto 3D en el navegador al instante, como el MVP de Sombra.
   - **Subir archivos:** un `.mp4` o un `.zip` de `.mp4`. Se procesa en el servidor por partes.
2. **Elegir al sujeto.** Si hay varias personas (u objetos), se elige sola la más grande y central y se sigue con un id de tracking todo el video; el usuario puede hacer click en otra persona en el primer frame para cambiarla. Solo el sujeto entra al dataset.
3. **Mostrar siempre una simulación.** Mientras se procesa, la pantalla muestra las **simulaciones precargadas** (clips nuestros ya procesados y políticas ya entrenadas). Nunca hay una pantalla de carga sin nada.
4. **Retargeting.** Las poses humanas se convierten en ángulos de articulación del robot simulado.
5. **Entrenar.** Con esos datos se entrena localmente una **política neuronal** (red pequeña, no un LLM de texto) por imitación + aprendizaje por refuerzo dentro del motor de física: el robot aprende a correr porque intenta reproducir el movimiento sin caerse, no porque alguien programó cómo correr.
6. **Mostrar al robot.** El robot simulado ejecuta la política en una escena 3D.

Stack:

| Pieza | Elección |
| --- | --- |
| Física | **MuJoCo** (Python para entrenar; WASM en el navegador para mostrar) |
| Render | three.js, propio (el "motor gráfico bravo" es el render + la escena) |
| Pose en vivo | MediaPipe Pose Landmarker en el navegador |
| Pose desde video | YOLO pose + ByteTrack (elegir y seguir al sujeto) y MediaPipe sobre el recorte del sujeto para el 3D |
| Entrenamiento | PyTorch con MPS en Mac, PPO con recompensa de imitación (estilo DeepMimic) |
| Inferencia en la demo | Política exportada a ONNX y corrida en el navegador junto a MuJoCo WASM: el público la prueba sin GPU en el servidor |

## Por qué

- **Política neuronal, no LLM.** Un modelo de lenguaje no aprende control motor desde poses; lo que usa la industria (DeepMimic, Unitree, NVIDIA GR00T) son políticas pequeñas entrenadas por imitación y RL. Llamarlo LLM en el pitch sería un error que el jurado técnico detecta. En el pitch: "modelo open source que entrenamos nosotros".
- **MuJoCo y no un motor desde cero.** La física de contacto y articulaciones fiel no sale en 36 horas; MuJoCo es el estándar de robótica, open source y corre en el navegador. Lo nuestro es la escena, el render, el pipeline de datos y el entrenamiento.
- **Auto + click para el sujeto.** Sin interacción funciona con cualquier video; el click arregla el caso en que la heurística elige mal.
- **Precargadas siempre visibles.** El entrenamiento real toma horas en una Mac; la demo no puede esperar.

## Consecuencias

- El formato que une a todos es el `PoseClip` de [`../contrato.md`](../contrato.md).
- "Hasta 10 TB" es la arquitectura (subida por partes, procesamiento por lotes), no la demo: en la demo se suben MB o pocos GB.
- El entrenamiento corre en nuestras Macs, no en el deploy. Lo desplegado muestra políticas ya entrenadas y procesa videos nuevos; entrenar un video nuevo se muestra como "en cola" o se entrena corto y local.
- Riesgo de originalidad: existen trabajos de video → robot (VideoMimic, HumanPlus, ASAP, GR00T-Mimic). Hay que tener lista la diferencia antes del domingo.
