---
persona: Juan
rama: juan/camara-telefono
sesion: 72ad45c0-d9d4-5b5b-84ca-00072bf307e0
inicio: 2026-10-24 18:14
estado: en curso (sigue en una sesión local)
---

# El teléfono como cámara de En vivo

## Objetivo

En la demo, filmar a alguien de pie sin mover la Mac: la Mac muestra un QR, el iPhone lo escanea, abre una página que pide su cámara y manda las poses a la sesión de la Mac; de ahí en adelante todo sigue igual (el robot copia con `mimic`, Grabar guarda el mismo `PoseClip`). Opcional: la webcam sigue siendo lo normal y no se puede romper.

## Qué se hizo

Cinco commits en `juan/camara-telefono` (no shippeado: falta la prueba con un iPhone real, ver "Sigue").

- **Contrato** (`b57ddc9`, `docs/contrato.md`, sección "El teléfono como cámara"): `POST /live` → `{ session_id, ttl_s }`; `POST /live/{id}/poses` con el lote del teléfono (`width`, `height`, `frames[]` con `t`, `world` 33×3 y `image` 33×3; un cuadro sin cuerpo es solo `{ t }`); `GET /live/{id}/poses?since=&wait=` con *long polling*; `DELETE /live/{id}`. Cada número con su porqué (id de 8 letras de un alfabeto de 31, 180 s de expiración, 150 cuadros guardados, lotes de 100 ms y 64 KB, `wait` hasta 2 s, 20 sesiones, 5 s para dar al teléfono por perdido).
- **Servidor** (`4992c23`): `data/relay.py`, un `APIRouter` que `data/server.py` monta (y cuyo `sweep` corre el conserje). Sesiones en memoria con un `asyncio.Event` por sesión: el `GET` espera hasta `wait` ms a que llegue un lote o termine la sesión (un solo bucle de eventos, así no se cuela un lote entre la revisión y la espera). Valida la forma de cada lote y reenvía solo las claves del contrato. `data/check_relay.py` lo prueba sin los modelos de video, con `httpx.ASGITransport` en un solo bucle como uvicorn (el despertar del *long poll* se prueba de verdad): 32 comprobaciones, pasan.
- **Cliente JS** (`62fb00f`, `c7283f3`, `data/live/src/relay.js`): `createPhoneSender` (el teléfono: acumula lo que da `onPose` y lo manda cada 100 ms; si falla la red, los cuadros esperan al próximo intento, hasta 30) y `createPhoneCapture` (la Mac: *long poll* con `since`, y **la misma interfaz que `createLiveCapture`**: `startRecording`, `stopRecording`, `isRecording`, `fps`, `stop`, más `source`, `size()` y `onStatus`), así la pantalla, `mimic` y `buildPoseClip` no saben de qué cámara vienen los cuadros. `createLiveCapture` acepta `facingMode` ('environment' para la cámara trasera) y avisa en español cuando la página no es HTTPS (no hay `navigator.mediaDevices`). `scripts/check-relay.mjs` corre las dos mitades contra el servidor real.
- **Web** (`3094a21`, carpeta de César, avisar): nueva pantalla `web/src/screens/phone.js` en `#/camara/<sesión>` (cámara trasera, modelo `lite`, esqueleto encima, estado grande legible con el brazo estirado, cuadros por segundo, Wake Lock para que no se apague la pantalla, "Terminar", y se detiene sola si la Mac no pide hace 30 s); en `screens/live.js` el botón secundario "Usar el teléfono como cámara", el QR en el panel de la cámara (`uqr` 0.1.3, 5 KB), los textos para el teléfono y la vuelta a la webcam; `style.css`; `router.js`. La URL del QR es `<web>/?api=<túnel>#/camara/<id>`: el `?api=` va antes del hash para que `resolveApiUrl` lo lea tal cual; en `localhost` el QR apunta al deploy (el teléfono no llega a un servidor de desarrollo y la cámara pide HTTPS).
- **Docs**: `data/README.md`, `data/live/README.md` (uso, estados, latencia, HTTPS, prueba), sección de Juan en `docs/estado.md`, W12.6 en `web/TAREAS.md`.

## Qué funcionó

- `python -m data.check_relay`: pasa (sesión, validaciones, 413, espera de `wait`, despertar en 204 ms al llegar el lote, 150 cuadros guardados, tope de `wait`, `DELETE` despierta al `GET`, expiración, 503 en la sesión 21).
- `npm run check-relay` en `data/live` contra uvicorn real: el teléfono falso manda la caminata sintética 4 s a 30 fps, la Mac falsa reproduce 120 de 120 cuadros (los perdidos llegan como `null`), el `PoseClip` sale con 117 cuadros, `valid_ratio` 0,983 y **1,20 m/s (esperado 1,2)**; al callarse el teléfono, la Mac dice `lost` a los 5 s; `stop()` termina la sesión en el servidor.
- `vite build` pasa. La pantalla de la Mac en Chromium sin cabeza (Playwright, web compilada servida en la IP del contenedor, servidor en la misma IP): el botón abre la sesión, el QR **se lee con jsQR** y decodifica a la URL correcta, al llegar cuadros el QR se va, el estado dice "¡Conectado!", la grabación corre, y al cerrar la sesión desde el otro lado la Mac dice "El teléfono cerró la sesión", guarda el clip ("Movimiento guardado: 12 s, 100 %") y vuelve al estado de webcam. Sin servidor, el botón solo dice por qué y "Encender la cámara" sigue habilitado.

