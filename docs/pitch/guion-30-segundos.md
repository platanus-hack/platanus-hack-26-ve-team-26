# Guion: 30 segundos de pitch + 2:30 de demo

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** cronometrado sobre el papel

**El formato cambió.** Ya no son 3 minutos de demo en vivo narrada: son **30 segundos de láminas** y **2 minutos y medio de video de demo**, hablando encima. Esto reemplaza a [`guion-3-minutos.md`](guion-3-minutos.md), que queda como archivo (su banco de preguntas del jurado sigue vigente).

Las láminas son [`deck/tridi-deck.html`](deck/tridi-deck.html) y su PDF. Cada una lleva su tiempo impreso en el pie.

**Las láminas casi no tienen texto, a propósito.** Se ven dos o tres segundos cada una: lo que se lee en una ojeada es el titular y poco más, y lo que hay que decir está en este documento, no en la pantalla. La lámina de la demo es solo una señal (**2:30** y las tres palabras: Capture, Gym, Policy); la narración completa es la tabla de abajo. Las imágenes del G1 son capturas de la landing desplegada, no stock: el producto es la imagen.

## Los 30 segundos

**Medido: 29 s de habla en la ventana de 30** (con [`tools/cronometro.py`](tools/cronometro.py), a 4,2 sílabas por segundo).

**La apertura ataca la categoría, nunca a un equipo.** Nuestro competidor directo del track hace agentes de IA; decir su nombre, o insinuarlo, nos haría quedar chicos. Decir que *los agentes ya saben pensar y ninguno sabe pararse* ataca igual de fuerte, es verdad, y deja al jurado pensando en el hueco que nosotros llenamos. Nunca mirar a nadie del público al decirlo.

### 0:00–0:07 · Lámina 1, portada

> "**Physical AI is the new sexy.**
> Los agentes de IA ya saben pensar. Ninguno sabe pararse."

### 0:07–0:12 · Lámina 2, por qué esto es otro juego

> "Un bug se revierte. Una caída, no.
> The real world has no undo."

### 0:12–0:22 · Lámina 3, por qué el video no alcanza

> "El robot tiene otro peso y otras medidas. **Si copia el video, se cae.**
> El video le dice qué hacer. La física le enseña cómo."

### 0:22–0:30 · Lámina 4, los mundos

> "Nuestro simulador no tiene un piso perfecto: acera, piedras, recién trapeado, viento.
> **Perfect floors don't exist.**"

*Cuidado con esta última: hoy la política de pie entrena con empujones al azar y la probamos en los cuatro mundos; entrenar la imitación en los cuatro es el paso siguiente (ENT-3). Por eso la frase habla del **simulador**, no de lo que ya está entrenado. Si ENT-3 entra antes del domingo, pasa a ser "no entrenamos en un piso perfecto" y es más fuerte.*

## Los 2:30 de demo

El video corre y ustedes hablan encima. **No hay que narrar lo que se ve: hay que decir lo que no se ve.** Tres tramos, con lo que sí o sí tiene que decirse en cada uno.

| Tramo | En el video | Lo que hay que decir |
| --- | --- | --- |
| **0:30–1:10 · Capture** | El video de celular, el esqueleto 3D encima, el movimiento entrando al G1 | Que no hay trajes ni estudio. Que si hay varias personas, eliges a quién seguir. Que son **3,2 cm de error mediano** al pasar el movimiento a un cuerpo de 29 articulaciones. Y que **ahí todavía está copiando: los pies patinan, porque es geometría sin física** |
| **1:10–2:00 · Gym** | El mismo robot sin entrenar, a medias y entrenado, con los empujones | Que **nadie le escribe cómo pararse**: lo intenta, se cae y vuelve a intentarlo, y se le empuja cada 2,5 segundos mientras entrena. **40 millones de pasos, 73 minutos en una laptop, sin GPU.** Que la curva es el log real |
| **2:00–3:00 · Policy** | La política corriendo en el navegador y el empujón | Que la red completa son **265 KB** y decide cada 20 ms para 29 motores. Que **corre en el navegador de ellos, sin GPU en el servidor**. Y el remate: **"un video de un robot no se deja empujar"** |

**Si el video se corta o la red falla:** la web está desplegada y hace lo mismo en vivo. Pasar a `tridi-alpha.vercel.app` y seguir con la lámina 4 a la vista.

## Al terminar

| Lámina | Cuándo | Para qué |
| --- | --- | --- |
| 5, los números | Apenas termina el video | Deja las cuatro cifras a la vista mientras empiezan las preguntas |
| 6, para quién y qué es nuestro | Si preguntan por el negocio, por MuJoCo o por el LLM | Está escrita para responder las tres |
| 7, cierre | Al final | La URL y el repo, visibles mientras el público lo prueba |

## Reglas

1. **Las láminas 1 a 3 son 30 segundos: no se improvisa.** Es el único texto memorizado de toda la presentación.
2. **Ningún número sin medir.**
3. **Atacar la categoría, nunca a un equipo.** "Los agentes ya saben pensar, ninguno sabe pararse" se dice mirando al jurado, no al público. Si alguien pregunta por otro proyecto, se habla bien de él y se vuelve al nuestro.
4. **Nunca "clientes" ni un logo de otra empresa.** Se dice "los equipos que están construyendo humanoides".
5. **Si el robot se cae al empujarlo, decirlo:** pasa 1 de cada 15 veces y está medido.
6. **El banco de preguntas del jurado** sigue en [`guion-3-minutos.md`](guion-3-minutos.md#las-preguntas-del-jurado-los-2-minutos).

## Pendiente

- Grabar el video de 2:30 (y que sea también el del voto público, que dura 10 días).
- Repartir quién habla cada tramo.
- Leer los 30 segundos en voz alta con reloj.
