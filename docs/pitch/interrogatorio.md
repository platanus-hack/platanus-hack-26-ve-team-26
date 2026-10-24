# El interrogatorio: las preguntas que nos pueden hundir

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** para ensayar antes del domingo

Esto no es el banco de preguntas amable. Es el ataque: **las preguntas que no queremos que nos hagan**, escritas por mí haciéndome pasar por cada tipo de persona que va a estar en esa sala. Todas salen de leer nuestro propio repo. Si una duele, es porque el problema existe.

**Cómo usarlo:** cada uno lee las de su área en voz alta y contesta con reloj. Si una respuesta tarda más de 20 segundos o empieza con "bueno, es que…", esa pregunta nos gana.

---

## Las cinco que no tienen buena respuesta

Antes de las listas largas. Estas cinco son las que yo haría si quisiera hundirnos, en orden.

### 1. «El robot no camina.»

Nuestra promesa es convertir video en movimiento. Hoy la política de caminata **sigue 3,5 s de un clip de 11,8** (`plan-producto.md`): menos de un tercio. Los jumping jacks, 1,3 s de 5,2.

> *"Me acaban de decir que un video se vuelve un robot que se mueve. Su propio repositorio dice que sigue el 30 % del clip. ¿Qué me vendieron exactamente?"*

**Lo único que funciona es decirlo primero**, que es lo que hace el guion. Si lo dice el jurado antes que nosotros, el resto del pitch ya no se escucha.

### 2. «La política que sí funciona no usa el video para nada.»

Esta es la peor, y es la que yo preguntaría. `g1-stand` aprende a pararse **de una función de recompensa**, no de un clip. Si mañana borramos todo el pipeline de video, el robot de la demo —el que se para, el que aguanta el empujón, el del mejor plano del pitch— **sería exactamente el mismo**.

> *"Su demo más fuerte no demuestra su producto. Demuestra que PPO funciona, que eso ya lo sabíamos en 2017."*

Respuesta honesta: la política de pie es la **base** sobre la que se imita cualquier movimiento, y sin ella la imitación ni siquiera arranca. Pero hay que decirlo así y aceptar que el puente todavía no está cruzado.

### 3. «AMASS es gratis.»

> *"¿Por qué un laboratorio les compraría movimiento sacado de video, con ruido, cuando puede bajar AMASS o LAFAN1 gratis, con mocap limpio y escala métrica real?"*

Nuestra respuesta de verdad es la diversidad y la licencia (LAFAN1 y EgoDex son no comerciales), pero eso solo sirve **cuando el pipeline funcione**. Hoy, con 3,5 s de seguimiento, mocap gratis nos gana por todos lados.

### 4. «Sus datos no son suyos.»

Los 188 enlaces de `videos-para-datos.txt` son videos de terceros de YouTube.

> *"Su materia prima es contenido de otras personas. ¿Me están diciendo que van a vender un dataset derivado de eso?"*

El TXT ya lo advierte, pero en el pitch **no está dicho**. Hay que decirlo antes: para probar y demostrar, sirve; para vender, hace falta material propio o con licencia. Si no lo decimos, parece que no lo pensamos.

### 5. «Su costo marginal no es cero.»

La lámina de negocio dice **≈ 0 porque no le pagamos a nadie por grabar**. Es verdad a medias: no pagamos la grabación, pero **pagamos el cómputo**, y son 73 minutos de laptop por política.

> *"Hagamos la cuenta: si una hora de movimiento necesita N clips y cada clip una hora de GPU, ¿cuánto le cuesta a usted una hora de datos? Porque a Mindrift le cuesta seis dólares."*

**Hay que tener ese número antes del domingo.** Hoy no lo tenemos.

---

## El juez técnico (25 % de la nota, y lee el repo con un agente)

1. **«Su deck dice 4 de 4 empujones. Su README dice 3,6 de 4 y que falla desde la derecha. ¿Cuál de los dos es mentira?»** → *El deck quedó viejo con `stand-v7d`. **Hay que actualizar la cifra antes del domingo**, es un cambio de dos caracteres y nos cuesta toda la credibilidad.*
2. «Sesenta millones de pasos para aprender a pararse. ¿Qué parte de eso es investigación suya y qué parte es PPO con una recompensa de libro?»
3. «Su trayectoria de pelvis es una heurística que, en cada eje, se queda con la fuente que más se movió. ¿Cómo sabe que no está inventando el avance en vez de medirlo?»
4. «3,2 cm de error mediano, ¿sobre qué distribución? Deme el p95. Y en el eje de profundidad, que es el que una sola cámara no ve.»
5. «Metieron viento desde el primer paso y la política empeoró de 15/16 a 6/16. ¿Cómo sabe que los mundos ayudan y no solo agregan ruido?»
6. «¿Cuál es su línea base? ¿Compararon contra GVHMR más GMR, que es lo que usa todo el mundo, o contra nada?»
7. «¿Cuánto de esto sobrevive en un G1 real? ¿Modelaron el retardo de los actuadores, el ruido del sensor, la estimación de la altura de la pelvis?»
8. «Si le subo un video de breakdance, ¿qué pasa? ¿Y uno con la cámara en la mano?»
9. «MuJoCo, MediaPipe, YOLO, PyTorch, three.js. Dígame en una frase qué línea de código suya es la difícil.»
10. «La imitación entrena en piso plano y los mundos se usan para probar. ¿Entonces por qué la lámina habla de piedras y viento?»

