---
persona: Juan
rama: juan/data
sesion: 32e0dcb2-9db9-43bc-8c85-e727bde56451
inicio: 2026-10-23 23:00
estado: en curso
---

# Fase 1 de data/: video → PoseClip

## Objetivo

CLI `python -m data.extract <video|zip> [--click x,y]` que sigue a un sujeto entre varias personas y saca su `PoseClip` (JSON + `.npz`) según el contrato, más 2 o 3 clips precargados.

## Qué se hizo

- Proyecto Python con uv en `data/` (Python 3.12: torch no tiene ruedas para el 3.15 de Homebrew).
- `track.py`: YOLO11s-pose + ByteTrack, puntaje tamaño × centro × tiempo, `--click`, empalme de ids tras oclusión.
- `lift.py`: MediaPipe Pose Landmarker heavy sobre recorte cuadrado; chequeo contra los puntos de YOLO; filtro de frames "volteados"; trayectoria de caderas; normalización al contrato.
- `extract.py`: CLI, `.zip` video por video con progreso y resumen; `overlay.py` dibuja al sujeto sobre el video.
- Precargadas en `data/clips/`: `caminar-perfil` (100% válido, 0.71 m/s) y `correr-perfil` (97%, 3.6 m/s). Uso y límites en [`../../data/README.md`](../../data/README.md).

## Qué funcionó

- Video de 5 estudiantes de espaldas (Mixkit 4519): los 5 ids de ByteTrack duran los 603 frames sin cambios; el automático elige al del centro; `--click 180,450` sigue a la de vestido verde. Comprobado con el overlay.
- `.zip` con un video cortado a 50 KB, un `.txt` y dos videos buenos: 2 clips, 1 falla con mensaje claro y el lote sigue.
- Caminata de perfil con gente al fondo: 100% de frames válidos, la gente del fondo no interfiere.

## Qué no funcionó

- Comparar MediaPipe con YOLO tal cual rechazaba el 65% de frames de la gente de espaldas: uno de los dos modelos cambia izquierda por derecha. Ahora el emparejamiento espejado también cuenta y un filtro aparte quita los frames donde el cuerpo mira al revés que sus vecinos (±0.5 s).
- Personas de espaldas con los pies fuera del cuadro: ~50% válido. Es correcto descartarlos (sin piernas no sirven para el robot).
- Trayectoria solo por ajuste a la cámara: con cámara que sigue a la persona el avance sale 0. Solo por pies: de frente sale 0 (MediaPipe casi no ve la profundidad de los pies). Se combinan por eje, quedándose con la que más se mueve. Aun así, correr de frente con cámara siguiendo sigue en ≈ 0: **hay que grabar de perfil**.
- El modo IMAGE de MediaPipe (detectar en cada frame en vez de seguir) no mejoró el caso de espaldas: 45% vs 44%. Se quedó VIDEO, que es más suave.

## Decisiones

- `.npz` lleva extras además de lo del contrato (`valid`, `frame_index`, `joints2d`, `boxes`): no cambian el contrato, solo agregan.
- Frames malos se interpolan y llevan visibilidad 0 en el JSON, en vez de cortar el clip.
- Para los clips nuestros (precargadas buenas y la demo): grabar de perfil, cámara fija o paneando, cuerpo entero en cuadro. César: vale la pena decirlo en la UI de subida.

## Sigue

- Pastor: probar el retargeting con `data/clips/*.npz`.
- Grabar a Pastor/César caminando y corriendo de perfil con el teléfono (focal conocida) para precargadas propias.
- Fase 2: módulo JS con MediaPipe en el navegador que emita el mismo `PoseClip` para `web/`.
- Shipeado a `main` como `14045b3`. Al rebasear entró el G1 de Pastor; su pregunta de la traslación de la pelvis quedó respondida en [`../preguntas-abiertas.md`](../preguntas-abiertas.md): ya viene en el `PoseClip`. Ojo Pastor: el contrato usa y arriba, MuJoCo z arriba.
