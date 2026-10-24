# data/live: pose en vivo desde la cámara

Cámara → MediaPipe Pose Landmarker en el navegador, cada cuadro → al parar de grabar, un `PoseClip` con `source: "camera"`, igual al que saca [`../extract.py`](../extract.py) de un video subido ([contrato](../../docs/contrato.md)). Dueño: Juan. Lo usa la web (César, `web/TAREAS.md` W4).

## Cómo correrlo

```bash
cd data/live
npm install
npm run dev      # demo: cámara o un video, esqueleto encima, grabar y descargar el PoseClip
npm run check    # en Node: una persona sintética camina a 1,2 m/s; el clip debe cumplir el contrato y dar esa velocidad
npm run build    # dist/ estático
```

## Para la web (César): `createLiveCapture`

```js
import { createLiveCapture, drawSkeleton, CameraError } from 'tridi-live'; // o '../data/live/src/index.js'

try {
  const live = await createLiveCapture(videoElement, {
    model: 'full',                                   // 'lite' en celulares
    onProgress: ({ stage, done }) => {},             // 'model' y luego 'camera'
    onPose: (pose) => drawSkeleton(ctx, pose?.landmarks, pose?.visible), // cada cuadro; null si no hay nadie
  });
  live.startRecording();
  const clip = live.stopRecording(); // PoseClip listo para la galería o el retargeting
  live.fps();                        // cuadros procesados en el último segundo
  live.stop();                       // apaga la cámara y libera el modelo
} catch (e) {
  if (e instanceof CameraError) mostrar(e.message); // mensaje en español: permiso negado o sin cámara
}
```

La web pone el `<video>` (y un `<canvas>` encima para `drawSkeleton`, con el tamaño en píxeles del video). Con la opción `stream` se le puede pasar otro `MediaStream` en vez de la cámara, por ejemplo `videoDeArchivo.captureStream()`: así se probó sin webcam. `facingMode: 'environment'` pide la cámara trasera de un teléfono (para filmar a otra persona); por defecto es `'user'`.

## El teléfono como cámara (En vivo)

