# La web vuelve al estilo claro y abre con una intro de dos slides

- **Fecha:** 2026-10-24 · **Quién:** César · **Estado:** reemplazada por [`2026-10-24-marca-instrumento-de-laboratorio.md`](2026-10-24-marca-instrumento-de-laboratorio.md): Juan rehízo la landing (cinemática, con el G1 real como cámara). Siguen valiendo el robot único y lo que funciona.

## Contexto

La landing corporativa de 8 secciones (M9) explicaba el producto, pero César prefirió volver al estilo claro anterior y abrir con una intro corta que explique Tridi antes de usarlo. Como referencia, el equipo armó un sistema de diseño con Claude (`Tridi Design System`, fuera del repo) cuya `ui_kits/website/Intro.html` propone dos slides: qué es Tridi con una escena animada, y elegir cómo empezar.

## Decisión

- **Estilo:** vuelve el de antes de M9: blanco y tonos fríos, Quicksand y Nunito, tarjetas de vidrio que se inclinan con el cursor, robots de puntos con cara, fondo de puntos que reacciona al cursor.
- **Inicio en dos slides** (`web/src/screens/home.js`):
  1. **Qué es Tridi:** "Del video de una persona al movimiento de un robot", el problema (estudios con trajes o teleoperación; el video ya existe) y los tres pasos. La intro animada es una persona hecha de puntos que se arma desde una nube, camina con etiquetas vivas en sus articulaciones y se dispersa al bajar (`web/src/dots/figure.js`, adaptada del `Intro.html` de la referencia).
  2. **Elige cómo empezar:** las tres tarjetas de antes (cámara, subir, simulaciones) con sus robots de puntos.
- **Lo que funciona no cambia:** robot único cargado al abrir, carga rápida del modelo, política entrenada, cámara, subida y simulaciones.

## Por qué

- Una intro de dos pantallas explica el producto sin obligar a leer una página larga, y la segunda lleva directo a usarlo.
- La figura que camina muestra el "movimiento 3D" que extrae Tridi, con datos que se mueven de verdad (ángulo de la rodilla, altura de la muñeca).

## Consecuencias

- Las cifras con fuente de la landing corporativa salen de la web; siguen en los README y en `docs/marca.md` para el pitch.
- Si el equipo vuelve a la marca corporativa, la versión está en el historial (`06e8a9b`).
