---
persona: Juan
rama: juan/landing-walk
sesion: 87e08cde-fa1c-59df-9e3a-90efaf486e34
inicio: 2026-10-24 13:00
estado: en curso
---

# `stand-v7d` shippeado como salió, y la caminata de Capture sin patinar

Sesión en la nube (sin acceso a la Mac ni permiso de push al repo de la organización: lo de aquí llega a `main` aplicando la rama en la Mac, ver "Sigue").

## Objetivo

1. Saber cómo quedó `stand-v7d` y shippearlo como `g1-stand` salga como salga (pedido de Juan).
2. En la landing, sección Capture: el maniquí naranja no deja ver que avanza y el robot camina raro.
3. Decidir qué hacer cuando el robot se cae (¿enseñarle a levantarse?).

## Qué se hizo

- **`stand-v7d`** (12 M pasos desde `v7b` @ 8 M, `turn=0,3 feet=0,25 planted=0,1 rate=0,02 calm_s=2`, empujones 50–300 N cada 4–8 s), evaluado en la Mac con `training.evaluate`. Ningún checkpoint pasó el corte (giro < 5°/s, se va < 0,15 m, 4 de 4). Juan lo quiso igual: `step_12001280` exportado como `g1-stand` y shippeado a mano desde la Mac en `6b9bb38` (junto con `g1-stand-quiet`, v7b @ 8 M, como nivel extra de la web).
- **Caminata de Capture, medida en Node** (`physics/scripts`, `smoothForDisplay` + cinemática del G1): el pie que carga el peso patinaba hacia atrás a 0,35 m/s (mediana; p95 1,30), porque el recorrido de la pelvis escalado a las piernas (7,5 m) es más corto que la zancada del robot (9,8 m). Como una cinta de correr: eso es "camina raro".
- **`plantFeet`** (`physics/src/motion.js`, opción de `smoothForDisplay` y `view.playClip(motion, { plantFeet: true })`): rehace el recorrido horizontal desde el pie más bajo (lo que se mueve respecto a la pelvis es la pelvis moviéndose al revés, como `data/lift.py` con la persona) y lo suaviza 0,2 s. Opcional: solo para caminar. `check-smooth.mjs` lo exige (< 0,2 m/s). `physics/README.md` lo cuenta. **Carpeta de Pastor, commit aparte: avisarle.**
- **Landing** (`web/src/screens/home.js`): la caminata de Capture se reproduce con `plantFeet`.
- **Esqueleto** (`web/src/skeleton.js`, carpeta de César, commit aparte): la cámara sigue a las caderas, así que la caminata solo se ve en el piso que se desliza, y a los colores del tema la grilla no se veía en el cuadro chico de la landing. Grilla más clara (solo en el esqueleto) y una cinta naranja en el piso con el recorrido de las caderas hasta el cuadro actual.

## Qué funcionó

| Caminata en pantalla | Pie apoyado, mediana | p95 | Recorrido | Aceleración horizontal de la pelvis (p95) |
| --- | --- | --- | --- | --- |
| Hoy (`smoothForDisplay`) | 0,35 m/s | 1,30 | 7,5 m | 7,1 m/s² |
| `plantFeet`, suavizado 0,1 s | 0,04 | 0,20 | 9,9 | 15,4 |
| **`plantFeet`, suavizado 0,2 s** | **0,13** | **0,48** | **9,8** | **9,1** |
| `plantFeet`, suavizado 0,3 s | 0,18 | 0,64 | 9,8 | 6,8 |

- `npm run check` de `physics/` pasa completo con el chequeo nuevo. La altura de la pelvis sigue en 3,2 m/s².
- Capture fotografiada en Chromium sin cabeza (Playwright, SwiftShader): el robot avanza por la calle con el pie plantado y el maniquí deja su cinta.

## Qué no funcionó

- `plantFeet` para todos los clips: en la carrera el pie más bajo va en el aire durante el vuelo (el recorrido pasaba de 8,8 m a 0,5 m) y en los *jumping jacks* los pies que se abren mecerían la pelvis. Por eso es opcional y la landing lo pide solo para la caminata.
- Desde esta sesión en la nube no se puede hacer push: la app de GitHub de Claude no está instalada en la organización `platanus-hack` (ni en la cuenta de Juan). La rama `juan/landing-walk` quedó commiteada en el contenedor; se lleva a la Mac como parche (tarea sugerida en la app).

## Decisiones

- **`g1-stand` es `stand-v7d` @ 12 M** aunque aguante 3 de 4 (adelante 1,0, izquierda 1,0, atrás 0,6, derecha 0,4): Juan prefiere la postura quieta y suave (1,7°/s, 0,17 m, acción 0,018) a la pirueta de v2 (55°/s). Con el botón de la web, que empuja en dirección al azar, se cae ~1 de cada 4. `step_6000000` dio 3,6 de 4 por si se quiere cambiar.
- **No entrenar a levantarse.** Un *get-up* del G1 es un entrenamiento aparte con currículo (días de GPU en los papers), sin margen antes del domingo y con riesgo de no salir. Cuando se cae: la política deja de decidir y los motores sostienen la pose en que cayó (`physics/src/policy.js`); el Gym lo levanta a los 1,6 s. Propuesta: que al caer sostenga una pose ordenada (la de pie, con las piernas estiradas) en vez de la pose en que aterrizó, para que no se vea con las articulaciones "rotas", y decirlo en el pitch como plan.

## Sigue

- **Juan, en la Mac:** aplicar la rama (tarea sugerida: parche + `scripts/ship.sh`), avisar a Pastor (`physics/`) y a César (`skeleton.js`).
- La etapa final del Gym (`home.js` `GYM_STAGES`), la etiqueta de `web/src/policies.js`, la tabla de `training/README.md` y la tabla "qué es verdad hoy" del pitch siguen diciendo que `g1-stand` tiene 40 M pasos y aguanta 4 de 4; el aviso del hero al caer dice "1 de cada 15" y con v7d es ~1 de cada 4 (en Chromium sin cabeza: 12 caídas en 40 empujones seguidos).
- La prueba de la caída en Chromium sin cabeza no alcanzó a fotografiar al robot en el piso (la cámara lo pierde al caer y la captura tarda más que el reinicio): la pose "rota" sigue sin medir; verla en la Mac.
- Cámara del teléfono por QR para la captura en vivo (pedido de Juan, opcional): tarea sugerida aparte.
- Si se quiere, `plantFeet` también en Simulaciones (`web/src/stage.js`) para los clips que caminan.
