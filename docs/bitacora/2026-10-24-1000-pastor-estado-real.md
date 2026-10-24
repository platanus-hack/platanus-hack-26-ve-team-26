---
persona: Pastor
rama: pastor/fisica
sesion: 31e53a9d-8fda-41b3-88f5-830539865f59
inicio: 2026-10-24 10:00
estado: cerrada
---

# Dónde está el producto: estado y plan al día

## Objetivo

Comparar el repo con la visión del producto (Physical AI: video → imitación en mundos variados → política + datos), contar los retos superados y lo que falta, y dejar `estado.md` y `plan-producto.md` al día.

## Qué se hizo

- Revisión de las bitácoras, `estado.md`, `plan-producto.md`, los commits de `main` y los entrenamientos en `training/runs/` (los `followed_s` de cada checkpoint).
- [`../estado.md`](../estado.md), sección de Pastor: SIM-1/2/4/6/7 hechos, ENT-1 en curso con los números de `walk-v4` y `jacks-v2`, la escalera del aprendizaje y lo que sigue.
- [`../plan-producto.md`](../plan-producto.md): columna "Hoy" del flujo, ENT-1 con `walk-long`, `walk-v4` y `jacks-v2`, punto de control de las 12:00, ENT-6 nueva (la escalera), DOC-1 en curso y una lista de lo que falta en orden de importancia.

## Qué funcionó

- Seguimiento desde el inicio del clip, leído de los `.json` de cada checkpoint:

  | Pasos | 0 | 10 k | 100 k | 1 M | 3 M | 10 M | 20 M |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `walk-v4` (de 11,85 s; parte de `walk-long`) | 0,86 | 0,88 | 1,00 | 2,88 | 1,98 | 3,68 | 3,54 |
  | `jacks-v2` (de 5,17 s; desde cero) | 0,74 | 0,74 | 0,74 | 0,76 | 0,76 | 1,26 | |

## Qué no funcionó

- La caminata no mejora entre 10 M y 20 M pasos (3,68 → 3,54 s): más práctica sola ya no alcanza.

## Decisiones

- Los checkpoints de la escalera viven en `training/runs/`, que no se versiona; se copian a `training/policies/` solo los de la corrida elegida (ENT-6), como `g1-stand-step-*`.

## Sigue

- Punto de control de ENT-1 a las 12:00: si la caminata no pasa de ~4 s, la demo se apoya en jacks (20 a 30 M pasos más) o en un ciclo de paso corto.
- **Ale:** la escalera ya no está bloqueada; falta elegir la corrida (ENT-6).
- **César:** WEB-2 y WEB-3, con el servidor listo.
- Esta rama va 5 commits atrás de `main`: sincronizar antes de shipear.

## Parte 2: la escalera en la entrega de Caminar

- **Revisión del panel de entrega de Juan** (`3561e6b`, en `main` y en el deploy desde las 10:03): repetición de los 32 episodios, la matriz de 4 mundos × 8 episodios, telemetría, las 6 descargas (las 6 responden 200 en el deploy) y la escalera, que venía vacía porque Juan no tenía los checkpoints de `walk-v4`.
- **Rama sincronizada** con `main` (rebase sin conflictos).
- **Entrega regenerada** con `training.deliver ... --dataset <copia del mismo dataset.zip> --checkpoints training/runs/walk-v4`: solo cambia `delivery.json` (la escalera y `created_at`); el dataset y los demás archivos son idénticos (mismo sha1 del zip, mismos números por mundo). Escalera: 0,86 → 0,88 → 1,00 → 2,88 → 1,98 → 3,68 → 3,54 s, a los 0, 10 k, 100 k, 1 M, 3 M, 10 M y 20 M pasos.
- **Verificado en el navegador** (`npm run dev` en `web/`, `#/entrega/clip_2026-10-23_caminar-perfil_01`): el gráfico dibuja los 7 puntos con el final marcado, sin errores salvo el aviso esperable de que el servidor de videos local está apagado.
- `plan-producto.md`, `estado.md` y `training/README.md` (cómo regenerarla con la escalera) al día.

### Qué no está bien todavía

- **El "0 pasos" de `walk-v4` no es un robot sin entrenar:** la corrida arrancó de los 30 M pasos de `walk-long`, y la ficha dice "20,0 M pasos" cuando en total practicó 50 M (30 M con las referencias viejas). Es lo que guardan los checkpoints; no se cambió el panel (es de Juan). Para mostrar en el pitch cómo aprende desde cero, la escalera buena es la de `jacks-v2`.

## Parte 3: Entrenar desde la web (WEB-2)

Pedido de Pastor: que un clip propio (grabado o subido) se pueda entrenar desde Simulaciones y llevar al panel de entrega.

- **`data/live/src/upload.js`** (carpeta de Juan, commit aparte): `sendClip` (`POST /clips`), `trainClip` (`POST /clips/{id}/train`) y `watchTraining` (`GET /train/{id}` cada 2 s, como pide el contrato, y hasta 5 errores de red seguidos antes de rendirse, porque el túnel puede cortarse un momento en media hora). Documentado en `data/live/README.md`. El contrato no cambió: ya tenía estas rutas.
- **`web/src/training.js`** (nuevo): sigue el entrenamiento de cada clip propio fuera de la pantalla, así salir de Simulaciones no lo corta. El clip de la cámara se manda al apretar Entrenar, no al grabarlo; un reintento no lo manda dos veces. Antes de mandar, el botón se apaga sin servidor o con `valid_ratio` < 0,8 (el mismo tope que `data/server.py`) y dice por qué.
- **Simulaciones** (carpeta de César: `screens/simulations.js`, `gallery.js` avisa qué clip se eligió, `style.css`, y el comentario de `screens/live.js`): caja "Entrenar al robot con este video" arriba de la galería, solo para clips propios. Muestra las etapas (cola, pasar al robot, practicar, probar en 4 mundos), la barra de pasos, cuánto del clip sigue el último checkpoint y el tiempo que falta. Al terminar, "Ver la entrega" abre `#/entrega/<clip_id>`, que el panel de Juan pide al servidor. Si terminó sin entrega (`done` con `error`), lo dice y no muestra el enlace.

### Qué funcionó

- De punta a punta contra `data/server.py` local con `TRIDI_TRAIN_STEPS=20000`, `TRIDI_TRAIN_EVERY=10000` y `TRIDI_ROLLOUT_EPISODES=1`, con la caminata marcada como clip de la cámara: `POST /clips` → cola → retarget → práctica → datos → "Ver la entrega" → el panel abre desde el servidor con 3 checkpoints en la escalera y las 6 descargas. Salir de Simulaciones a mitad del entrenamiento y volver: sigue y termina. Con `valid_ratio` 0,5 el botón queda apagado con el motivo; en las precargadas la caja no aparece. A 375 px de ancho no hay scroll horizontal. `vite build` pasa.

### Qué no funcionó

- La primera prueba dijo "hace falta el servidor": la página revisó `/health` antes de que el servidor terminara de instalar sus dependencias (primera vez en esta Mac). Es lo esperado: la revisión se hace una vez al abrir la página.

### Sigue

- **César:** revisar W12.2 y W12.3 en `web/TAREAS.md` (lo hice yo en su carpeta) y pasar la caja al estilo de W12.1 si hace falta.
- Falta de WEB-2: cargar el robot del usuario en cada checkpoint mientras entrena. WEB-3: el robot del usuario con su política en Simulaciones.
- Probarlo con el servidor real de Juan y su túnel (`data/serve.sh`) y una grabación propia de cámara.
