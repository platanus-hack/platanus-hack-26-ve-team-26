# Guion de 3 minutos: borrador 1

- **Fecha:** 2026-10-23 · **Quién:** Ale · **Estado:** borrador, sin ensayar

Formato: **3 minutos de demo + 2 de preguntas**, domingo entre 10:00 y 14:00. Reglas que condicionan todo el guion ([capítulo 10](../../../platanus-ideas/docs/preparacion/10-bienvenida-caracas.md)):

- **Demo en vivo antes del minuto 1.** "Si llegan con una landing page, no tienen ningún punto en ejecución".
- **El público prueba la app durante la presentación**, desde su celular. Tiene que aguantar varias personas a la vez.
- **El agente del juez lee el repo mientras hablamos.** Todo lo que diga este guion tiene que coincidir con el código.
- **El modelo de negocio no suma.** No se menciona.

Pesos: técnico 25 %, ambición 20 %, ejecución 20 %, impacto 20 %, originalidad 15 %. Cada bloque de abajo dice a qué criterio le apunta.

---

## El guion

### 0:00–0:25 · El gancho (ejecución)

**En pantalla:** la app ya abierta, sin slides. Un `.mp4` vertical de celular.

> "Esto es un video de doce segundos, grabado con un celular, de alguien caminando. No hay traje de captura, no hay sensores. Lo único que hago es subirlo.
> Hay tres personas en el video: le digo cuál me importa. *[click]*
> Y ahora miren."

**En pantalla:** esqueleto 3D sobre el video → el robot humanoide caminando en la escena MuJoCo.

> *(nada: dejar tres segundos de silencio con el robot caminando)*

### 0:25–1:00 · La escalera del aprendizaje (técnico)

**En pantalla:** cuatro robots lado a lado, mismo clip, distintos checkpoints.

> "Lo que acaban de ver no es el robot copiando el video. Esto era el robot antes de entrenar *[se cae de inmediato]*. Esto a los mil pasos *[se tambalea y cae]*. A los diez mil *[da dos pasos]*. A los cien mil *[camina]*.
> Nadie programó cómo caminar. El robot intentó reproducir ese video dentro de un mundo con gravedad, se cayó miles de veces, y la recompensa fue parecerse al video sin caerse.
> Esto se entrenó anoche, en esta laptop, sin GPU."

*Si no hay checkpoints el domingo, este bloque se cae y hay que reescribir el guion. Es el bloque que más vale.*

### 1:00–1:35 · Qué es, pieza por pieza (técnico)

**En pantalla:** el pipeline, cuatro cajas.

> "Son cuatro pasos. El video entra y detectamos y seguimos a una sola persona, cuadro por cuadro. Esa persona se convierte en un esqueleto 3D en metros. El esqueleto se traduce a los ángulos de las articulaciones del robot, que no tiene las proporciones de un humano. Y con eso se entrena una política: una red neuronal pequeña, no un modelo de lenguaje.
> La física es MuJoCo, el simulador que usa Google DeepMind, compilado a WebAssembly. La política entrenada se exporta a ONNX. Las dos cosas corren **en el navegador de ustedes**: no hay GPU en el servidor."

### 1:35–2:05 · Pruébenlo (ejecución)

**En pantalla:** QR grande, galería de simulaciones precargadas corriendo detrás.

> "Está desplegado y es open source. Abran el QR y suban un video suyo ahora mismo: mientras se procesa van a ver estas simulaciones, nunca una pantalla de carga en blanco.
> Lo que está corriendo detrás son clips nuestros ya entrenados."

### 2:05–2:35 · Por qué (impacto y ambición)

> "El cuello de botella de la robótica hoy no es el hardware: son los datos de movimiento. Un laboratorio los consigue con trajes de captura o teleoperando un robot que cuesta lo que un carro, hora por hora, en un galpón.
> Y hay millones de horas de gente moviéndose, grabadas con celulares, que no se pueden usar.
> Tridi es el camino de un video cualquiera a un comportamiento entrenado. Sin traje, sin laboratorio y sin robot."

