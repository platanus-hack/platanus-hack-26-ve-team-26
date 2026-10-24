# El servidor de video corre en la Mac de Juan y solo guarda PoseClips

- **Fecha:** 2026-10-24 · **Quién:** Juan, con Pastor · **Estado:** vigente, actualizada la tarde del 24 (puede correr en la Mac de Pastor). Reemplaza el punto 3 (Render) de [`2026-10-23-deploy.md`](2026-10-23-deploy.md).

## Contexto

`data/server.py` procesa los videos que sube la web (YOLO11-pose, ByteTrack y MediaPipe). La decisión de deploy lo ponía en Render. Además surgió la duda de dónde guardar los videos, que pueden ser muchos.

## Decisión

1. **Corre en la Mac de Juan** con un túnel de Cloudflare (`data/serve.sh`), también durante la demo del domingo de 10:00 a 14:00. La web encuentra el servidor sola: `serve.sh` publica la URL del túnel en un gist y la web la lee de ahí (actualizado el 2026-10-24; antes había que abrir la web con `?api=`, que sigue sirviendo para desarrollo).
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

## Actualización (24/10, tarde): también en la Mac de Pastor

El servidor no depende de la Mac de Juan: corre en cualquier Mac con el repo, `uv`, Node y `cloudflared` (`brew install cloudflared`), con el mismo `data/serve.sh`. Desde el sábado 24 a las 14:43 corre en la Mac de Pastor (M5, que también entrena más rápido: 14.400 pasos/s contra 11.400 de la M2), para no competir con lo que Juan tiene corriendo en la suya. Probado: `/health` responde por el túnel, el deploy pasa el CORS y la pantalla Subir se habilita con el enlace `?api=`.

- **Un servidor a la vez:** cada navegador recuerda el último `?api=` que abrió. Al cambiar de Mac hay que repartir el enlace nuevo, que `data/serve.sh` imprime y copia.
- **Los clips quedan en la Mac que los recibió** (`data/server_data/`): lo subido a una no está en la otra.
- **La demo del domingo:** cuál de las dos lo corre lo decide el equipo; la otra queda de respaldo con el mismo comando.
- Si la URL del túnel se pierde, `cloudflared` la da en su puerto de métricas: `curl http://127.0.0.1:20241/quicktunnel`.