Para filmar a alguien de pie sin mover la Mac ([contrato](../../docs/contrato.md#el-teléfono-como-cámara-propuesta-de-juan-2026-10-24)). En la Mac, En vivo → "Usar el teléfono como cámara" abre una sesión en el servidor de video y muestra un QR; el teléfono lo escanea, abre `#/camara/<sesión>` (con el `?api=` del túnel), pide su cámara trasera y manda las poses; la Mac las recibe y las trata **igual que las de su webcam**: el robot copia y Grabar guarda el mismo `PoseClip`. El servidor solo las pasa de un lado al otro, en memoria ([`../relay.py`](../relay.py)): no guarda ni video ni poses.

```js
import { openPhoneSession, phonePageUrl, createPhoneCapture, createPhoneSender, createImageGrabber, closePhoneSession } from 'tridi-live';

// En la Mac (web/src/screens/live.js): misma interfaz que createLiveCapture, más source, size(), onImage y onStatus.
const { sessionId } = await openPhoneSession(base);
const url = phonePageUrl('https://tridi-alpha.vercel.app/', base, sessionId); // lo que va en el QR
const live = createPhoneCapture(base, sessionId, { onPose, onImage: (src) => (img.src = src), onStatus: ({ state }) => {} });
live.startRecording(); live.stopRecording(); live.fps(); live.stop(); // stop() cierra la sesión y el teléfono lo ve

// En el teléfono (web/src/screens/phone.js): la misma captura, cámara trasera, y cada pose se manda.
const sender = createPhoneSender(base, sessionId, { onStatus: ({ state, fps, watchedS }) => {} });
const grabber = createImageGrabber(video); // la imagen de la cámara para la Mac, 15 por segundo
const cam = await createLiveCapture(video, { model: 'lite', facingMode: 'environment', onPose: (pose) => sender.push(pose, video.videoWidth, video.videoHeight, grabber.grab()) });
```

- **Estados.** De la Mac: `waiting` (el QR en pantalla), `streaming`, `lost` (5 s sin cuadros: un corte del túnel dura 1 o 2 s, un teléfono bloqueado no vuelve) y `ended` (el teléfono o el servidor cerraron la sesión). Del teléfono: `sending`, `unwatched` (la Mac no pide hace 5 s), `offline` (el servidor no contesta; los cuadros esperan al próximo intento, hasta 1 s) y `ended`.
- **La Mac ve lo que ve el teléfono.** Uno de cada dos cuadros lleva la imagen de la cámara en JPEG (480 px el lado largo, al 60 %, ~20 KB): la Mac la pone donde iría el video de la webcam y pinta el esqueleto encima, sin espejo porque la cámara trasera filma a otro. Como imagen y pose viajan en el mismo cuadro, nunca se desfasan. Son ~300 KB/s por el túnel; un lote que se atrasó se reintenta sin sus imágenes viejas.
- **El filtro One Euro corre una sola vez, en el teléfono** (dentro de `createLiveCapture`); la Mac reproduce los cuadros tal cual. Como llegan en ráfagas de ~3 cada 100 ms, `createPhoneCapture` los reproduce a su hora (el reloj del teléfono más el mayor retraso visto en los últimos 2 s): el robot se mueve a 30 cuadros por segundo y no a saltos de 10.
- **Latencia esperable: 150 a 300 ms** de la persona al robot: la espera del lote (50 ms en promedio), dos pasos por el túnel y la reproducción. Alcanza para que el robot copie; no para un juego de reflejos.
- **HTTPS.** La cámara solo existe en páginas seguras: por eso el QR apunta al deploy (`tridi-alpha.vercel.app`) aunque la Mac esté en `localhost:5173`, y el servidor tiene que ser el túnel (`?api=` de `data/serve.sh`), nunca `127.0.0.1`. Sin servidor, el botón solo dice por qué y la webcam sigue igual.
- **Probarlo sin navegador:** con el servidor corriendo, `npm run check-relay`: un teléfono falso camina 4 s a 1,2 m/s por el relay real, la Mac falsa graba y el clip recupera esa velocidad; uno de cada dos cuadros lleva una imagen del tamaño de una real y la Mac las muestra todas, en orden; después el teléfono se calla y la Mac lo nota a los 5 s.

## Subir videos al servidor (César, W5 y W6)

```js
import { resolveApiUrl, checkApi, uploadVideo, watchJob, chooseSubject, firstFrameUrl, fetchClip, UploadError } from 'tridi-live';

const base = resolveApiUrl({ fallback: 'http://127.0.0.1:8000' }); // ?api= del link, o la última vista
if (!(await checkApi(base))) mostrarSoloGaleria(); // servidor apagado: la web sigue con las precargadas
const jobId = await uploadVideo(base, file, { onProgress: ({ sent, total }) => {} }); // reintenta cada pedazo
const job = await watchJob(base, jobId, { onUpdate: (job) => {} }); // etapas y avance de cada video
const clip = await fetchClip(base, job.videos[0].clip_id);
// W5.3: dibujar job.videos[n].people sobre firstFrameUrl(base, jobId, n); con un click:
await chooseSubject(base, jobId, n, x, y); // y otra vez watchJob
```

## Entrenar un clip (WEB-2)

```js
import { sendClip, trainClip, watchTraining } from 'tridi-live';

const clipId = clip.source === 'camera' ? await sendClip(base, clip) : clip.id; // la cámara manda su PoseClip (POST /clips)
const trainId = await trainClip(base, clipId); // a la cola; si ya estaba, el mismo train_id
const train = await watchTraining(base, trainId, { onUpdate: (t) => {} }); // GET /train cada 2 s, con reintentos de red
// train.state === 'done' && !train.error → la entrega está en #/entrega/<clipId>
```

**URL del servidor:** el túnel cambia de URL en cada arranque, así que `data/serve.sh` imprime y copia el link de la web con `?api=<url del túnel>` (por ejemplo `https://tridi-alpha.vercel.app/?api=https://xxxx.trycloudflare.com`). `resolveApiUrl` lo lee y lo guarda en el navegador, así que recargar o volver sin el parámetro sigue funcionando. Solo acepta URLs `http(s)`.

Los errores del servidor llegan como `UploadError` con el mensaje en español. Formato de cada respuesta en el [contrato](../../docs/contrato.md).

## Cómo funciona

| Archivo | Qué hace |
| --- | --- |
| `src/index.js` | Carga MediaPipe (WASM desde jsDelivr y el modelo desde Google, versión fija), abre la cámara, procesa cada cuadro nuevo en modo VIDEO y guarda las muestras mientras se graba |
| `src/poseclip.js` | Muestras → `PoseClip`. Los mismos pasos y umbrales que [`../lift.py`](../lift.py): visibilidad mínima, frames "volteados", trayectoria de las caderas por pie apoyado y por ajuste a la cámara, ejes y origen del contrato. Además remuestrea a 30 fps fijos, porque las webcams entregan cuadros a ritmo irregular |
| `src/draw.js` | El esqueleto sobre el video, mismos colores que `data.overlay` |
| `src/api.js` | Dónde está el servidor: `?api=` o la última URL guardada, y si responde |
| `src/upload.js` | Cliente del servidor de video: subida por partes con reintentos, progreso, elegir sujeto |
| `src/relay.js` | El teléfono como cámara: el teléfono manda las poses en lotes de 100 ms, la Mac las recibe con *long polling* y las reproduce con la misma interfaz que la webcam |
| `scripts/check.mjs` | Prueba sin navegador |
| `scripts/check-relay.mjs` | Las dos mitades del relay contra el servidor real, sin navegador |

## Números medidos (Mac M2, 23 de octubre)

| Qué | Valor |
| --- | --- |
| Procesamiento en el navegador, modelo `full` con GPU | 30 fps (el ritmo del video) |
| Mismo video de caminata, mismos landmarks, JS vs Python | 0,77 vs 0,71 m/s |
| Caminata de perfil en vivo (video como cámara) | 100% válidos, 1,0 m/s |
| Lo mismo el 24 de octubre, primeros 8 s del video | 30 fps, 100% válidos, 1,14 m/s (Python con el modelo `heavy` da 0,74 m/s en esos 8 s) |

## Límites conocidos

- **Personas lejos o chicas no se ven:** sin el recorte de YOLO, MediaPipe busca en la imagen entera. El video de la corredora (26 px de ancho al entrar) da 0 cuadros en vivo y 97% en `extract.py`. Para la webcam del stand no importa: la persona está cerca.
- **Una sola persona:** en vivo no hay YOLO ni ByteTrack; MediaPipe sigue al cuerpo más claro. Con varias personas en cuadro puede elegir a cualquiera.
- **Bajo ~20 fps el avance sale mal:** la trayectoria sigue al pie apoyado cuadro a cuadro y con huecos pierde pasos. Pasa con la pestaña oculta o en celulares lentos con `full`; `fps()` sirve para avisarlo.
- Los mismos límites de [`../README.md`](../README.md): grabar de perfil y con el cuerpo entero en cuadro.