### 2:35–2:55 · La diferencia, dicha por nosotros primero (originalidad)

> "Esto ya existe en investigación: VideoMimic lo hizo el año pasado con un robot real de dieciséis mil dólares. Y existe un producto gratis, Ultimate Bots Studio, que lleva tu video del celular a un robot en el navegador.
> La diferencia es una sola: ellos **usan un modelo que NVIDIA ya tenía entrenado**. Nosotros entrenamos el nuestro, desde cero, en una laptop, y la función de recompensa está en el repo para que la lean."

### 2:55–3:00 · Cierre

> "Tridi. Subes un video, el robot aprende. Está abierto y lo pueden romper ahora."

---

## Las preguntas del jurado (los 2 minutos)

| Pregunta | Respuesta corta |
| --- | --- |
| **¿Es un LLM?** | No, y sería un error llamarlo así. Es una política de control: red pequeña, entrada = estado del robot, salida = objetivos de los motores. Un modelo de lenguaje no aprende control motor desde poses |
| **¿Entrena en vivo mientras hablan?** | No. Entrenar un clip toma horas en una Mac. Lo desplegado procesa el video nuevo y lo deja en cola; lo que se ve corriendo son políticas que entrenamos nosotros, y decimos con cuántos pasos y en cuánto tiempo |
| **¿Y VideoMimic? ¿Y Ultimate Bots?** | Ver [`diferencia.md`](diferencia.md). En corto: VideoMimic llega a un robot físico y nosotros no; Ultimate Bots retargetea con un modelo base de NVIDIA y nosotros entrenamos el nuestro |
| **¿Esto funciona en un robot real?** | No, y no lo vamos a decir. Falta la parte más difícil, alinear la física del simulador con la real (el problema que atacan ASAP y VideoMimic con LiDAR a bordo). Nuestro aporte termina en la política entrenada en simulación |
| **¿Qué hicieron ustedes y qué es librería?** | Librería: MuJoCo, MediaPipe, YOLO, PyTorch, three.js. Nuestro: el pipeline completo, la selección y seguimiento del sujeto, el retargeting a los ángulos del robot, la recompensa y el entrenamiento, y que todo corra en el navegador de quien lo prueba |
| **¿Qué pasa con un video malo?** | Cada clip trae un `valid_ratio` (cuadros con el sujeto bien detectado / total). Por debajo del umbral se avisa en pantalla en vez de entrenar basura |
| **¿Cuántos videos hacen falta?** | *(pendiente de medir el sábado: hay que tener el número real, no una estimación)* |
| **¿Por qué MuJoCo y no un motor propio?** | Porque física de contacto fiel no sale en 36 horas y MuJoCo es el estándar de robótica. Lo nuestro es la escena, el render, los datos y el entrenamiento |
| **¿Y los 10 TB?** | Es la arquitectura (subida por partes, procesamiento por lotes), no la demo. En la demo se suben megas |

## Reglas para el que presenta

1. **Demo primero.** Nada de "hola, somos el equipo 26": eso cuesta 15 segundos del único minuto que importa.
2. **Ningún número sin medir.** Si no se midió, no se dice.
3. **Decir lo que no funciona antes de que lo pregunten.** Baja la ambición percibida cero y sube la confianza mucho.
4. **Plan B grabado.** Un video de 40 segundos de la demo funcionando, listo para reproducir si la red del venue falla. Se graba el sábado en la noche, no el domingo.
5. **El voto público dura 10 días.** El mismo video del plan B sirve para compartir el domingo.

## Pendiente

- Ensayar con reloj: este borrador está escrito, no cronometrado.
- Decidir quién presenta.
- Cerrar el bloque 0:25–1:00 cuando haya checkpoints de verdad.
- El número de "cuántos videos hacen falta".
