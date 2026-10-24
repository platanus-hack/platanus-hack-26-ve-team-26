# Guion de 3 minutos: borrador 2, cronometrado

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** cronometrado sobre el papel, falta leerlo en voz alta con reloj

Formato: **3 minutos de demo + 2 de preguntas**, domingo entre 10:00 y 14:00. Reglas que condicionan todo el guion ([capítulo 10](../../../platanus-ideas/docs/preparacion/10-bienvenida-caracas.md)):

- **Demo en vivo antes del minuto 1.** "Si llegan con una landing page, no tienen ningún punto en ejecución".
- **El público prueba la app durante la presentación**, desde su celular.
- **El agente del juez lee el repo mientras hablamos.** Todo lo que diga este guion tiene que coincidir con el código.
- **El modelo de negocio no suma.** No se menciona.

Pesos: técnico 25 %, ambición 20 %, ejecución 20 %, impacto 20 %, originalidad 15 %.

## Cómo está cronometrado

El borrador 1 no cabía: **225 segundos de puro hablar en una ventana de 180**, y eso sin contar un solo segundo de mirar la pantalla. Medido con [`tools/cronometro.py`](tools/cronometro.py), que cuenta las sílabas de las líneas habladas y las divide por la velocidad de habla (las indicaciones de escena en cursiva no cuentan).

| Velocidad | Qué es |
| --- | --- |
| 3,8 sílabas/s | Hablando calmado, con pausas |
| **4,2 sílabas/s** | **La que usamos para presupuestar**: ritmo claro de presentación |
| 4,8 sílabas/s | Apurado por los nervios, que es lo que pasa de verdad en el escenario |

**Este borrador, medido: 143 s de habla + 29 s de pantalla = 172 s, con 8 s de margen** dentro de los 180. La ventana de cada bloque de abajo no es un deseo: es su habla medida más sus segundos de pantalla, y las siete suman exactamente 3:00.

El margen es chico a propósito. Con adrenalina uno habla más rápido (a 4,8 sílabas/s esto baja a 125 s y sobran 25), pero también mete palabras que no estaban. **Si al leerlo en voz alta se pasa, lo primero que se corta es el bloque del "por qué", no la demo.**

Para recronometrar después de cualquier cambio:

```bash
python3 docs/pitch/tools/cronometro.py docs/pitch/guion-3-minutos.md 4.2
```

---

## El guion

### 0:00–0:16 · El gancho (ejecución)

**En pantalla:** la app abierta, sin slides. Un `.mp4` vertical de celular.

> "Este video lo grabé con un celular. Hay tres personas; le digo cuál me importa. *[click]*
> Y ahora miren."

**Pantalla, 8 s:** esqueleto 3D sobre el video → el G1 caminando en la escena. Silencio. Dejarlo caminar.

### 0:16–0:50 · La escalera del aprendizaje (técnico)

**En pantalla:** cuatro robots lado a lado, mismo clip, distintos checkpoints.

> "Eso no es el robot copiando el video. Esto era antes de entrenar. *[se cae]* A los mil pasos. A los diez mil. A los cien mil.
> Nadie programó cómo caminar. El robot intentó parecerse a ese video dentro de un mundo con gravedad, y se cayó miles de veces hasta que dejó de caerse.
> Entrenado anoche, en esta laptop, sin GPU."

**Pantalla, 10 s:** los cuatro checkpoints corriendo a la vez. Es el plano que más vale del pitch.

### 0:50–1:13 · Copiar no es aprender (técnico)

**En pantalla:** cámara en vivo, el G1 copiando a quien presenta.

> "Esto sí es copiar: la cámara, el esqueleto, los ángulos del robot. Cinemática inversa sobre el modelo real del G1, veintinueve articulaciones.
> Pero un robot que copia necesita a alguien delante. **El nuestro ya no.**"

*La cámara entra acá y no al principio a propósito: es la forma más rápida de que se entienda el pipeline (persona → esqueleto → robot) y de dejar clara la diferencia con todo lo que ya existe.*

