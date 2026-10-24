# El relato de Tridi, verificado contra el repo

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** vigente para el pitch y la web

El relato largo de Tridi: de dónde viene el problema, qué hace el producto y por qué importa. De aquí salen el [guion de 3 minutos](guion-3-minutos.md), los textos de la web ([`../marca.md`](../marca.md)) y la descripción pública del voto.

**Cada párrafo está verificado contra el código.** Lo que es cierto hoy va tal cual; lo que todavía no, está marcado y con lo que falta para que lo sea. El agente del juez lee `training/env.py` mientras hablamos: un párrafo bonito que el repo desmiente cuesta más de lo que suma.

---

## El relato

### 1. El problema

> Los robots humanoides ya tienen cuerpo. Lo que les falta es experiencia.
>
> Para que un robot aprenda a caminar, bailar o cargar una caja necesita miles de ejemplos de cómo se mueve una persona. Hoy esos ejemplos se graban con trajes de captura, en estudios y sobre un piso perfecto que en la calle no existe. Es caro, es lento y no escala.
>
> Mientras tanto, hay millones de horas de personas moviéndose en video.

✅ **Se puede decir tal cual.** Es el problema, no una afirmación sobre nuestro código. "Ya tienen cuerpo, les falta experiencia" es la mejor frase del relato y es la que abre.

### 2. Por qué el video no alcanza (el corazón del argumento)

> El problema es que a un robot el video no le sirve tal cual: tiene otras proporciones y otro peso, y lo que la persona hace en pantalla es físicamente imposible para él. Si copia el video, se cae.

✅ **Cierto, y es nuestro mejor argumento técnico.** Es, además, la respuesta a la pregunta de originalidad: lo que hacen Ultimate Bots y las herramientas de retargeting es exactamente copiar el video. Nosotros medimos ese salto: el retargeting al G1 deja **3,2 cm de error mediano** ([`physics/README.md`](../../physics/README.md)), y aun con ese error el movimiento resultante es **cinemático**: si se suelta con física, el robot se cae.

**Esta es la frase que separa a Tridi de todo lo demás, y hasta ahora no estaba en el pitch.**

### 3. Qué hace Tridi

> Grabas 30 segundos con el celular, con la cámara de la laptop o subes un MP4. Tridi encuentra a la persona, aunque haya más gente en el cuadro, y saca su esqueleto en 3D. Después pasa ese movimiento al cuerpo del robot.

✅ **Cierto y medido.** Selección y seguimiento del sujeto entre varias personas, 10 s de video en ~40 s ([`data/README.md`](../../data/README.md)); cámara en vivo y subida de `.mp4` o `.zip`; retargeting al G1 con 3,2 cm de error mediano.

### 4. El aprendizaje

> El robot, que no sabe nada, practica millones de veces dentro de un simulador con física real. Solo tiene sus motores; si se cae, vuelve a intentarlo. Nadie le programa cómo caminar.

✅ **Cierto.** 40 M pasos de política, 50 decisiones por segundo, episodios que se cortan al caerse; la recompensa dice qué cuenta como estar de pie y nunca cómo pararse ([`training/README.md`](../../training/README.md)).

> …aprende intentando parecerse a la persona sin caerse.

⏳ **Todavía no.** Lo que está entrenado y medido hoy es **sostenerse de pie y aguantar empujones** (`g1-stand`, 4 de 4 empujones de 250 N, 73 minutos en una laptop). La imitación de un `RobotMotion` existe como código (`training/imitate.py`, commit `5f29ace`, "in progress") pero **no tiene resultados medidos**.

**Cómo se dice hoy, sin mentir:** *"Primero le enseñamos lo más difícil: sostenerse. Esa es la base sobre la que se imita cualquier movimiento, y es lo que está entrenado y medido."* Si el sábado `imitate.py` da una caminata que se sostiene, el relato pasa a la versión completa y es muchísimo más fuerte.

### 5. El piso que no es perfecto

> Y no practica en un piso perfecto. Lo empujamos, le ponemos piedras, viento y piso resbaloso, y le cambiamos el peso y la fuerza de los motores.

