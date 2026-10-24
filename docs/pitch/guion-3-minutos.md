# Guion de 3 minutos: borrador 5, cronometrado

> **⚠️ Superado el 24 de octubre.** El formato cambió a **1 minuto de láminas + 2 minutos de video de demo**: [`guion-1-minuto.md`](guion-1-minuto.md). Queda el banco de preguntas del jurado.

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** cronometrado sobre el papel, falta leerlo en voz alta con reloj
- **Borrador 5:** entra el relato de [`relato.md`](relato.md), verificado contra el repo: por qué copiar el video no alcanza, y el LLM dicho en positivo.
- **Borrador 4:** alineado con [`../marca.md`](../marca.md): el mismo titular y las mismas tres cifras que la web. El bloque "por qué" pasa a decir para quién es, y el cierre pasa a ser el titular.
- **Borrador 3:** la escalera del aprendizaje con los números medidos de `training/` (y dicha por lo que es: sostenerse de pie, no imitar el clip), y el empujón convertido en comparación porque la política de hoy aguanta los cuatro de 250 N.

Formato: **3 minutos de demo + 2 de preguntas**, domingo entre 10:00 y 14:00. Reglas que condicionan todo el guion ([capítulo 10](../../../platanus-ideas/docs/preparacion/10-bienvenida-caracas.md)):

- **Demo en vivo antes del minuto 1.** "Si llegan con una landing page, no tienen ningún punto en ejecución".
- **El público prueba la app durante la presentación**, desde su celular.
- **El agente del juez lee el repo mientras hablamos.** Todo lo que diga este guion tiene que coincidir con el código.
- **El modelo de negocio no suma.** No se menciona.

Pesos: técnico 25 %, ambición 20 %, ejecución 20 %, impacto 20 %, originalidad 15 %.

## El mensaje: el mismo que la web

De [`../marca.md`](../marca.md). El pitch y la landing dicen **lo mismo, con las mismas palabras y las mismas cifras**: el jurado va a oír el pitch y después abrir la web, y cualquier diferencia entre los dos se lee como improvisación.

- **Titular (se dice tal cual en el cierre):** "Datos de movimiento humano para robots humanoides, desde cualquier video."
- **Bajada (no se dice; es el norte del tono):** "Tridi convierte video de personas reales en movimiento 3D y en políticas entrenadas en simulación física. Sin estudios de captura, sin trajes, sin teleoperación."
- **Las tres cifras, una por bloque de la demo:**

| Cifra | Dónde se dice | Fuente |
| --- | --- | --- |
| Elige y sigue a una persona entre varias; 10 s de video en ~40 s | Gancho (0:00) | [`data/README.md`](../../data/README.md) |
| Retargeting al G1 con **3,2 cm de error mediano** | Copiar no es aprender (0:50) | [`physics/README.md`](../../physics/README.md) |
| **4 de 4 empujones de 250 N**, con una política entrenada en **73 minutos** en una laptop | Escalera (0:16) y empujón (1:13) | [`training/README.md`](../../training/README.md) |

