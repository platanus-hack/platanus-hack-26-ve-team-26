---
persona: Pastor
rama: pastor/fisica
sesion: 4c321158-5a20-42b9-8d40-fb50c70005ff
inicio: 2026-10-24 02:49
estado: en curso
---

# La visión del producto contra el repo, el pitch para la Physical AI, su plan técnico y el diagnóstico de la imitación

## Objetivo

Comparar el repo con la visión del producto: video o cámara → esqueleto 3D → un robot simulado que aprende a moverse imitando ese video, sin caerse ante empujones y en entornos variados, con datos que sirvan para robots reales. Dejar escritos el pitch y el plan técnico para terminarlo.

## Qué se hizo

- Revisión de `docs/estado.md`, las bitácoras, el contrato, `physics/`, `training/` y `web/`, incluido el commit `5f29ace` (imitación), que está en `origin/main` y todavía no en esta rama.
- Pitch del producto en [`../pitch/pitch-producto.md`](../pitch/pitch-producto.md), con una tabla que separa lo que es verdad hoy de lo que es plan. No reemplaza el guion de 3 minutos.
- Plan técnico en [`../plan-producto.md`](../plan-producto.md): el flujo completo en 7 pasos, dónde corre cada parte, los cambios de contrato propuestos (`POST /clips`, cola de entrenamiento, políticas, datos y mundos), lo que falta construir por área (ENT, SIM, SRV, WEB, DOC) con sus dependencias, y el orden por horario hasta el cierre. Puntero en mi sección de [`../estado.md`](../estado.md).
- La primera versión del plan asignaba tareas por persona; a pedido de Pastor se rehízo como plan general, por área y sin dueños. Shipeado en `8078d4c`.
- ENT-1, primer paso: `uv` instalado en la Mac de Pastor (M5, 10 núcleos) y `training/diagnose_reference.py`, que revisa una referencia de imitación sin política en 2 s: pies contra el piso, objetivos de los pies de la recompensa, rangos de los motores, y la referencia jugada por los motores con la pelvis sostenida (error, retraso por motor, contacto de los pies).
- Arreglo en `imitate.Motion` (la limpieza de la referencia): articulaciones suavizadas 0,1 s, pelvis suavizada solo en el plano del piso, altura de la pelvis puesta cuadro a cuadro para que la esfera más baja de los pies del modelo de entrenamiento toque el piso, y objetivos de los pies sacados de esa pose final.

## Qué se encontró (para quien siga)

- **La imitación ya sirve para cualquier clip.** `MimicEnv` (`training/imitate.py`) sigue cualquier `RobotMotion`. Se llama `walk` solo porque su clip por defecto es la caminata y `vec.py` no le pasa otro. Falta poder pasarle el archivo (`--motion <ruta>`).
- **`g1-stand` no es un paso previo de la imitación.** La imitación arranca de cero (`ppo.py` solo carga pesos con `--init`), y los de la política de pie no encajan (93 entradas contra 126). El equilibrio se aprende dentro de la imitación: caerse corta el episodio y le quita la recompensa que le quedaba.
- **El navegador no puede correr una política de imitación.** `physics/src/policy.js` solo acepta la observación de 93 números.
- **La cámara en vivo no guarda nada.** `createLiveCapture` ya tiene `startRecording`/`stopRecording` (devuelven un `PoseClip`), pero `web/` no los usa (W4.3), y no hay endpoint para mandarle un `PoseClip` al servidor.
- **El servidor termina en el `PoseClip`.** Retargeting, entrenamiento y export no están encadenados. `npm run retarget` escribe siempre en `physics/motions/` (versionada).
- **El entrenamiento no varía el entorno.** Piso plano, fricción fija en 1, sin viento. Solo hay empujones (apagados en `MimicEnv`) y ruido en la pose inicial.
- **Robots reales:** la observación de la política de pie usa solo lo que mide un G1 (giróscopo e inclinación de la pelvis, ángulos y velocidades de motores). La de imitación agrega la altura real de la pelvis (índice 125), que un robot real no mide directo.

## Qué funcionó

- El análisis y los documentos salen de leer el repo y el historial de git.
- Diagnóstico de la caminata (`clip_2026-10-23_caminar-perfil_01`), antes → después del arreglo:

  | Qué | Antes | Después |
  | --- | --- | --- |
  | Cuadros con un pie hundido más de 1 cm | 10 % | 0 % |
  | Cuadros con los dos pies a más de 2 cm (caminando no hay vuelo) | 7 % | 0 % |
  | Objetivos de los pies contra la pose: mediana (máxima) | 2,1 cm (12,7) | 0,1 cm (1,0) |
  | Error de las piernas con la pelvis sostenida | 0,123 rad | 0,123 rad |

