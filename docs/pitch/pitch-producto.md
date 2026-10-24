# Pitch del producto: Tridi para la Physical AI

- **Fecha:** 2026-10-24 · **Quién:** Pastor · **Estado:** propuesta aprobada por Pastor; falta revisarla con Juan, César y Ale.

Cuenta el producto en un solo texto para leer en voz alta. No está cronometrado: el guion con tiempos es [`guion-3-minutos.md`](guion-3-minutos.md) (Ale), y este texto sirve para ajustarlo. Respeta [Lo que NO podemos decir](diferencia.md#lo-que-no-podemos-decir).

## El pitch

> **La IA aprendió a hablar leyendo internet. La IA física no tiene un internet de movimiento.**
>
> Los robots humanoides ya tienen cuerpo. Lo que les falta son datos: miles de ejemplos de cómo se mueve una persona para aprender a caminar, bailar o cargar una caja. Hoy esos ejemplos se graban con trajes de captura, en estudios y sobre un piso perfecto que en la calle no existe. Es caro, es lento y no escala. Es el cuello de botella de la Physical AI.
>
> Mientras tanto, hay millones de horas de personas moviéndose en video. El problema es que a un robot el video no le sirve tal cual: tiene otras proporciones y otro peso, y lo que la persona hace en pantalla es físicamente imposible para él. Si lo copia, se cae.
>
> **Tridi convierte video en datos de entrenamiento para robots.**
>
> Subes un MP4 o enciendes la cámara del celular o de la laptop, y empieza a grabar en ese momento. Con 30 segundos alcanza. Tridi encuentra a la persona, aunque haya más gente en el cuadro, saca su esqueleto en 3D y pasa ese movimiento al cuerpo del robot.
>
> Y ahí empieza lo importante. El robot, que no sabe nada, practica ese movimiento millones de veces en un simulador con física real. Solo tiene sus motores; si se cae, vuelve a intentarlo. Nadie le programa cómo caminar ni cómo bailar: lo aprende intentando parecerse a la persona sin caerse.
>
> Y no practica en un piso perfecto. Lo empujamos, le ponemos piedras, viento y piso resbaloso, y le cambiamos el peso y la fuerza de los motores. Un robot que solo aprendió en condiciones ideales se cae en la calle.
>
> **El video le dice qué hacer. La simulación le enseña cómo.**
>
> De Tridi salen dos cosas: una red neuronal pequeña que mueve los motores del robot, y los datos, es decir, el movimiento humano corregido para que un robot sí pueda hacerlo, en cientos de condiciones distintas. Eso es lo que una empresa de humanoides necesita para entrenar sus robots.
>
> *[Demo]* Este es el robot sin entrenar: se cae en un segundo. Este es el mismo robot después de [N] millones de pasos de práctica, entrenado anoche en esta laptop en [M] minutos. Empújenlo. **Un video de un robot no se deja empujar.**
>
> Lo decimos claro: el motor de física es MuJoCo, el estándar en robótica. Lo nuestro es todo lo que va encima: el camino del video al robot, el mundo donde aprende y el entrenamiento. Y no es un LLM. Las empresas les van a poner un LLM a sus robots para decidir a dónde ir; alguien tiene que enseñarles a llegar sin caerse.
>
> **Lo que sigue:** que el robot vea su entorno y esquive obstáculos, y llevar lo que aprende a un robot real. Empezamos con humanoides, pero el mismo simulador sirve a cualquier empresa de hardware que necesite datos de su máquina en condiciones que no puede reproducir en un laboratorio.
>
> **La Physical AI necesita datos de movimiento. Hay millones de horas de video. Tridi es el puente.**

`[N]` y `[M]` se llenan con los pasos y los minutos reales de la política que se muestre.

## Qué vendemos

| Qué | Respuesta |
| --- | --- |
| Nicho | Physical AI |
| Cliente | Empresas de robots humanoides. Después, empresas de hardware que necesiten datos simulados de su máquina (en el pitch, una frase) |
| Qué no vendemos | Robots ni motor de física: el solver es MuJoCo. Vendemos el simulador de entornos que va encima y lo que sale de él |
| Qué se entrega | La política entrenada (ONNX) y los datos: el movimiento humano corregido por la física, en muchas condiciones |
| Cómo se entrena | Cada video del usuario, por imitación y en cola. No hay movimientos preentrenados: caminar, bailar o saltar salen del clip que se sube |

## Qué es verdad hoy y qué es plan

Cada frase del pitch, contra el repo. Lo que dice "por hacer" no se presenta como hecho.

| Afirmación del pitch | Hoy | Dónde verlo |
| --- | --- | --- |
| Encuentra a la persona entre varias y saca su esqueleto 3D | Hecho, desde video subido y desde la cámara | [`data/README.md`](../../data/README.md) |
| La cámara empieza a grabar al encenderse | La cámara en vivo funciona; grabar y guardar el clip, por hacer (W4.3) | [`web/TAREAS.md`](../../web/TAREAS.md) |
| Pasa el movimiento al cuerpo del robot | Hecho: 3,2 cm de error mediano en la caminata | [`physics/README.md`](../../physics/README.md) |
| Practica millones de veces con física hasta aprender el movimiento | El entorno de imitación existe y acepta cualquier clip; todavía no aprende | `training/imitate.py`, [bitácora de Juan](../bitacora/2026-10-24-0100-juan-entrenamiento.md) |
| Lo empujamos y no se cae | Aprendido en la política de pie (250 N desde 4 direcciones); en imitación, por hacer | [`training/README.md`](../../training/README.md) |
| Piedras, viento, piso resbaloso, peso y motores al azar | Por hacer | — |
| Entrega la política | Hecho para la política de pie (ONNX corriendo en el navegador) | [`training/policies/`](../../training/policies) |
| Entrega los datos corregidos por la física | Por hacer | — |
| Cada video del usuario se entrena, en cola | Por hacer: el servidor termina en el `PoseClip` | [`docs/contrato.md`](../contrato.md) |
| Esquivar obstáculos y robot real | Plan, prometido como lo que sigue | — |
