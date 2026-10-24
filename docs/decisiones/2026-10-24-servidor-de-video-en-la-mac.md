# El servidor de video corre en la Mac de Juan y solo guarda PoseClips

- **Fecha:** 2026-10-24 · **Quién:** Juan, con Pastor · **Estado:** vigente. Reemplaza el punto 3 (Render) de [`2026-10-23-deploy.md`](2026-10-23-deploy.md).

## Contexto

`data/server.py` procesa los videos que sube la web (YOLO11-pose, ByteTrack y MediaPipe). La decisión de deploy lo ponía en Render. Además surgió la duda de dónde guardar los videos, que pueden ser muchos.

## Decisión

1. **Corre en la Mac de Juan** con un túnel de Cloudflare (`data/serve.sh`), también durante la demo del domingo de 10:00 a 14:00. La web encuentra el servidor por `?api=`.
2. **No se guardan videos, solo `PoseClip`**: los puntos son lo que sirve para entrenar. El video se borra al fallar o cancelar, y a los 10 minutos de terminar (el tiempo para elegir a otra persona). Una subida abandonada se borra a la hora.
3. **Topes por subida: 60 MB y 30 s por video.** Nadie llena el disco en vivo.

## Por qué

- **GPU:** con MPS un video de 10 s tarda ~40 s. Render no tiene GPU y sería varias veces más lento.
- **Sin storage en la nube:** un `PoseClip` pesa ~0,5 MB y el video ~20-60 MB. Guardar solo los clips hace innecesario un bucket (R2/S3) por ahora.
- **60 MB y 30 s:** 30 s de video 1080p del teléfono son ~60 MB, y alcanzan para varios pasos caminando o corriendo, que es lo que necesita la imitación.

## Consecuencias

- **Riesgo:** la subida en vivo depende de que la Mac de Juan y el túnel estén encendidos durante la demo. La galería y las simulaciones precargadas van dentro del deploy de la web y funcionan sin el servidor.
- Los `PoseClip` subidos quedan en `data/server_data/clips/` en la Mac de Juan: es donde se entrena, así que no hay que moverlos.
- Si el servidor tiene que vivir sin la Mac (después del domingo, para el voto público), se retoma Render o un bucket.
