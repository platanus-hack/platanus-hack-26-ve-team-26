# En qué se diferencia Tridi de lo que ya existe

- **Fecha:** 2026-10-23 · **Quién:** Ale · **Estado:** vigente, para revisar entre los 4

Investigación hecha para responder la última línea de la [decisión de la idea](../decisiones/2026-10-23-idea-tridi.md): *"existen trabajos de video → robot. Hay que tener lista la diferencia antes del domingo."* Los jueces buscan en internet y le piden a un agente que busque ([capítulo 10](../../../platanus-ideas/docs/preparacion/10-bienvenida-caracas.md): originalidad, 15 %). Esto es lo que van a encontrar y qué contestamos.

## Lo primero, sin adornos

**Video del celular → robot humanoide en el navegador ya existe, es gratis y es open source.** Se llama **Ultimate Bots Studio**, salió alrededor del **7 de mayo de 2026**, y usa casi nuestro mismo stack: MuJoCo compilado a WebAssembly, ONNX Runtime Web y un Unitree G1, todo corriendo en el navegador del visitante. Si entramos al pitch diciendo "somos los primeros en llevar un robot que aprende de un video al navegador", el agente del juez lo desmiente en una búsqueda y perdemos originalidad y confianza en la misma frase.

La buena noticia son dos, y las dos se sostienen solas:

1. **Ninguno de los que existen entrena una política con el video del usuario.** Ultimate Bots *retargetea* el movimiento y lo evalúa con **GEAR-SONIC de NVIDIA**, un modelo base de control que ya venía entrenado.
2. **Lo de ellos es un visor; lo nuestro es un entorno de simulación con su entorno de entrenamiento.** El solver (MuJoCo) es el mismo, pero el mundo, el lazo, el test de física y la recompensa son nuestros, y están en el repo para leerlos.

## Lo que existe

### Productos (lo que un juez encuentra primero)

