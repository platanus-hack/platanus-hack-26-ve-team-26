---
persona: Juan
rama: juan/data
sesion: 5e198b2a-2bb0-49ce-aa61-97684d182e76
inicio: 2026-10-24 00:10
estado: cerrada
---

# Integración de data/ con physics/ y web/

## Objetivo

Levantar las cuatro piezas (servidor de video con túnel, `data/live`, `physics/`, `web/`), pasar los clips reales de punta a punta y ver qué falta para que funcionen juntas.

## Qué se hizo

- `data/serve.sh` con el túnel; subida del video de la corredora por el túnel con el cliente `uploadVideo`/`watchJob` desde Node.
- `physics/`: `npm run check` y, en el navegador, los dos clips de `data/clips/` pasados cuadro a cuadro por `window.tridi.mimic`.
- `web/`: build, y en el navegador la galería nueva de César (`eae933b`) con los dos clips reales.
- `data/live`: un video como cámara (`stream`), grabar 8 s y armar el `PoseClip`.
- **Arreglo en `data/`:** valores atípicos del ajuste a la cámara en la trayectoria de las caderas (`lift.py` y `data/live/src/poseclip.js`), y `correr-perfil` regenerado.

## Qué funcionó

- **Servidor + túnel:** `/health` en 0,6 s, el preflight CORS desde `tridi-alpha.vercel.app` responde bien, subida de 3,2 MB en 1,2 s y el clip listo en 25 s, todo pasando por el túnel.
- **physics:** `npm run check` pasa (caminar: 356/356 cuadros, 3,2 cm de error mediano, rumbo de 90°). En el navegador: caminar 356/356 cuadros a 2,2 ms cada uno; correr 89/92 cuadros con 2,0 cm.
- **Ejes:** coinciden. El retargeting de Pastor usa solo direcciones, así que la traslación del clip no le molesta (mismo resultado con las caderas centradas o sin centrar). La conversión es contrato `(x, y, z)` → robot `(z, x, y)`. Hoy vive solo en `physics/scripts/check-retarget.mjs`.
- **MediaPipe no está duplicado:** el botón Cámara de Pastor importa `createLiveCapture` de `tridi-live` (`physics/src/main.js`, `startCamera`). Lo único repetido es el paso de ejes: MediaPipe → contrato en `poseclip.js`, MediaPipe → robot en `physics/src/pose.js` y contrato → MediaPipe en el check de Pastor.
- **web:** la galería muestra Caminar (11,9 s), Correr (3,8 s) y la marcha sintética; el esqueleto corre con el clip arreglado. El G1 se ve al lado, pero de pie y sin conexión con el clip.
- **data/live:** 30 a 31 fps, 228/228 poses visibles y un clip de 240 cuadros a 30 fps.

## Qué no funcionó

- **El clip de correr estaba mal:** en el primer cuadro la corredora entra cortada por el borde y el ajuste a la cámara la ponía 5 m más lejos. Como en cada eje gana la estimación que más se mueve, ese cuadro arrastraba todo el clip 6 m hacia la cámara, con un salto de 28 m/s. Ahora un ajuste que queda a más de 1,5 m de la mediana de su medio segundo se cambia por una interpolación. Resultado: el pico baja de 27,8 a 9,5 m/s y el promedio de 3,6 a 2,6 m/s. Caminar sale idéntico. El check de `data/live` cubre el caso y falla sin el arreglo.
- En correr, la estimación por los pies da el sentido contrario (−4 m contra +12 m de la cámara): al correr de perfil la elección del pie apoyado falla. Por ahora gana la cámara, que es la buena. Queda anotado.
- **En vivo la velocidad sale 50% más alta** que offline con el mismo video: 1,14 contra 0,74 m/s en los mismos 8 s (modelo `full` contra `heavy`). Falta revisarlo.
- En vivo no se ve a la corredora: mide 26 px de ancho y no hay recorte de YOLO, así que da 0 cuadros. Para la webcam del stand no importa.
- **Nadie usa todavía la trayectoria:** con `mimic` la pelvis del G1 se queda en (0, 0). Tampoco existe `loadClip`/`playClip`.
- El servidor no sirve los clips precargados (`GET /clips/clip_2026-10-23_…` da 404). No hace falta: la web los empaqueta desde `data/clips/`.
- La web todavía no lee `?api=`, así que el link de `serve.sh` abre la web sin servidor (W5 de César).
- El pane del navegador no estaba visible para el usuario, pero `document.hidden` daba `false` y los fps fueron reales (30).

## Decisiones

- Los cuadros con un ajuste a la cámara atípico se quedan en el clip (su pose está bien); solo se ignora su posición de cámara.

## Sigue

- **Pastor:** `playClip(clip)` en `createSimView` (`physics/src/index.js`), que reproduzca un `PoseClip` a su fps con la trayectoria de la pelvis (`qpos[0] = caderas.z`, `qpos[1] = caderas.x`) y `mirror: false`; pasar la conversión de ejes de `check-retarget.mjs` a `src/`; rumbo de los clips sacado del desplazamiento; decidir entre Render y la Mac para el servidor (hoy corre en la Mac con túnel).
- **César:** en `stage.js` → `showClip`, llamar a `robot.playClip(clip)` cuando exista (mientras tanto, `robot.mimic` cuadro a cuadro); W4 con `createLiveCapture` + `view.mimic` como en `physics/src/main.js`, agregando `tridi-live` y el alias de MediaPipe en `web/vite.config.js`; W5 con `resolveApiUrl`/`checkApi` al arrancar.
- **Juan:** revisar por qué en vivo la velocidad sale 50% más alta; mejorar la elección del pie apoyado al correr.
