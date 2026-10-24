# Marca y landing de Tridi

> **Estilo vigente:** [instrumento de laboratorio](decisiones/2026-10-24-marca-instrumento-de-laboratorio.md) (papel, tinta, naranja señal `#ff4f1a`, Inter Tight + Geist Mono). Lo de abajo (público, mensaje, principios) sigue valiendo.

La guía para la web: a quién le hablamos, cómo se ve, qué dice y qué no. La regla de fondo está en la [decisión](decisiones/2026-10-24-marca-b2b-robotica.md): **es un producto para empresas de robots humanoides, y se ve como tal.** Nombre provisional: Tridi.

## A quién le hablamos

| Quién | Qué le importa | Qué tiene que ver en 10 segundos |
| --- | --- | --- |
| **Equipos de humanoides** (los que construyen robots como Optimus, Figure 02, Digit, NEO, Apollo, el G1) | Datos de movimiento humano a escala, sin montar estudios de captura ni teleoperar durante meses | Que cualquier video se vuelve datos limpios y una política que funciona en física real |
| **Laboratorios de robótica** | Reproducibilidad, código abierto, métricas | Cómo se mide, qué tan bien funciona, dónde está el código |
| **Jurado y público de Platanus** | Que sea técnico, ambicioso y que funcione en vivo | La demo: empujar al robot y verlo recuperarse |

## Lo que decimos (mensaje)

- **Titular:** "Datos de movimiento humano para robots humanoides, desde cualquier video."
- **Bajada:** "Tridi convierte video de personas reales en movimiento 3D y en políticas entrenadas en simulación física. Sin estudios de captura, sin trajes, sin teleoperación."
- **Las tres pruebas que respaldan el mensaje** (todas medidas en el repo):
  - El robot aguanta los 4 empujones de 250 N de la prueba, con una política que entrenamos en una laptop en 73 minutos ([`../training/README.md`](../training/README.md)).
  - Del video al robot: retargeting al Unitree G1 con 3,2 cm de error mediano ([`../physics/README.md`](../physics/README.md)).
  - Elige y sigue a una persona entre varias, y procesa 10 s de video en ~40 s ([`../data/README.md`](../data/README.md)).
- **Lo que no decimos:** la tabla "Lo que NO podemos decir" de [`pitch/diferencia.md`](pitch/diferencia.md#lo-que-no-podemos-decir) manda. Además: nada de "clientes", "socios" ni logos de Tesla, Figure o cualquier otra empresa.

## Cómo se ve (principios)

1. **Sobrio y oscuro o claro, pero de un solo tono.** Base casi negra o casi blanca, grises, y **un solo color de acento** para lo que se toca o se mide. Nada de degradados de colores ni ilustraciones caricaturescas.
2. **Tipografía:** una sans-serif geométrica o grotesca para todo, y una monoespaciada solo para números y datos (N, cm, s, fps). Titulares grandes y cortos; texto corto.
3. **El producto es la imagen principal.** La simulación en vivo del G1 (que se puede empujar) reemplaza cualquier foto de stock o render. Si algo se mueve en la página, es el robot o los datos.
4. **Números en vez de adjetivos.** "4 de 4 empujones de 250 N" en vez de "robusto". Cada cifra con su fuente.
5. **Mucho aire, rejilla clara,** todo alineado. Los botones principales siempre visibles sin scroll (regla de `AGENTS.md`).
6. **Movimiento con intención:** transiciones cortas y suaves; nada que distraiga del robot.
7. **Estilo propio.** Tomamos el tono de las marcas de deep tech, no sus diseños: no clonar layouts, tipografías ni colores de Tesla, SpaceX ni de ninguna referencia.

## Estructura de la landing

| # | Sección | Contenido |
| --- | --- | --- |
| 1 | **Hero** | Titular, bajada y el G1 en vivo a pantalla completa. Botones: **Probar en vivo** y **Hablar con el equipo** |
| 2 | **El problema** | Los humanoides necesitan millones de horas de movimiento humano; capturarlo con estudios o teleoperación es caro y lento. El video ya existe |
| 3 | **Cómo funciona** | Tres pasos con su dato: video → movimiento 3D de una persona (aunque haya más) → política entrenada en física real |
| 4 | **Pruébalo** | Las tres funciones que ya existen, como consola del producto: cámara en vivo, subir un video, simulaciones |
| 5 | **Resultados** | Las cifras medidas, cada una con su fuente, y la escalera de la política: sin entrenar → a medias → entrenada, con el mismo empujón |
| 6 | **Para quién** | Equipos de humanoides, laboratorios, integradores. Sin logos |
| 7 | **Tecnología** | Honesta: física con MuJoCo, robot Unitree G1, política propia entrenada por imitación y refuerzo, todo open source con enlace al repo |
| 8 | **Cierre** | "Hablar con el equipo": el contacto del equipo |

Idioma: español, que es el del voto público. El inglés queda para después.

## Referencias para elegir

Para inspirarnos en el **tono**, no para copiar. Los 4 abren cada una, votan las 3 mejores y anotan qué tomar; con eso se cierra el estilo. Las notas son orientativas: las páginas cambian seguido, hay que verlas hoy.

| Sitio | Qué mirar |
| --- | --- |
| [figure.ai](https://www.figure.ai) | Minimalismo extremo de una empresa de humanoides: blanco y negro, el robot como protagonista |
| [anduril.com](https://www.anduril.com) | Deep tech corporativo y cinematográfico, fondo oscuro, producto primero |
| [physicalintelligence.company](https://www.physicalintelligence.company) | Laboratorio de robótica: sobriedad de investigación, texto y video |
| [skild.ai](https://www.skild.ai) | "Cerebro" general para robots: cómo venden un modelo, no un robot |
| [scale.com](https://scale.com) | El análogo más cercano del negocio: datos para entrenar IA, vendidos a empresas |
| [bostondynamics.com](https://bostondynamics.com) | Robots industriales presentados como producto, con casos de uso |
| [agilityrobotics.com](https://www.agilityrobotics.com) | Humanoide vendido a empresas de logística: retorno y operación |
| [developer.nvidia.com/isaac](https://developer.nvidia.com/isaac) | Plataforma técnica de simulación de robots: specs y diagramas |
| [palantir.com](https://www.palantir.com) | Tono serio y editorial para clientes grandes |
| [linear.app](https://linear.app) | Oficio de producto: tipografía, rejilla y modo oscuro bien hechos |

Cómo anotar: en [`decisiones/2026-10-24-marca-b2b-robotica.md`](decisiones/2026-10-24-marca-b2b-robotica.md) se agrega al final "Referencias elegidas" con las 3 votadas y qué se toma de cada una.
