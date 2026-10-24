---
persona: Pastor
rama: pastor/fisica
sesion: 4c321158-5a20-42b9-8d40-fb50c70005ff
inicio: 2026-10-24 02:49
estado: en curso
---

# La visión del producto contra el repo, y el pitch para la Physical AI

## Objetivo

Comparar el repo con la visión del producto: video o cámara → esqueleto 3D → un robot simulado que aprende a moverse imitando ese video, sin caerse ante empujones y en entornos variados, con datos que sirvan para robots reales. Y dejar escrito el pitch.

## Qué se hizo

- Revisión de `docs/estado.md`, las bitácoras, el contrato, `physics/`, `training/` y `web/`, incluido el commit `5f29ace` de Juan (imitación), que está en `origin/main` y todavía no en esta rama.
- Pitch del producto en [`../pitch/pitch-producto.md`](../pitch/pitch-producto.md), con una tabla que separa lo que es verdad hoy de lo que es plan. No reemplaza el guion de Ale.
- Plan técnico en [`../plan-producto.md`](../plan-producto.md): el flujo completo en 7 pasos, dónde corre cada parte, los cambios de contrato propuestos (`POST /clips`, cola de entrenamiento, políticas, datos y mundos) y las tareas J1-J6, P1-P5, C1-C4 y A1-A3 por horario hasta el cierre. Puntero en mi sección de [`../estado.md`](../estado.md).

## Qué se encontró (para quien siga)

- **La imitación ya sirve para cualquier clip.** `MimicEnv` (`training/imitate.py`) sigue cualquier `RobotMotion`. Se llama `walk` solo porque su clip por defecto es la caminata y `vec.py` no le pasa otro. Falta poder pasarle el archivo (`--motion <ruta>`).
- **`g1-stand` no es un paso previo de la imitación.** La imitación arranca de cero (`ppo.py` solo carga pesos con `--init`), y los de la política de pie no encajan (93 entradas contra 126). El equilibrio se aprende dentro de la imitación: caerse corta el episodio y le quita la recompensa que le quedaba.
- **El navegador no puede correr una política de imitación.** `physics/src/policy.js` solo acepta la observación de 93 números.
- **La cámara en vivo no guarda nada.** `createLiveCapture` ya tiene `startRecording`/`stopRecording` (devuelven un `PoseClip`), pero `web/` no los usa (W4.3), y no hay endpoint para mandarle un `PoseClip` al servidor.
- **El servidor termina en el `PoseClip`.** Retargeting, entrenamiento y export no están encadenados.
- **El entrenamiento no varía el entorno.** Piso plano, fricción fija en 1, sin viento. Solo hay empujones (apagados en `MimicEnv`) y ruido en la pose inicial.
- **Robots reales:** la observación de la política de pie usa solo lo que mide un G1 (giróscopo e inclinación de la pelvis, ángulos y velocidades de motores). La de imitación agrega la altura real de la pelvis (índice 125), que un robot real no mide directo.

## Qué funcionó

- Sesión de análisis: no se corrió código, todo sale de leer el repo y el historial de git.

## Qué no funcionó

- Sugerí "partir de una política que ya sabe equilibrarse" para que cada video entrene más rápido, y se confundió con `g1-stand` como requisito. Es un atajo opcional y hoy no se puede enchufar (otras entradas, otra acción).

## Decisiones

Propuestas por Pastor, pendientes de los otros 3. Cuando se acepten, van a [`../decisiones/`](../decisiones).

- Nicho: Physical AI. Cliente: empresas de humanoides; empresas de hardware después (una frase en el pitch).
- No vendemos robots ni motor de física: vendemos el simulador de entornos sobre MuJoCo.
- Se entregan dos cosas: la política (ONNX) y los datos corregidos por la física.
- Cada video del usuario se entrena por imitación, en cola, sin movimientos preentrenados. La cámara empieza a grabar al encenderse.
- Esquivar obstáculos y probar en un robot real se prometen como lo que sigue, nunca como hechos.
- Despliegue del plan: todo lo pesado en la Mac de Juan (servidor, extracción, retargeting en Node y entrenamiento de a uno, con tope de cola); la web sigue estática en Vercel. La segunda Mac entrena las precargadas de noche. Sumarla como trabajador remoto queda para después: no hace falta para el domingo.
- Los mundos se definen una sola vez en `physics/worlds/` y los leen el entrenamiento y la web, para que lo que se ve sea lo que se entrenó.
- Las precargadas salen del mismo flujo que un video de usuario (no se hacen a mano).

## Sigue

El detalle, con dueños y horarios, está en [`../plan-producto.md`](../plan-producto.md). En corto:

- Los 4: revisar el pitch y el plan. Ale pasa el pitch al guion de 3 minutos y lo cronometra.
- Juan y Pastor: el cambio de contrato, primero y en un commit aparte.
- Juan: que la imitación aprenda, con empujones prendidos; `--motion <ruta>`.
- Pastor: `policy.js` para políticas de imitación (la observación de 126 de `MimicEnv`, con la referencia suavizada en 0,3 s), probada en `npm run check` contra Python. Antes, traer `5f29ace` a esta rama.
- Después de que la imitación aprenda: piedras, viento, piso resbaloso y física del robot al azar en `training/env.py` y en la escena de `physics/`.
- César: grabar al encender la cámara; una etapa "entrenando" en la web.
- Juan: el servidor encadena retargeting → entrenamiento → export, con el cambio de contrato primero.
