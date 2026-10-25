# Tridi

**Convertimos un video común en data para robots humanoides.**

Grabas a una persona moviéndose con el celular. Un humanoide aprende a hacerlo igual, practicando en física real hasta no caerse.

👉 Pruébalo en vivo: [tridi-alpha.vercel.app](https://tridi-alpha.vercel.app)

## El problema

Hace un año la pregunta era cómo pasar de un chatbot a un agente. Hoy eso está resuelto. La pregunta ahora es otra: cómo hacer que una red neuronal mueva un robot.

ChatGPT se entrenó con todo internet y todos los libros del mundo. Los robots no tienen nada parecido: no existe un internet de datos de movimiento. Hoy, enseñarle un movimiento nuevo a un humanoide exige trajes de captura, un estudio y mucho tiempo, sobre pisos perfectos que en la calle no existen.

## Qué hace Tridi

- **Tridi Capture:** de un video de celular sacamos el esqueleto 3D de la persona (33 puntos, 30 veces por segundo) y lo pasamos a las 29 articulaciones del robot, con 3,2 cm de error.
- **Tridi Gym:** si el robot solo copia el video, se cae. El video le dice qué hacer; la física le enseña cómo. Por eso una red neuronal practica el movimiento millones de veces con física real, y la probamos en cuatro ambientes imperfectos: acera, piedras, piso resbaloso y viento.
- **Tridi Policy:** lo que te llevas es la data y el cerebro entrenado del robot, en ONNX, el formato que corre un robot. Probarlo en un G1 real es lo que sigue.

## Cómo lo construimos

- **Física:** MuJoCo, el estándar en robótica, en Python para entrenar y compilado a WebAssembly para correr en el navegador (física a 250 Hz, política a 50 Hz).
- **Robot:** Unitree G1, modelo de MuJoCo Menagerie.
- **Entrenamiento:** 60 millones de pasos de práctica para que se mantenga de pie de forma estable.
- **La política:** una red de 265 KB que controla 29 motores a la vez, decide cada 20 ms y tarda menos de 1 ms en decidir. Corre directo en tu navegador.

No es un LLM: es una red pequeña que aprendió a no caerse. El LLM decide a dónde ir; nosotros le enseñamos al robot a llegar sin caerse.

## Dónde estamos

| Estado | Qué hace |
| --- | --- |
| **Hoy** | Se para y aguanta la mayoría de los empujones de 250 N |
| **Entrenando** | Caminar como la persona del video (20 M de pasos; todavía no camina solo) |
| **Lo que viene** | Cualquier movimiento, en cualquier terreno |

## Pruébalo

En [tridi-alpha.vercel.app](https://tridi-alpha.vercel.app) puedes:

- Empujar al robot (barra espaciadora) y ver cómo se recupera.
- Moverte frente a la cámara y que el robot te copie en vivo.
- Subir un video de una persona (hasta 30 s; solo guardamos el movimiento).
- Ver la entrega: la política y los datos que se llevan, con cada prueba en los cuatro mundos.

## Equipo

César · Juan · Pastor · Ale

Hecho en Platanus Hack 26, Caracas. Código abierto en GitHub: [platanus-hack/platanus-hack-26-ve-team-26](https://github.com/platanus-hack/platanus-hack-26-ve-team-26)