### 1:13–1:50 · Pruébenlo, y empújenlo (ejecución y originalidad)

**En pantalla:** QR grande. **Antes del empujón hay que darle a "Reiniciar"** (copiar la cámara es cinemático: con el robot en modo títere el empujón no hace nada).

> "Está desplegado y es open source. Abran el QR y suban un video suyo: mientras se procesa van a ver estas simulaciones, nunca una pantalla en blanco.
> Y hagan una cosa más: **empújenlo.** *[empujón en vivo]*
> Doscientos cincuenta newtons sobre treinta y tres kilos. No es una animación: es física resolviéndose en su teléfono, quinientos pasos por segundo.
> **Un video de un robot no se deja empujar.**"

**Pantalla, 6 s:** el empujón y el robot cayéndose. Son los cuatro segundos más importantes del pitch.

### 1:50–2:16 · Por qué (impacto y ambición)

> "El cuello de botella de la robótica no es el hardware: son los datos de movimiento. Hoy se consiguen teleoperando un robot que cuesta lo que un carro.
> Y hay millones de horas de gente moviéndose en videos de celular que nadie puede usar.
> Tridi es el camino de un video cualquiera a un comportamiento entrenado."

### 2:16–2:53 · La diferencia, dicha por nosotros primero (originalidad)

> "Esto ya existe. VideoMimic lo hizo el año pasado, con un laboratorio y un robot de dieciséis mil dólares. Y Ultimate Bots lleva tu video a un robot en el navegador, gratis.
> Dos diferencias. Ellos usan un modelo que NVIDIA ya tenía entrenado; **nosotros entrenamos el nuestro**, y la recompensa está en el repo.
> Y lo de ellos es un visor. **Lo nuestro es el mundo donde el robot aprendió.** Por eso el suyo se mira y el nuestro se empuja."

### 2:53–3:00 · Cierre

> "Tridi. Subes un video, el robot aprende. Está abierto y lo pueden romper ahora."

---

## Hoja de cola

Quien presenta habla; **la segunda persona maneja la pantalla** y no dice nada. Los tiempos son acumulados.

| En | Quién | Qué hace |
| --- | --- | --- |
| 0:00 | pantalla | App abierta en la galería, con el `.mp4` ya elegido. **Nada de slides.** |
| 0:05 | pantalla | Click en el sujeto del primer frame |
| 0:07 | — | Dejar correr el robot. Silencio, 8 s |
| 0:16 | pantalla | Vista de los cuatro checkpoints |
| 0:50 | pantalla | Encender la cámara |
| 1:13 | pantalla | **"Reiniciar"** (sale del modo títere) y QR a pantalla completa |
| 1:27 | pantalla | "Empujar" |
| 1:50 | pantalla | Dejar el QR y la galería corriendo hasta el final |
| 3:00 | — | Fin. No cerrar la app: el jurado la sigue probando en las preguntas |

## Las preguntas del jurado (los 2 minutos)

| Pregunta | Respuesta corta |
| --- | --- |
| **¿Es un LLM?** | No. Es una política de control: red pequeña, entrada = estado del robot, salida = objetivos de los motores. Un modelo de lenguaje no aprende control motor desde poses |
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
4. **Reiniciar antes de empujar.** Si el robot está copiando la cámara, el empujón no hace nada y el mejor momento del pitch se cae.
5. **Plan B grabado.** 40 segundos de la demo funcionando, listos para reproducir si la red falla. Se graba el sábado en la noche. **El servidor de video corre en la Mac de Juan con un túnel**, así que una caída de red mata la parte de subir video: el plan B no es opcional.
6. **El voto público dura 10 días.** El mismo video del plan B sirve para compartir el domingo.

## Pendiente

- **Leerlo en voz alta con reloj.** Está cronometrado sobre el papel, no con una boca.
- Decidir quién presenta y quién maneja la pantalla.
- El bloque 0:22–0:55 depende de que existan los checkpoints intermedios.
- El número de "cuántos videos hacen falta".