## El inversionista (Platanus es un fondo: 200 mil por el 7 %)

1. «¿Por qué esto es una empresa y no un paper?»
2. **«Si la materia prima es video público, ¿qué les impide a NVIDIA o a Figure hacer lo mismo el lunes? ¿Dónde está el foso?»** → *La respuesta honesta es que no hay foso técnico; lo que habría es el canal y la curaduría. Hay que decirlo sin adornos.*
3. «¿Quién firma el primer cheque y cuándo? Un nombre, no un segmento.»
4. «¿Cuánto cuesta producir una hora de datos vendibles, hoy, con su stack?»
5. «El mercado que citan sale de blogs de proveedores. ¿Tienen una cifra de una fuente que no venda datos?»
6. «¿Venden datos, un modelo o una herramienta? Porque son tres empresas distintas y la lámina dice las tres.»
7. «Cuatro personas, ninguna de hardware. ¿Por qué ustedes?»
8. «¿Qué hicieron en 36 horas que no se pudiera hacer con repositorios públicos en 36 horas?»

## El comprador (una empresa de humanoides)

1. «Ya tengo un laboratorio de mocap. ¿Por qué querría movimiento de peor calidad sacado de video?»
2. **«¿Me lo entregan para mi robot o solo para el G1?»** → *Hoy, solo G1. Y una política solo sirve en el modelo con el que se entrenó: está escrito en nuestro propio contrato.*
3. «¿En qué formato? ¿LeRobot, Isaac, MJX? Porque si tengo que convertirlo, prefiero generarlo yo.»
4. «¿Qué garantía tengo de que su política no rompe un robot de cien mil dólares?»
5. «¿Cuántas horas me pueden entregar la semana que viene?»

## El de negocio, no técnico

1. «En una frase y sin palabras raras: ¿qué venden?» *(Si tardamos más de diez segundos, perdimos.)*
2. «¿Por qué ahora y no hace tres años?»
3. «¿Cuánto cuesta y quién lo paga?»
4. «Si el robot se cae mientras lo muestran, ¿qué significa eso?»
5. «¿Esto para qué le sirve a una persona normal?»

## El equipo rival de agentes (y el juez de originalidad)

1. **«Ultimate Bots Studio hace video del celular a robot en el navegador, gratis y open source, desde mayo. ¿Qué hacen ustedes que ellos no?»** → *Que nosotros entrenamos la política y ellos usan una de NVIDIA. Es verdad y hay que decirlo rápido.*
2. «VideoMimic hizo esto con un robot físico en 2025. ¿No son una versión en simulación, un año después?»
3. «¿Esto no es GVHMR más GMR con otro nombre?»
4. «Dicen que los agentes no saben pararse. Los agentes tampoco necesitan pararse. ¿No están peleando con un espantapájaros?» → *Ojo con esta: es la contra natural a nuestra primera frase. La respuesta es que la capa de decisión ya está resuelta y la de movimiento no, no que los agentes sean inútiles.*
5. «¿Cuántos clientes tienen?» → *Cero, y se dice sin rodeos.*

---

## Lo que hay que arreglar antes del domingo

| Qué | Por qué | Cuánto cuesta |
| --- | --- | --- |
| **Corregir "4 de 4" a "3,6 de 4"** en el deck y el guion | Es el único dato del deck que hoy **contradice el repo** | Dos minutos |
| Tener el número de **costo por hora de datos** | La pregunta 5 de arriba no tiene respuesta | Una cuenta de servilleta |
| Decir la **licencia de los videos** en el pitch | Si lo pregunta el jurado primero, parece que no lo pensamos | Una frase |
| Decidir la respuesta a **«la política de pie no usa el video»** | Es la pregunta más peligrosa y hoy no está ensayada | Media hora de los cuatro |
| Reentrenar la caminata **con mundos** si da el tiempo | Cierra el hueco entre la lámina 5 y lo que entrena | Pastor sabe |