| Qué | Cuándo | Qué hace | Qué comparte con Tridi | Qué no tiene |
| --- | --- | --- | --- | --- |
| **Ultimate Bots Studio** ([studio](https://www.ultimatebots.com/studio)) | ~7 may 2026, gratis, open source y hosteado | "Record someone moving on your phone, upload the clip, and Studio automatically converts it into robot motion." Todo en el navegador: física y red neuronal | **Casi todo el stack:** video del celular, navegador, MuJoCo WASM, ONNX Runtime Web, G1, sin cuenta ni descargas | **No entrena nada con tu video:** retargetea y evalúa con GEAR-SONIC, modelo base ya entrenado de NVIDIA. No elige entre varias personas en el video. Nada de dedos |
| **AgiBot LinkCraft** ([nota](https://interestingengineering.com/innovation/phone-videos-teach-humanoid-robot-moves)) | 28 oct 2025, beta pública | Subes un video del celular y el robot **físico** AgiBot X2 replica el movimiento. "AI motion capture, cloud-based imitation learning" | La entrada (video de celular) y la idea de que el robot aprenda, no que copie en vivo | No es navegador ni open source; es su robot y su nube. El control fino de dedos está "planeado" |
| **hhtools** ([repo](https://github.com/notAnyrobot/human-humanoid-tools)) y **video2robot** ([repo](https://github.com/AIM-Intelligence/video2robot)) | Open source | Web UI con panel "Video → Motion": un video, GVHMR, biblioteca de movimientos y retargeting al robot | El pipeline de video a movimiento de robot con interfaz web | Retargeting, no entrenamiento. Son herramientas para investigadores, no una app que el público prueba |
| Demos en el navegador: **mujoco-playground**, **wbc-demo**, **humanoid-policy-viewer**, **mjswan** | 2025–2026 | Política ya entrenada, exportada a ONNX, corriendo con MuJoCo WASM + three.js en el navegador | **Exactamente nuestra pieza de "mostrar al robot"** | No hay entrada de video: la política ya viene hecha |

**Consecuencia:** la parte "MuJoCo en el navegador" no es un logro, es un componente. No la vendamos como hallazgo; el jurado técnico sabe que existe `@mujoco/mujoco`.

### Investigación (lo que pregunta un juez que sabe)

| Trabajo | Qué hace | Por qué no somos eso |
| --- | --- | --- |
| **VideoMimic** ([2505.03729](https://arxiv.org/html/2505.03729v1)) | Video monocular → reconstruye persona **y escena** a escala métrica → política RL → **G1 físico** subiendo escaleras y sentándose, con LiDAR a bordo | Es el papá de la idea y llega a hardware real. Nosotros no tenemos robot: nos quedamos en simulación, y hay que decirlo |
| **HDMI** ([2509.16757](https://arxiv.org/pdf/2509.16757)) | Video → trayectorias de persona **y objeto** → RL → G1 real sin ajustes | Nosotros no seguimos objetos |
| **MeshMimic** ([2602.15733](https://bytez.com/docs/arxiv/2602.15733/paper)), **GenMimic** ([2512.05094](https://arxiv.org/html/2512.05094)), **MimicX** ([2610.09055](https://arxiv.org/html/2610.09055)) | Refinamientos de 2026: geometría de la escena, videos generados, y corregir la supervisión con los fallos de la propia política | Son el estado del arte de este año. Mencionarlos nosotros primero nos da credibilidad |
| **HumanPlus** ([2406.10454](https://arxiv.org/pdf/2406.10454)) | *Shadowing* en tiempo real con una sola cámara RGB, sobre una política entrenada con 40 h de mocap | Esto es lo que hacía Sombra: **copiar en vivo**. Tridi existe justamente para no ser esto |
| **ASAP** (arXiv 2502.01143) | Alinea la física del simulador con la real para movimientos ágiles | Es el problema sim2real, que nosotros no tocamos |
| **GR00T-Mimic / GR00T-Dreams** (NVIDIA) | Mimic **no es** video → robot: toma pocas demostraciones y las multiplica en datos sintéticos (v1, un solo brazo). El de video es **Dreams**, que genera video desde una imagen | **Corrección al doc de decisión:** ahí GR00T-Mimic aparece como competidor de video → robot y no lo es. Si lo decimos mal, un juez de NVIDIA nos corrige en vivo |

## La diferencia de Tridi, de más a menos defendible

### 1. El simulador es nuestro; el solver es de todos

Lo honesto primero, porque el agente del juez abre `physics/package.json` y ve `@mujoco/mujoco`: **la física la resuelve MuJoCo**, igual que en Ultimate Bots, igual que en Google DeepMind y en NVIDIA. Nadie escribe un integrador de contacto en 36 horas, y presumir de eso es la manera más rápida de perder al juez que sí sabe. Nuestra propia [decisión de la idea](../decisiones/2026-10-23-idea-tridi.md) ya lo dice: *"MuJoCo y no un motor desde cero… lo nuestro es la escena, el render, el pipeline de datos y el entrenamiento"*.

Y resulta que eso es mucho más de lo que suena. **MuJoCo es el solver, como OpenGL es el driver: lo que uno construye encima es el simulador.** Todo esto está en `physics/` y se puede leer:

| Qué es nuestro | Dónde | Por qué un juez técnico lo valora |
| --- | --- | --- |
| **El lazo de simulación:** pasos fijos de 2 ms (500 por segundo) sincronizados con el reloj de pared, con un techo de recuperación de 1/30 s para que una pestaña oculta no congele la página | `physics/src/sim.js` | Es una decisión de ingeniería con el porqué escrito al lado, que es lo que pide el repo |
| **El visor genérico:** un objeto de three.js por cada geometría de MuJoCo. No sabe nada del G1: dibuja cualquier MJCF | `physics/src/viewer.js` | Arquitectura, no demo. El día que cambie el robot no se reescribe nada |
| **La misma física corriendo sin navegador:** `npm run check` usa el mismo WASM en Node y comprueba que el robot aguante 10 s de pie y se caiga al empujarlo | `physics/scripts/check.mjs` | **Es un test de física.** Casi ningún proyecto de hackathon tiene uno |
| **El empujón de verdad:** 250 N durante 0,1 s en el torso (25 N·s, unos 0,75 m/s sobre 33 kg) | `physics/src/sim.js` | Es física, no animación. Y es el botón que demuestra si la política aprendió algo |
| **El entorno de entrenamiento:** observaciones, acciones, recompensa de imitación y condición de caída | `training/` (pendiente) | **La pieza que nadie regala.** Un entorno de RL *es* lo que uno desarrolla; el solver se instala con `npm install` |
| **Todo en el navegador del visitante, sin servidor de física:** 500 pasos/s a tiempo real y 60 fps; 25.000 pasos/s en Node, 50 veces el tiempo real | `physics/README.md` | Números medidos en una Mac M5, con fecha |

**La frase:**

> "La física la resuelve MuJoCo, el mismo simulador que usa Google DeepMind. Pero **el mundo donde el robot aprende lo construimos nosotros**: la escena, el visor, el lazo, el test de física y el entorno de entrenamiento con su recompensa.
> Ellos tienen un visor con un robot adentro. Nosotros tenemos el mundo donde ese robot aprendió. **Por eso ustedes lo pueden empujar.**"

**Y el remate, que es el que desarma la pregunta de originalidad:** que el público pueda empujar al robot en vivo es algo que un previsualizador de movimiento no puede ofrecer. Un video de un robot no se deja empujar. Es la prueba, en dos segundos y sin explicar nada, de que detrás hay un mundo con física y no una animación retargeteada.

### 2. Entrenamos la política; los demás la prestan

Ultimate Bots evalúa tu movimiento con GEAR-SONIC, un modelo base de NVIDIA ya entrenado. Nosotros entrenamos una red pequeña desde cero, por imitación + PPO dentro de MuJoCo, en una Mac, por clip.

Nuestro robot es **peor** que el suyo, y eso está bien: *nosotros construimos el lazo de aprendizaje, no lo alquilamos.* Es la única diferencia que el agente del juez puede **verificar en el repo**: la función de recompensa, el PPO, el checkpoint, el ONNX. Eso es el 25 % de la nota (aspecto técnico).

**La frase:** "El robot de los demás ya sabía caminar. El nuestro aprendió con tu video, y se cayó mil veces antes."

### 3. Varios videos, un comportamiento

Todo lo que existe es **un video → un clip de movimiento**. Un movimiento por video, y se acabó. La [decisión de la idea](../decisiones/2026-10-23-idea-tridi.md) dice otra cosa: que el robot aprenda de **muchos** videos y después se mueva solo. Si el domingo mostramos una política entrenada con *N* clips que se sostiene sin caerse, eso no lo tiene ninguno de los cinco productos de arriba.

**Es también nuestro mayor riesgo:** si al final solo mostramos un clip retargeteado, somos un Ultimate Bots peor. Hay que decidirlo temprano, no el domingo a las 9.

### 4. El video del mundo real tiene más de una persona

Los demás asumen un video limpio con una sola persona de cuerpo entero. Nuestra decisión ya incluye **elegir y seguir al sujeto** (YOLO pose + ByteTrack, automático y corregible con un click en el primer frame).

Es la diferencia más chica y la **más fácil de demostrar en 15 segundos**: se sube un video de una cancha o de una calle, hay cinco personas, el jurado hace click en una, y el robot aprende de esa. Ningún competidor aguanta ese video.

## Lo que NO podemos decir

| No decir | Por qué | Decir en su lugar |
| --- | --- | --- |
| "Somos los primeros en pasar de video a robot" | VideoMimic (2025) ya lo hizo y llegó a un robot físico | "Esto lo empezó VideoMimic el año pasado, con un laboratorio y un robot de 16.000 dólares" |
| "Somos los primeros en el navegador" | Ultimate Bots Studio, gratis y open source, desde mayo | "La parte de mostrar física en el navegador ya es un componente; lo nuestro es lo que pasa antes" |
| "No necesitas GPU ni cuenta" | Tampoco en Ultimate Bots | Usarlo como comodidad, nunca como diferencia |
| "Tenemos nuestro propio motor de física" | `physics/package.json` declara `@mujoco/mujoco` 3.16.0 y el G1 es el de MuJoCo Menagerie **sin cambios**. El agente del juez lo ve en diez segundos, y ahí se cae todo lo demás que digamos | "El solver es MuJoCo, como en todos. El simulador —escena, visor, lazo, test de física y entorno de entrenamiento— es nuestro" |
| "Un LLM aprende a caminar" | Es falso y es la frase que más rápido nos hunde con un jurado técnico | "Una política neuronal pequeña, entrenada por imitación y refuerzo" |
| "El robot aprendió en vivo" (si mostramos un checkpoint) | El entrenamiento real toma horas en Mac | "Esto se entrenó anoche en esta laptop, en X minutos y Y pasos; lo que ven ahora es la política entrenada" |

## Lo que hace falta para que la diferencia sea verdad

Para Pastor, Juan y César, en orden de cuánto le suman al pitch:

1. **Un checkpoint intermedio guardado, no solo el final** (Pastor / training): con 4 checkpoints (0, 1k, 10k, 100k pasos) se arma *la escalera del aprendizaje*: cuatro robots lado a lado con el mismo clip, el primero se cae de una, el último aguanta. **Es el mejor plano del pitch, es 3D puro y es la prueba visual de que entrenamos.** Nadie lo muestra. Cuesta guardar un archivo cada tanto.
2. **Una política entrenada con más de un clip** (training): es el punto 2 de arriba, nuestra ambición (20 %).
3. **El botón de empujar, visible y sin scroll en la app desplegada** (César): `physics/` ya lo expone como `view.push()`. Es cuatro segundos del pitch y es lo que convierte "miren el robot" en "empújenlo ustedes". Cuando haya política, el mismo botón demuestra que aprendió a recuperarse.
4. **Un video difícil en la galería de precargadas** (Juan / César): varias personas, para el punto 4.
5. **Que el número de pasos y el tiempo de entrenamiento salgan en pantalla** (César): "13 min en una MacBook, 120k pasos". Un número medido vale más que un adjetivo.

## Fuentes

Productos: [Ultimate Bots Studio](https://www.ultimatebots.com/studio) · [RoboHorizon, 7 may 2026](https://robohorizon.com/en-us/news/2026/05/ultimate-bots-studio-lets-you-animate-humanoids-in-your-browser/) (secundaria: de ahí salen MuJoCo WASM, ONNX Runtime Web, G1 y GEAR-SONIC, que la página oficial no nombra) · [AgiBot LinkCraft, 28 oct 2025](https://interestingengineering.com/innovation/phone-videos-teach-humanoid-robot-moves) · [hhtools](https://github.com/notAnyrobot/human-humanoid-tools) · [video2robot](https://github.com/AIM-Intelligence/video2robot) · [mujoco-playground](https://github.com/pgeedh/mujoco-playground) · [wbc-demo](https://github.com/wbc-mjlab/wbc-demo) · [humanoid-policy-viewer](https://github.com/menloresearch/humanoid-policy-viewer)

Investigación: [VideoMimic](https://arxiv.org/html/2505.03729v1) · [HDMI](https://arxiv.org/pdf/2509.16757) · [MeshMimic](https://bytez.com/docs/arxiv/2602.15733/paper) · [GenMimic](https://arxiv.org/html/2512.05094) · [MimicX](https://arxiv.org/html/2610.09055) · [HumanPlus](https://arxiv.org/pdf/2406.10454) · [SUGAR](https://arxiv.org/pdf/2605.20373) · [Isaac GR00T Blueprint](https://blogs.nvidia.com/blog/isaac-gr00t-blueprint-humanoid-robotics/)

Contexto del equipo: `../../../platanus-ideas/docs/preparacion/` (capítulos 8, 9 y 10).
