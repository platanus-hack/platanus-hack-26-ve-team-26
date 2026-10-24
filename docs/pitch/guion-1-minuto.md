# Guion: 1 minuto de pitch + 2 minutos de demo

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** cronometrado sobre el papel

**El formato, al 24 de octubre:** **1 minuto de láminas** y **2 minutos de video de demo**, hablando encima. El video se graba de último, así que el guion de abajo es lo único que se puede ensayar hasta que exista.

Las láminas son [`deck/tridi-deck.html`](deck/tridi-deck.html) y su PDF; cada una lleva su tiempo impreso en el pie. Reemplaza al [guion de 3 minutos](guion-3-minutos.md), que queda como archivo (su banco de preguntas sigue vigente).

**Las láminas casi no tienen texto, a propósito.** Lo que se lee en una ojeada es el titular; lo que hay que decir está aquí. **Solo la portada va en inglés**: es el titular de la categoría. Todo lo demás, en español.

## El minuto

**Medido: 57 s de habla en la ventana de 60** (con [`tools/cronometro.py`](tools/cronometro.py), a 4,2 sílabas por segundo).

**La apertura ataca la categoría, nunca a un equipo.** El competidor directo del track hace agentes de IA; decir su nombre, o insinuarlo, nos haría quedar chicos. La frase de la portada ataca igual de fuerte, es verdad y deja al jurado pensando en el hueco que llenamos. Se dice mirando al jurado, nunca al público.

### 0:00–0:09 · Lámina 1, portada

> "**Physical AI is the new sexy.**
> Pensar ya se resolvió en un servidor. Moverse se resuelve caminando."

### 0:09–0:16 · Lámina 2, por qué esto es otro juego

> "Un bug se revierte. Una caída, no.
> La gravedad no acepta otro intento."

### 0:16–0:26 · Lámina 3, qué les falta a los robots

> "Los robots ya tienen cuerpo. Lo que les falta es experiencia.
> Hoy se la enseñan con trajes de captura, en un estudio, sobre un piso perfecto."

### 0:26–0:40 · Lámina 4, por qué el video no alcanza

> "Nosotros se la damos con video. Pero el robot tiene otro peso y otras medidas: **si copia el video, se cae.**
> El video le dice qué hacer. La física le enseña cómo."

### 0:40–0:47 · Lámina 5, los mundos

> "Y nuestro simulador no tiene un piso perfecto: acera, piedras, recién trapeado y viento."

*Hoy la política de pie entrena con empujones al azar y los cuatro mundos se usan para **probar** (`rollout.py`). Por eso la frase habla del **simulador**. Si Juan cierra ENT-3 antes del domingo, pasa a ser "no entrenamos en un piso perfecto" y es más fuerte.*

### 0:47–1:00 · Lámina 6, las tres piezas

> "Tres piezas: el video se vuelve esqueleto, el robot lo practica millones de veces, y sale una red que corre en el navegador de ustedes.
> Se los enseñamos."

---

## Los 2 minutos de video

**Cambió el enfoque (decisión del equipo, 24 de octubre):** ya no es un recorrido por las funciones con narración encima. Es un **video de storytelling**: las 36 horas contadas a través de lo que le pasó al robot, de no sostenerse a dar sus primeros pasos sobre pisos que no son perfectos. Guion plano por plano en [`guion-video-2-minutos.md`](guion-video-2-minutos.md).

**Consecuencia para quien presenta:** durante esos 2 minutos **no se habla**. El video trae su propia voz en off. Lo que antes era la tabla de narración ahora está dentro del video, así que el equipo solo tiene que estar listo para la lámina 8 apenas termine.

## Al terminar

| Lámina | Cuándo | Para qué |
| --- | --- | --- |
| 8, los números | Apenas termina el video | Deja las cuatro cifras a la vista mientras empiezan las preguntas |
| 9, dónde estamos | Si preguntan por el negocio, por MuJoCo o por el LLM | Está escrita para responder las tres |
| 10, cierre | Al final | La URL y el repo, visibles mientras el público lo prueba |

## Reglas

1. **El minuto no se improvisa.** Es el único texto memorizado de toda la presentación.
2. **Ningún número sin medir.**
3. **Atacar la categoría, nunca a un equipo.** Si preguntan por otro proyecto, se habla bien de él y se vuelve al nuestro.
4. **Nunca "clientes" ni un logo de otra empresa.** Se dice "los equipos que están construyendo humanoides".
5. **Si el robot se cae al empujarlo, decirlo:** pasa 1 de cada 15 veces y está medido.
6. **El banco de preguntas del jurado** sigue en [`guion-3-minutos.md`](guion-3-minutos.md#las-preguntas-del-jurado-los-2-minutos), más estas dos:

| Pregunta | Respuesta corta |
| --- | --- |
| **¿Entrenan en los cuatro mundos?** | Hoy entrenamos con empujones al azar y **probamos** la política en los cuatro (`rollout.py`, 32 episodios). Lo que ya está hecho y es lo difícil: **un solo archivo define cada mundo** —fricción, escena, viento, masas y fuerza de motores, cada uno como rango— y es el mismo que usa la web. Lo que ves es lo que se entrena |
| **¿Esto no es lo mismo que un agente?** | Un agente decide **a dónde** ir. Nosotros enseñamos **a llegar sin caerse**. Son capas distintas, y la nuestra no existe sin física |

## Pendiente

- **Grabar el video de 2 minutos.** Es lo último que se hace y sin él no hay presentación.
- Repartir quién habla el minuto y quién narra cada tramo del video.
- Leer el minuto en voz alta con reloj.
