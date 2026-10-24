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
- Observación de imitación con la referencia a 0,1 y 0,25 s (`f17e1e8`): por cada instante, los ángulos y la posición de la pelvis de la referencia respecto de la del robot. `obs_dim` pasa de 126 a 190 (al final, así el export no cambia de lógica) y `policy.json` lleva `lookahead_s`. Entrenamiento `walk-lookahead` de 10 M pasos lanzado en la M5.
- Cambio de contrato propuesto (`261cbd5`, commit aparte): `POST /clips` con sus topes, la cola de entrenamiento (`/train`), los resultados, `--out` del retargeting, los campos nuevos de `policy.json` y la observación de 190, el formato de los datos y los mundos. Marcado "propuesta 2026-10-24".
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
- Entrenamiento `walk-clean` (10 M pasos, referencia limpia, 13,3 min en la M5). Episodio medio de `progress.csv`:

  | Pasos | 0,1 M | 1 M | 3 M | 5 M | 7 M | 10 M |
  | --- | --- | --- | --- | --- | --- | --- |
  | `walk-clean` | 0,54 s | 0,66 s | 0,75 s | **0,93 s** | 1,02 s | 1,03 s |
  | `walk-v2` (Juan, M2) | | | | **0,9 s** | | |

  Desde el inicio del clip (`evaluate_walk.py`): sigue 0,7 s sin entrenar, 1,3 s a los 3 M y 1,0 s a los 10 M, de 11,8 s.
- Entrenamiento `walk-lookahead` (10 M pasos, referencia limpia y observación de 190, 15,5 min en la M5). Episodio medio / recompensa por paso:

  | Pasos | 1 M | 3 M | 5 M | 7 M | 10 M |
  | --- | --- | --- | --- | --- | --- |
  | `walk-clean` | 0,66 s / 0,56 | 0,75 s / 0,56 | 0,93 s / 0,52 | 1,02 s / 0,49 | 1,03 s / 0,47 |
  | `walk-lookahead` | 0,65 s / 0,57 | 0,75 s / 0,58 | 0,89 s / 0,58 | 0,91 s / 0,56 | **1,23 s / 0,52** |

  Desde el inicio del clip sigue 1,4 s (contra 1,0 s de `walk-clean`). De 40 episodios a los 10 M: 27 se cortan por alejarse del recorrido y 13 por caída. Al cortarse, la referencia va 0,5 m adelante en su dirección de avance (mediana): el robot se queda atrás.

## Qué no funcionó

- Sugerí "partir de una política que ya sabe equilibrarse" para que cada video entrene más rápido, y se confundió con `g1-stand` como requisito. Es un atajo opcional y hoy no se puede enchufar (otras entradas, otra acción).
- El primer diagnóstico de ENT-1 en el plan decía "reproducir la referencia solo con los motores". Eso ya lo hace `evaluate_walk.py` (fila "sin política") y no prueba nada: sin red el robot se cae aunque la referencia sea buena. Corregido a reproducirla con la pelvis sostenida y medir el seguimiento de los ángulos y el apoyo de los pies.
- La primera versión del diagnóstico marcaba ángulos "fuera de rango" que se pasaban 0,00 rad: el retargeting los deja justo en el límite. Ahora cuenta solo si se pasan más de 0,01 rad. El deslizamiento medido cada 20 ms se inflaba con el temblor; ahora se mide en ventanas de 0,3 s, como en `physics/README.md`.
- Adelantar el objetivo de cada motor por la amortiguación (`kv/kp × velocidad`) no bajó el error (0,123 → 0,133 rad): el retraso es de inercia, no de amortiguación.
- **La referencia limpia no aceleró el aprendizaje:** a los 5 M pasos, 0,93 s contra 0,9 s de `walk-v2`. Los dos errores de la referencia eran reales, pero no eran lo que frenaba.
- **Por qué terminan los episodios** (40 episodios desde instantes al azar): sin entrenar, 33 por caída y 7 por alejarse del recorrido; a los 10 M, 6 por caída, 33 por alejarse del recorrido (la pelvis a más de 0,6 m de la referencia) y 1 completo. La red aprendió a no caerse, pero no da los pasos para avanzar con la referencia. El techo de ~1 s es ese corte: la referencia avanza a 0,59 m/s y se aleja 0,6 m en 1,0 s. Los 0,9 s de `walk-v2` probablemente son el mismo techo. La recompensa de los pies queda en 0,02 de 0,15: los pies no van donde la referencia pide.
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
- Contrato propuesto: el servidor pone sus propios ids a los clips de la cámara (los ids nombran archivos), entrena de a uno con 3 en espera (~30 min cada uno: el último espera hora y media), no entrena dos veces el mismo clip, y exige `valid_ratio` de 0,8 para entrenar (por debajo, el cuerpo falta en más de 1 cuadro de cada 5). Tope de 5 MB por clip: uno de 30 s a 30 cuadros por segundo pesa ~0,9 MB.
- La posición de la pelvis de la referencia respecto de la del robot es fácil en simulación; un robot real necesitaría odometría para saberla. Queda anotado para cuando se trabaje el paso a un robot real.

## Sigue

El detalle está en [`../plan-producto.md`](../plan-producto.md). En corto:

