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

La web pone el `<video>` (y un `<canvas>` encima para `drawSkeleton`, con el tamaño en píxeles del video). Con la opción `stream` se le puede pasar otro `MediaStream` en vez de la cámara, por ejemplo `videoDeArchivo.captureStream()`: así se probó sin webcam.

## Cómo funciona

| Archivo | Qué hace |
| --- | --- |
| `src/index.js` | Carga MediaPipe (WASM desde jsDelivr y el modelo desde Google, versión fija), abre la cámara, procesa cada cuadro nuevo en modo VIDEO y guarda las muestras mientras se graba |
| `src/poseclip.js` | Muestras → `PoseClip`. Los mismos pasos y umbrales que [`../lift.py`](../lift.py): visibilidad mínima, frames "volteados", trayectoria de las caderas por pie apoyado y por ajuste a la cámara, ejes y origen del contrato. Además remuestrea a 30 fps fijos, porque las webcams entregan cuadros a ritmo irregular |
| `src/draw.js` | El esqueleto sobre el video, mismos colores que `data.overlay` |
| `scripts/check.mjs` | Prueba sin navegador |

## Números medidos (Mac M2, 23 de octubre)

| Qué | Valor |
| --- | --- |
| Procesamiento en el navegador, modelo `full` con GPU | 30 fps (el ritmo del video) |
| Mismo video de caminata, mismos landmarks, JS vs Python | 0,77 vs 0,71 m/s |
| Caminata de perfil en vivo (video como cámara) | 100% válidos, 1,0 m/s |

## Límites conocidos

- **Una sola persona:** en vivo no hay YOLO ni ByteTrack; MediaPipe sigue al cuerpo más claro. Con varias personas en cuadro puede elegir a cualquiera.
- **Bajo ~20 fps el avance sale mal:** la trayectoria sigue al pie apoyado cuadro a cuadro y con huecos pierde pasos. Pasa con la pestaña oculta o en celulares lentos con `full`; `fps()` sirve para avisarlo.
- Los mismos límites de [`../README.md`](../README.md): grabar de perfil y con el cuerpo entero en cuadro.
