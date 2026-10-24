# data/: de video a `PoseClip`

Video (o `.zip` de videos) → se elige y se sigue a un sujeto → su pose 3D por frame → `PoseClip` como dice [`../docs/contrato.md`](../docs/contrato.md). Dueño: Juan.

La cámara en vivo (el mismo `PoseClip`, en el navegador) está en [`live/`](live).

**Espejo para deploy:** [`juanevillam/tridi-data`](https://github.com/juanevillam/tridi-data) copia `main` del repo del equipo; no se commitea ahí. Tras cada ship: `ALLOW_MAIN_PUSH=1 git push mirror origin/main:main` (el remoto `mirror` apunta a ese repo; la variable salta el hook que bloquea pushes a `main`, que aquí no aplica porque se copia `main` tal cual). Hoy no se despliega nada desde ahí: el servidor de videos va a correr en la Mac de Juan con un túnel.

## Uso

Requiere [uv](https://docs.astral.sh/uv/) (`brew install uv`). La primera corrida instala Python 3.12 y las dependencias, y baja los modelos a `data/models/` (no se versionan).

```bash
# Desde la raíz del repo
uv run --project data python -m data.extract video.mp4                 # sujeto automático
uv run --project data python -m data.extract video.mp4 --click 640,360 # la persona en ese punto del primer frame
uv run --project data python -m data.extract videos.zip                # lote: uno por uno, un video roto no tumba el lote
uv run --project data python -m data.overlay data/clips/<clip>.npz video.mp4  # dibuja al sujeto sobre el video
```

Sale `data/clips/<id>.json` (el `PoseClip`) y `<id>.npz` con lo mismo para entrenar: `joints [F, 33, 4]`, `t [F]` y `meta` (el JSON sin los frames). El `.npz` lleva además `valid [F]` (frames detectados, no interpolados), `frame_index`, `joints2d` y `boxes` (para el overlay y para dibujar sobre el video en la web).

## Cómo funciona

| Paso | Archivo | Qué hace |
| --- | --- | --- |
| 1. Seguir a todos | [`track.py`](track.py) | YOLO11-pose + ByteTrack ([`bytetrack.yaml`](bytetrack.yaml)) da una caja, 17 puntos y un id por persona en cada frame. |
| 2. Elegir al sujeto | [`track.py`](track.py) | Puntaje = altura de la caja × cercanía al centro × tiempo en pantalla. Con `--click`, la caja que contiene el punto en el primer frame. Si ByteTrack le cambia el id tras una oclusión, se empalma con el track nuevo que aparece cerca y del mismo tamaño. |
| 3. 3D | [`lift.py`](lift.py) | MediaPipe Pose Landmarker (heavy, world landmarks en metros) sobre un recorte cuadrado del sujeto. Un frame vale solo si MediaPipe coincide con los puntos de YOLO (si no, agarró a otra persona), el cuerpo es visible y no está "volteado" respecto a sus vecinos. Los frames malos se interpolan y quedan con visibilidad 0. |
| 4. Trayectoria | [`lift.py`](lift.py) | MediaPipe da la pose centrada en las caderas, sin desplazamiento. Se reconstruye por dos vías: el pie de apoyo quieto en el suelo, y el ajuste de la pose 3D a la imagen. En cada eje del suelo gana la que más se movió (cada una falla viendo de menos). |

Cada umbral tiene su porqué en un comentario junto a él.

## Límites conocidos

- **Graba de perfil.** De frente o de espaldas MediaPipe casi no ve la profundidad de los pies, y si la cámara además sigue a la persona, el avance sale ≈ 0. De perfil (cámara fija o paneando) el avance sale bien: 0.7 m/s caminando, 3.6 m/s trotando.
- **La distancia focal se supone** (65° en el lado largo, cámara 1x de teléfono). Con teleobjetivo (mucho video de stock) el avance hacia la cámara sale corto.
- **La escala de MediaPipe es aproximada**: los cuerpos salen ~10-20% más bajos de lo real.
- En la fase de vuelo de una carrera las caderas no suben (el apoyo se toma del pie más bajo).
- Videos en cámara lenta dan movimientos lentos: no hay forma de saberlo desde el archivo.

## Clips precargados

En [`clips/`](clips), de videos de [Mixkit](https://mixkit.co) (licencia libre de Mixkit):

| Clip | Video | Calidad |
| --- | --- | --- |
| `clip_2026-10-23_caminar-perfil_01` | Mixkit 4855, Young man walking listening to music | 100% válido, 11.8 s, 0.71 m/s |
| `clip_2026-10-23_correr-perfil_01` | Mixkit 4831, View of a park while a girl runs across | 97% válido, 3.8 s, 3.6 m/s |

Prueba de selección con varias personas: Mixkit 4519, Students walking in a university: 5 personas de espaldas, los 5 ids se mantienen todo el video y el sujeto automático es el del centro; con `--click` se sigue a otra.