- El equipo: revisar el pitch y el plan, y repartir las tareas.
- Primero, el cambio de contrato, en un commit aparte.
- Lo crítico: que la imitación aprenda la caminata (ENT-1), con punto de control el sábado a las 12:00.
- **Premiar la velocidad de la pelvis tampoco cambia el cuadro** (`walk-speed`, 10 M pasos): 1,27 s por episodio contra 1,23 s, 1,3 s desde el inicio del clip, y de 40 episodios 29 se cortan por alejarse y 11 por caída. El robot avanza a 0,47 m/s cuando la referencia va a 0,78, y se mueve 0,50 m/s de costado: se tambalea de lado para no caerse y eso le come el avance. Parece equilibrio al caminar, no falta de información ni de premio. El premio se queda: no empeora nada.
- **Mirar adelante ayuda poco:** sigue mejor la pose y aguanta algo más, pero el robot sigue sin avanzar con la referencia. Se queda (shipeado en `9d2bab0`) porque no empeora nada y la red ve dónde está el recorrido.
- SIM-1 y SIM-2 hechos: el navegador corre políticas de imitación (`physics/src/reference.js`, la limpieza de `imitate.Motion` portada número por número; `policy.js` con la observación de 190; `view.loadPolicy(onnx, json, { motion })`). `scripts/check-mimic.mjs` pone al robot en 40 estados grabados por `training/browser_fixture.py` y exige lo mismo que Python: observación igual a 3e-8, objetivos a 3e-7 rad, y con la limpieza rota a propósito falla (0,21). Desde la primera pose, con la física del navegador, sigue el clip 1,3 s, lo mismo que Python. Las cápsulas de los pies no son esferas: su punto más bajo es el centro menos media longitud por la inclinación del eje menos el radio, verificado igual a `mj_geomDistance` (diferencia 0).
- **Robot sin temblor en toda la web** (pedido de Pastor: se veía inestable de la pelvis para abajo aunque no se cayera). No eran pocos puntos (MediaPipe da 33 fijos): era el temblor cuadro a cuadro, y la vista mostraba el `RobotMotion` crudo. `playClip` ahora muestra `smoothForDisplay` (la referencia limpia del entrenamiento más la altura de la pelvis suavizada 0,2 s): aceleración vertical de la pelvis 24,4 → 5,0 m/s² en la caminata, rodilla 191 → 91 rad/s², pies a menos de 1,5 cm del piso. En vivo, `createRobotPoseFilter` (One Euro sobre la pose del robot): pelvis 22,2 → 5,4 m/s², rodilla 166 → 66, con 33 ms de retraso. Probé 0,15/0,2/0,3 s para la altura (0,3 suaviza más pero los pies flotan 1,9 cm) y curvas de interpolación (no cambian nada: quedó lineal). `reference.js` ahora encuentra los pies por cuerpo y tipo (cápsulas en el modelo de entrenamiento, esferas en el de cinemática); `check-mimic` sigue igual a Python. Nueva prueba `check-smooth.mjs`. En el navegador: 60 cuadros por segundo parejos en Simulaciones y la portada.
- WEB-4, primera versión (toca `web/`, de César: `policies.js`, `screens/simulations.js`, `stage.js`, y W3.7 en `web/TAREAS.md`): en Simulaciones, para Caminar, "Robot entrenado con" ofrece "Imitando el video, con física (en entrenamiento)". El robot hace el clip con `g1-walk` y su `RobotMotion`, el esqueleto sigue el reloj del robot, y elegir otro clip vuelve a la política de pie. Probado en el navegador: camina ~1,3 s, se cae y vuelve a empezar; cambiar a piso resbaloso mantiene la imitación; Correr vuelve a `g1-stand` con la opción deshabilitada.
- `physics/src/policy.js`: una política de imitación que se cae vuelve a empezar el clip 1 s después (la caída del entrenamiento), en vez de quedar tirada hasta que termina.
- `training/policies/g1-walk`: la mejor política de imitación de hoy (`walk-speed`, 10 M pasos), para que la web pueda mostrarla. Todavía no camina: se reemplaza cuando haya una mejor.
- La web no compilaba en esta Mac porque faltaba instalar una fuente nueva de la landing (`npm install` en `web/`); no era un problema del código.
- ENT-2 (`--task mimic --motion <archivo o clip_id>`) y SIM-4 (`retarget --out`) hechos: un clip de usuario ya puede ir de `PoseClip` a política con comandos.
- ENT-1, próximas pruebas, de la más directa a la de respaldo:
  1. Más práctica: 30 M pasos con todo lo de hoy (la curva todavía sube de 1,04 a 1,27 s entre los 7 M y los 10 M). Lanzado en la M5 como `walk-long`.
  2. Un movimiento en el lugar (jumping jacks, brazos, baile sin desplazarse): no tiene recorrido del que alejarse, que es justo donde falla hoy. Se puede grabar con la página de `data/live` (tiene botón Grabar), pasar por `npm run retarget` y revisar con `diagnose_reference.py`.
  3. Reproducir la referencia más lenta al principio (por ejemplo a la mitad de velocidad) y acelerarla a medida que aprende, para que los primeros pasos sean más fáciles.
  4. Más pasos (30 M o más) en las dos Macs, si la curva sigue subiendo con 1, 2 o 3.
- El cambio en `imitate.Motion` afecta a cualquier entrenamiento de imitación nuevo: avisar a quien esté entrenando antes de shipearlo.