## Qué no funcionó

- `data/server.py` **no es stdlib** como decía el pedido: es FastAPI + uvicorn. Mejor: el *long polling* salió con `asyncio.Event`, sin hilos ni WebSockets.
- La página del teléfono no se pudo probar entera en este sandbox: el proxy del contenedor bloquea las descargas del navegador (WASM de jsDelivr y el modelo de Google: `ERR_TUNNEL_CONNECTION_FAILED`), y la web servida por http en una IP de red no es un contexto seguro, así que no hay `navigator.mediaDevices` (de ahí el aviso nuevo de HTTPS). Se intentó una última corrida sirviendo el WASM desde `node_modules`, el modelo `lite` bajado con curl, el video `web/public/media/caminar.mp4` como cámara falsa y el origen marcado como seguro; su resultado queda en el log de la sesión local si se repite (`scratchpad/pwtest/smoke.cjs` no está en el repo).
- No probado: iPhone real, Safari, el túnel de Cloudflare y la latencia real de persona a robot (la esperada, 150 a 300 ms, está escrita; falta medirla).

## Decisiones

- **El filtro One Euro corre una sola vez, en el teléfono.** La Mac reproduce los cuadros tal cual; filtrar dos veces solo sumaría retraso.
- **Reproducción a su hora en la Mac.** Los lotes llegan de a ~3 cuadros cada 100 ms; reproducirlos al llegar movería al robot a saltos de 10 Hz. `createPhoneCapture` reproduce cada cuadro a su `t` del teléfono más el mayor retraso visto en los últimos 2 s (+20 ms): 30 fps a cambio de ~100 ms más de latencia.
- **El servidor no guarda nada del relay** (ni video ni poses): solo los últimos 5 s de cuadros por sesión, en memoria. Coherente con "solo se guardan los PoseClips".
- **Empujar apaga también la cámara del teléfono** (cierra la sesión): mismo comportamiento que la webcam. Hay que volver a escanear; es raro en En vivo (Empujar vive en Simulaciones).
- **La grabación arranca con el primer cuadro del teléfono**, no al mostrar el QR, para que los 30 s sean de movimiento.
- **Si el teléfono se pierde** (5 s sin cuadros) o cierra la sesión: la Mac guarda lo grabado, lo dice en una nota que no se pisa cada segundo y, si la webcam estaba encendida antes de pasar al teléfono, la vuelve a encender.
- **La tabla "qué es verdad hoy" del pitch no se tocó**: recién cuando funcione con un iPhone real.

- **El push desde la sesión en la nube falló** (`403`, también por la API de GitHub: la app de GitHub de Claude no está instalada en la organización `platanus-hack`, y escribir en el repo la necesita). Los 6 commits salieron de la sesión como parche (`git format-patch`), para aplicarlos en local con `git am`. Para que una sesión en la nube pueda pushear, un dueño de la organización instala la app desde https://claude.ai/connect-github.
- La última corrida de Playwright con el origen http marcado como seguro no cambió nada: Chromium sin cabeza siguió sin `mediaDevices` y la página del teléfono mostró el aviso nuevo de HTTPS (al menos ese camino quedó probado). El lado de la Mac volvió a pasar entero.

## Sigue

- **Juan, en local:** crear la rama desde `main` y aplicar el parche: `git switch -c juan/camara-telefono origin/main && git am juan-camara-telefono.patch` (viene de la sesión en la nube; si ya se pudo pushear, `git fetch origin juan/camara-telefono && git switch juan/camara-telefono`). Luego `cd web && npm install` (suma `uqr`). Probar de punta a punta: `data/serve.sh`, abrir el link con `?api=`, En vivo → "Usar el teléfono como cámara" → escanear con el iPhone (la página del teléfono tiene que ser el deploy HTTPS, así que **la pantalla `#/camara` existe en producción recién después del ship**: para probar antes del ship, shippear o apuntar `PHONE_WEB` en `live.js` a un preview). Medir la latencia persona → robot y anotarla en `data/live/README.md`. Entonces `scripts/ship.sh "feat: the phone as the live camera"`, actualizar la fila de la cámara en la tabla del pitch, y avisar a César (W12.6, su carpeta) y a Pastor (nada nuevo en `physics/`: `mimic` recibe lo mismo).
- Si Safari en iPhone pide un gesto para `video.play()`: ya hay un botón ("Usar la cámara"), así que debería bastar; si no, mover `createLiveCapture` dentro del mismo click (ya lo está).
- Idea para después: `sendBeacon` en `pagehide` del teléfono si `fetch keepalive` no llega a salir en Safari (hoy la Mac igual lo nota a los 5 s).