**Prohibido, aquí y en la web:** la palabra "clientes" o "socios", y cualquier logo o nombre de empresa presentado como tal. Tesla, Figure o Unitree son **el tipo de comprador**, no compradores nuestros. Se dice "los equipos que están construyendo humanoides". Lo demás que no se puede decir está en [`diferencia.md`](diferencia.md#lo-que-no-podemos-decir).

## Cómo está cronometrado

El borrador 1 no cabía: **225 segundos de puro hablar en una ventana de 180**, y eso sin contar un solo segundo de mirar la pantalla. Medido con [`tools/cronometro.py`](tools/cronometro.py), que cuenta las sílabas de las líneas habladas y las divide por la velocidad de habla (las indicaciones de escena en cursiva no cuentan).

| Velocidad | Qué es |
| --- | --- |
| 3,8 sílabas/s | Hablando calmado, con pausas |
| **4,2 sílabas/s** | **La que usamos para presupuestar**: ritmo claro de presentación |
| 4,8 sílabas/s | Apurado por los nervios, que es lo que pasa de verdad en el escenario |

**Este borrador, medido: 147 s de habla + 24 s de pantalla = 171 s, con 9 s de margen** dentro de los 180. Los 24 s de pantalla son las tres marcas "Pantalla, N s" (8 + 10 + 6). La ventana de cada bloque de abajo no es un deseo: es su habla medida más sus segundos de pantalla, y las siete suman exactamente 3:00.

El mensaje de marca costó unos 10 s (el titular en el cierre y dos cifras nuevas) y el relato otros 8 ("si copia el video, se cae" y la apertura de "ya tienen cuerpo"), pagados dos veces con el mismo método: la escalera dejó de enumerar los cuatro checkpoints uno por uno (están rotulados en pantalla) y el bloque de la diferencia se encogió, porque ahora el argumento de fondo lo carga el bloque de la cámara. Con adrenalina uno habla más rápido (a 4,8 sílabas/s esto baja a 128 s y sobran 28), pero también mete palabras que no estaban. **Si al leerlo en voz alta se pasa, lo primero que se corta es el bloque de "para quién", no la demo.**

Para recronometrar después de cualquier cambio:

```bash
python3 docs/pitch/tools/cronometro.py docs/pitch/guion-3-minutos.md 4.2
```

---

## El guion

### 0:00–0:18 · El gancho (ejecución)

**En pantalla:** la app abierta, sin slides. Un `.mp4` vertical de celular.

> "Este video lo grabé con un celular. Hay varias personas; le digo cuál me importa. *[click]*
> Cuarenta segundos después, esto."

*El número de personas se dice según el clip que se use ese día: lo que está medido es que elige y sigue al sujeto entre varios, y que 10 s de video salen en unos 40 s ([`data/README.md`](../../data/README.md)). Si el clip tiene tres, se dice tres.*

**Pantalla, 8 s:** esqueleto 3D sobre el video → el G1 caminando en la escena. Silencio. Dejarlo caminar.

### 0:18–0:58 · La escalera del aprendizaje (técnico)

**En pantalla:** cuatro robots lado a lado, el mismo empujón, distintos checkpoints.

> "Eso era copiar. *[los cuatro]*
> El mismo robot aprendiendo a sostenerse solo. Sin entrenar se cae en un segundo. A los diez millones de pasos aguanta diez. A los cuarenta millones, los veinte segundos completos y los cuatro empujones.
> Nadie le programó cómo pararse: le dijimos qué cuenta como estar de pie, y se cayó decenas de miles de veces.
> Setenta y tres minutos en esta laptop, sin GPU."

**Pantalla, 10 s:** los cuatro checkpoints corriendo a la vez, con su número de pasos encima. Es el plano que más vale del pitch.

*Los números son los medidos en [`training/README.md`](../../training/README.md) con `evaluate.py` (5 arranques de 20 s; empujón de 250 N y 0,1 s en el torso a los 4, 8, 12 y 16 s, desde los cuatro lados):*

| Checkpoint | De pie | Empujones de 250 N aguantados |
| --- | --- | --- |
| `step-0`, sin entrenar | 1,1 s | 0 de 4 |
| 3 M pasos | 4,2 s | 0 de 4 |
| 10 M | 9,6 s | 1,2 de 4 |
| 20 M (`stand-v1`) | 13,4 s | 2,2 de 4 |
| **40 M (`g1-stand`, la de hoy)** | **20 s, los completos** | **4 de 4** |

*Dos cosas que el guion no puede decir mal, porque el agente del juez abre `training/`:*

- *La escalera es de **sostenerse de pie y aguantar empujones**, no de imitar el clip. La imitación de un `PoseClip` es el bloque siguiente y hoy es cinemática (retargeting), no una política entrenada. Decir "aprendió a caminar con tu video" sería falso.*
- *"Decenas de miles de caídas" sale de la cuenta, no del aire: 40 M pasos de política a 50 decisiones por segundo son 800.000 s simulados; con episodios de 20 s son unos 40.000 intentos, y al principio duraban un segundo, así que fueron más.*

### 0:58–1:26 · Copiar no es aprender (técnico)

**En pantalla:** cámara en vivo, el G1 copiando a quien presenta.

> "Esto sí es copiar: la cámara, el esqueleto, los ángulos del robot. Veintinueve articulaciones, tres coma dos centímetros de error mediano.
> Pero el robot tiene otro peso y otras proporciones: lo que la persona hace es imposible para él. **Si copia el video, se cae.**
> El video le dice qué hacer. La simulación le enseña cómo."

*La cámara entra acá y no al principio a propósito: es la forma más rápida de que se entienda el pipeline (persona → esqueleto → robot) y de dejar clara la diferencia con todo lo que ya existe.*

*"Si copia el video, se cae" es el mejor argumento técnico que tenemos y es literal: el retargeting es cinemático, y ese mismo movimiento soltado con física tumba al robot. Es también la respuesta a "¿y Ultimate Bots?": lo que ellos hacen es exactamente copiar.*

### 1:26–1:59 · Pruébenlo, y empújenlo (ejecución y originalidad)

**En pantalla:** QR grande. **Antes del empujón hay que darle a "Reiniciar"** (copiar la cámara es cinemático: con el robot en modo títere el empujón no hace nada).

> "Está desplegado y es open source. Abran el QR y suban un video suyo: mientras se procesa van a ver estas simulaciones, nunca una pantalla en blanco.
> Y hagan una cosa más: **empújenlo.** *[empujón en vivo]*
> Doscientos cincuenta newtons sobre treinta y tres kilos, y **se queda de pie**. El de al lado es el mismo robot sin entrenar. *[empujón al sin entrenar: se cae]*
> **Un video de un robot no se deja empujar.**"

**Pantalla, 6 s:** los dos empujones, uno al lado del otro. Son los cuatro segundos más importantes del pitch.

*Si el entrenado se cae, no disimular: decirlo. Está medido ([`physics/README.md`](../../physics/README.md)): desde las 4 direcciones de la prueba aguanta siempre, pero probado desde 60 direcciones aguanta 56 (93 %), y las 4 que falla son un sector de unos 20° por detrás. El botón empuja en dirección al azar, así que **lo tumba 1 de cada 15 veces**. Dicho por nosotros es una medición; dicho por el jurado es una sorpresa.*

*Cambió con la política v2: el robot entrenado **aguanta** los cuatro empujones de 250 N, así que el plano ya no es "se cae", es la comparación. Si se quiere una caída del entrenado, el empujón tiene que ser de 350 N (ahí aguanta 1,2 de 4). La frase sobre los pasos de física por segundo salió del guion hasta que Pastor confirme el número con la política corriendo: el lazo de `physics/` va a 2 ms, pero la política decide cada 20 ms sobre `scene_mjx.xml`, que usa pasos de 4 ms.*

### 1:59–2:23 · Para quién (impacto y ambición)

> "Los humanoides ya tienen cuerpo. Lo que les falta es experiencia.
> Los equipos que los construyen necesitan millones de horas de movimiento humano, y hoy las graban con trajes, en estudios, sobre un piso perfecto.
> El video ya existe. Nosotros lo convertimos en datos y en políticas entrenadas."

*"Los equipos que están construyendo humanoides", nunca "nuestros clientes" ni un nombre de empresa.*

### 2:23–2:49 · La diferencia, dicha por nosotros primero (originalidad)

> "Esto ya existe. VideoMimic lo hizo con un laboratorio y un robot de dieciséis mil dólares. Ultimate Bots lo lleva al navegador, gratis: pero **copiando**, con un modelo que NVIDIA ya tenía entrenado.
> **Nosotros entrenamos el nuestro**, y la recompensa está en el repo. Por eso el suyo se mira y el nuestro se empuja."

### 2:49–3:00 · Cierre

> "Tridi: datos de movimiento humano para robots humanoides, desde cualquier video.
> Está abierto, y lo pueden romper ahora."

---

## Hoja de cola

Quien presenta habla; **la segunda persona maneja la pantalla** y no dice nada. Los tiempos son acumulados.

| En | Quién | Qué hace |
| --- | --- | --- |
| 0:00 | pantalla | App abierta en la galería, con el `.mp4` ya elegido. **Nada de slides.** |
| 0:05 | pantalla | Click en el sujeto del primer frame |
| 0:09 | — | Dejar correr el robot. Silencio, 8 s |
| 0:18 | pantalla | Vista de los cuatro checkpoints (0, 3 M, 10 M, 40 M), con el número de pasos encima |
| 0:58 | pantalla | Encender la cámara |
| 1:26 | pantalla | **"Reiniciar"** (sale del modo títere) y QR a pantalla completa |
| 1:40 | pantalla | "Empujar" en el entrenado (aguanta) y acto seguido en el sin entrenar (se cae) |
| 1:59 | pantalla | Dejar el QR y la galería corriendo hasta el final |
| 3:00 | — | Fin. No cerrar la app: el jurado la sigue probando en las preguntas |

## Las preguntas del jurado (los 2 minutos)

| Pregunta | Respuesta corta |
| --- | --- |
| **¿Quiénes son sus clientes?** | Ninguno: no tenemos clientes ni socios, y no vamos a insinuarlo. **El comprador son los equipos que construyen humanoides y los laboratorios de robótica.** Lo primero que hacemos el lunes es hablar con uno |
| **¿El robot siempre aguanta el empujón?** | No. Desde las 4 direcciones de la prueba sí, pero medido desde 60 direcciones aguanta 56: hay un sector de unos 20° por detrás que todavía lo tumba, y el botón empuja al azar, así que **falla 1 de cada 15 veces**. Está en `physics/README.md` |
| **¿Es un LLM?** | No, y la diferencia es el punto. **Las empresas le van a poner un LLM a sus robots para decidir a dónde ir; alguien tiene que enseñarles a llegar sin caerse. Eso es Tridi.** Lo nuestro es una política de control: red pequeña, entrada = estado del robot, salida = objetivos de los motores |
| **¿El robot aprende el movimiento del video, o solo a pararse?** | Hoy, a sostenerse y a aguantar empujones, que es la base de cualquier movimiento, y está medido. La imitación de un clip está escrita (`training/imitate.py`) y sin resultados todavía. **No decimos "aprendió a caminar con tu video" hasta que el número exista** |
| **¿Qué tan variado es el entrenamiento?** | Hoy, empujones al azar de hasta 300 N desde cualquier dirección. Fricción, peso y fuerza de motores variables son el siguiente paso, y lo decimos como paso siguiente, no como hecho |
| **¿Entrena en vivo mientras hablan?** | No. Entrenar un clip toma horas en una Mac. Lo desplegado procesa el video nuevo y lo deja en cola; lo que se ve corriendo son políticas que entrenamos nosotros, con su número de pasos y su tiempo |
| **¿La física es suya o es MuJoCo?** | **MuJoCo, y lo decimos nosotros primero.** Nuestro es el simulador que va encima: el lazo de pasos fijos de 2 ms, el visor que dibuja cualquier MJCF, el test que corre la misma física en Node, el modelo de empujón y el entorno de entrenamiento con su recompensa. El solver se instala con `npm install`; el mundo donde el robot aprende, no |
| **¿Por qué el robot no reacciona mientras copia la cámara?** | Porque copiar es cinemático: ahí el robot se coloca en la pose, no la resuelve con física. Es la referencia que la política tiene que aprender a sostener sola. Al reiniciar vuelve a física, y ahí sí se cae si lo empujas |
| **¿Y VideoMimic? ¿Y Ultimate Bots?** | Ver [`diferencia.md`](diferencia.md). VideoMimic llega a un robot físico y nosotros no; Ultimate Bots retargetea con un modelo base de NVIDIA y nosotros entrenamos el nuestro |
| **¿Esto funciona en un robot real?** | No, y no lo vamos a decir. Falta alinear la física del simulador con la real (lo que atacan ASAP y VideoMimic con LiDAR a bordo). Nuestro aporte termina en la política entrenada en simulación |
| **¿Qué hicieron ustedes y qué es librería?** | Librería: MuJoCo, MediaPipe, YOLO, PyTorch, three.js. Nuestro: el pipeline completo, la selección y seguimiento del sujeto, el retargeting a los ángulos del G1, la recompensa, el entrenamiento, y que todo corra en el navegador de quien lo prueba |
| **¿Qué pasa con un video malo?** | Cada clip trae un `valid_ratio` (cuadros con el sujeto bien detectado / total). Por debajo del umbral se avisa en pantalla en vez de entrenar basura |
| **¿Cuántos videos hacen falta?** | *(pendiente de medir: hay que tener el número real, no una estimación)* |
| **¿Por qué MuJoCo y no un motor propio?** | Porque física de contacto fiel no sale en 36 horas y MuJoCo es el estándar de robótica. Lo nuestro es la escena, el render, los datos y el entrenamiento |
| **¿Y los 10 TB?** | Es la arquitectura (subida por partes, procesamiento por lotes), no la demo. En la demo se suben megas |

## Reglas para el que presenta

1. **Demo primero.** Nada de "hola, somos el equipo 26": son 15 segundos del único minuto que importa.
2. **Ningún número sin medir.** Si no se midió, no se dice.
3. **Decir lo que no funciona antes de que lo pregunten.**
4. **Nunca decir "clientes" ni nombrar una empresa como si lo fuera.** Se dice "los equipos que están construyendo humanoides".
5. **Reiniciar antes de empujar.** Si el robot está copiando la cámara, el empujón no hace nada y el mejor momento del pitch se cae.
6. **Plan B grabado.** 40 segundos de la demo funcionando, listos para reproducir si la red falla. Se graba el sábado en la noche. **El servidor de video corre en la Mac de Juan con un túnel**, así que una caída de red mata la parte de subir video: el plan B no es opcional.
7. **El voto público dura 10 días.** El mismo video del plan B sirve para compartir el domingo.

## Pendiente

- **Leerlo en voz alta con reloj.** Está cronometrado sobre el papel, no con una boca.
- Decidir quién presenta y quién maneja la pantalla.
- ~~El bloque de la escalera depende de que existan los checkpoints intermedios.~~ **Listo:** los cuatro ONNX están en `training/policies/` y `view.loadPolicy` los corre en el navegador.
- Que la vista de los cuatro checkpoints exista en `web/` (hoy `loadPolicy` corre una política, no cuatro lado a lado). Es de César y es el plano que más vale: va antes que cualquier pulido.
- Que Pastor confirme los pasos de física por segundo con una política cargada, para poder decir el número en el bloque del empujón.
- El número de "cuántos videos hacen falta".