❌ **Hoy solo los empujones.** `training/env.py` tiene empujones al azar cada 2-4 s, de hasta 300 N en cualquier dirección — y nada más: no hay fricción variable, ni masa, ni fuerza de motores, ni terreno, ni viento. Un juez que abra `env.py` lo ve en treinta segundos.

**Dos salidas, y la primera es mejor:**

1. **Hacerlo verdad.** En MuJoCo, variar fricción del piso, masa de los cuerpos y escala de los motores entre episodios son pocas líneas sobre `env.py`, y es la práctica estándar (*domain randomization*). **Es la mejora con mejor relación trabajo/pitch que queda en el tablero**, y convierte el párrafo más flojo del relato en el más fuerte. Para Juan.
2. **Decirlo como plan.** *"Hoy lo entrenamos con empujones de hasta 300 newtons desde cualquier dirección. Lo que sigue es fricción, peso y fuerza de motores variables."* La ambición es el 20 % de la nota y un plan dicho como plan suma; un plan dicho como hecho resta todo.

> Un robot que solo aprendió en condiciones ideales se cae en la calle.

✅ Se puede decir: es el argumento de por qué hace falta, no una afirmación sobre nuestro código.

### 6. La frase que resume todo

> El video le dice qué hacer. La simulación le enseña cómo.

✅ **La mejor frase del relato después de la primera.** Va en el guion, en el hero de la web y en la descripción pública.

### 7. Qué sale de Tridi

> Una red neuronal pequeña que mueve los motores del robot, y los datos: el mismo movimiento humano corregido para que un robot sí pueda hacerlo.

✅ La red: `policy.onnx` (entrada 93, salida 29), con su `policy.json` ([contrato](../contrato.md)).
⏳ "El movimiento corregido para que un robot sí pueda hacerlo" es justo lo que produce la imitación, y es la salida que le interesa a un comprador. Hoy tenemos el `RobotMotion` **retargeteado** (cinemático), no corregido por física.

> …en cientos de condiciones distintas.

❌ Igual que el punto 5: hoy no. Sale si entra la randomización.

### 8. El cierre

> El motor de física es MuJoCo, el estándar en robótica. Lo nuestro es todo lo que va encima.
>
> Y tampoco es un LLM. Las empresas les van a poner un LLM a sus robots para decidir a dónde ir; alguien tiene que enseñarles a llegar sin caerse. Eso es Tridi.

✅ Las dos. La de MuJoCo ya estaba en [`diferencia.md`](diferencia.md). **La del LLM es nueva y es excelente:** convierte "no somos un LLM" (una negación defensiva, que es como estaba en el banco de preguntas) en una posición dentro de la industria. Entra al banco de preguntas tal cual.

---

## El titular: una tensión que hay que resolver entre los 4

El relato se titula *"Tridi: donde los humanoides aprenden a moverse a partir de video"*. El titular que fijó [`../marca.md`](../marca.md), y que ya está en la web y en el cierre del pitch, es *"Datos de movimiento humano para robots humanoides, desde cualquier video"*.

No son lo mismo: el primero vende **una capacidad** (aprenden a moverse), el segundo vende **un insumo** (datos). Mi recomendación: **dejar el de `marca.md` como titular** (es una decisión de Juan marcada innegociable, la web ya está construida sobre él, y "datos" es lo que compra una empresa de humanoides), y usar *"donde los humanoides aprenden a moverse a partir de video"* como **la primera línea del relato**, que es donde brilla. Si el equipo prefiere cambiar el titular, se cambia en `marca.md` primero y después en la web y el pitch, nunca al revés.

## Qué cambió en el guion por este relato

| Bloque | Qué entró |
| --- | --- |
| Copiar no es aprender (1:01) | *"Si copia el video, se cae: tiene otro peso y otras proporciones"* y *"El video le dice qué hacer; la simulación le enseña cómo"* |
| Para quién (1:56) | *"Los humanoides ya tienen cuerpo. Lo que les falta es experiencia"* |
| Banco de preguntas | La respuesta del LLM, ahora en positivo |