- El error que queda no es la gravedad (0,016 rad con la pose quieta) ni el piso (0,102 rad sin contacto): es retraso. Caderas y tobillos siguen la referencia 60 a 100 ms tarde (kp = 75 y 20 con kv = 2 en `scene_mjx.xml`), y la observación muestra la referencia solo 20 ms adelante.
- Con la referencia limpia el entrenamiento corre (`ppo.py --task walk`, 20 k pasos de prueba) a 14.400 pasos/s en la M5.

## Qué no funcionó

- Sugerí "partir de una política que ya sabe equilibrarse" para que cada video entrene más rápido, y se confundió con `g1-stand` como requisito. Es un atajo opcional y hoy no se puede enchufar (otras entradas, otra acción).
- El primer diagnóstico de ENT-1 en el plan decía "reproducir la referencia solo con los motores". Eso ya lo hace `evaluate_walk.py` (fila "sin política") y no prueba nada: sin red el robot se cae aunque la referencia sea buena. Corregido a reproducirla con la pelvis sostenida y medir el seguimiento de los ángulos y el apoyo de los pies.
- La primera versión del diagnóstico marcaba ángulos "fuera de rango" que se pasaban 0,00 rad: el retargeting los deja justo en el límite. Ahora cuenta solo si se pasan más de 0,01 rad. El deslizamiento medido cada 20 ms se inflaba con el temblor; ahora se mide en ventanas de 0,3 s, como en `physics/README.md`.
- Adelantar el objetivo de cada motor por la amortiguación (`kv/kp × velocidad`) no bajó el error (0,123 → 0,133 rad): el retraso es de inercia, no de amortiguación.
- La carrera (`correr-perfil`) no sirve como referencia por ahora: el pie "apoyado" se mueve a 2,3 m/s, casi lo mismo que la pelvis. Es la profundidad de MediaPipe, ya anotada como límite en `data/`.

## Decisiones

Propuestas por Pastor, pendientes del equipo. Cuando se acepten, van a [`../decisiones/`](../decisiones).

- Nicho: Physical AI. Cliente: empresas de humanoides; empresas de hardware después (una frase en el pitch).
- No vendemos robots ni motor de física: vendemos el simulador de entornos sobre MuJoCo.
- Se entregan dos cosas: la política (ONNX) y los datos corregidos por la física.
- Cada video del usuario se entrena por imitación, en cola, sin movimientos preentrenados. La cámara empieza a grabar al encenderse.
- Esquivar obstáculos y probar en un robot real se prometen como lo que sigue, nunca como hechos.
- Despliegue: todo lo pesado en la Mac del servidor (extracción, retargeting en Node y entrenamiento de a uno, con tope de cola); la web sigue estática en Vercel. Una segunda Mac entrena las precargadas de noche.
- Los mundos se definen una sola vez en `physics/worlds/` y los leen el entrenamiento y la web, para que lo que se ve sea lo que se entrenó.
- Las precargadas salen del mismo flujo que un video de usuario (no se hacen a mano).
- El plan no reparte tareas: lo reparte el equipo.
- La limpieza de la referencia vive en `imitate.Motion`, porque depende del modelo de entrenamiento (las esferas de sus pies). El navegador (SIM-1) tiene que repetir exactamente esa limpieza.

## Sigue

El detalle está en [`../plan-producto.md`](../plan-producto.md). En corto:

- El equipo: revisar el pitch y el plan, y repartir las tareas.
- Primero, el cambio de contrato, en un commit aparte.
- Lo crítico: que la imitación aprenda la caminata (ENT-1), con punto de control el sábado a las 12:00.
- ENT-1: entrenar con la referencia limpia y comparar con `walk-v2` (0,9 s por episodio a los 5 M pasos). Si sigue lento, sumar a la observación la referencia más adelante (0,1 y 0,25 s) para que la red se anticipe al retraso de los motores; cambia `obs_dim`, así que hay que decidirlo antes de SIM-1.
- El cambio en `imitate.Motion` afecta a cualquier entrenamiento de imitación nuevo: avisar a quien esté entrenando antes de shipearlo.
