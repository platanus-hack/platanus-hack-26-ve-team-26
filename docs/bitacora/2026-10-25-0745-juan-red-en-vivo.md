---
persona: Juan
rama: juan/red-en-vivo
sesion: c710b8bb-10e9-4db0-bb92-5b31bc116514
inicio: 2026-10-25 07:45
estado: abierta
---

# La red de la política, en 3D mientras entrena

## Objetivo

Un entrenamiento tarda ~30 min en la Mac y la caja de Entrenar solo mostraba pasos y una barra. Para la demo: ver la red neuronal de la política entrenándose, la de verdad, en 3D.

## Qué se hizo

- `training/netlive.py` (nuevo): cada 2 s `training.ppo` corre el actor de ese momento sobre las últimas 16 observaciones de un robot y escribe `training/runs/<run>/net.json`: activaciones de las 667 neuronas (190 → 256 → 128 → 64 → 29), las 500 conexiones más fuertes por capa, cuánto cambió cada capa, la exploración y la curva de recompensa y de segundos sin caerse. Si algo falla ahí, avisa una vez y el entrenamiento sigue.
- `training/ppo.py`: 4 líneas que lo llaman después de cada actualización.
- `data/server.py`: `GET /train/{id}/net`, con gzip (83 KB → 24 KB por el túnel).
- `web/src/netview.js` (nuevo): three.js. Cada esfera es una neurona real, coloreada por lo que hizo (lima positivo, azul negativo); las líneas son las conexiones más fuertes, brillan con peso × actividad; chispas recorren las que más señal llevan. Cámara que se balancea, se puede girar y hay pantalla completa. Arriba: paso, curvas y cambio de pesos.
- `web/src/training.js`: la caja de Entrenar monta la vista en la etapa de práctica; sin WebGL queda como antes.
- `docs/contrato.md`: el endpoint y su JSON.

## Qué funcionó

- Prueba de punta a punta con un servidor local aparte (puerto 8011, 600 k pasos, carpeta temporal): la caja muestra la red viva, la recompensa sube en la curva.
- `data.check_training`: all good. `npm run build` de `web/` sin errores.

## Qué no y por qué

- El entrenamiento que ya corría en la Mac (empezado 23:16, `clip_2026-10-24_camara_03`) arrancó con el `ppo.py` viejo: no escribe `net.json`. Solo los entrenamientos nuevos la muestran. No se tocó ni se reinició el servidor.

## Sigue

- Reiniciar `data/serve.sh` en la Mac para que sirva `GET /train/{id}/net` (después de que termine el entrenamiento en curso).
- Shippear a `main` para que la web desplegada la muestre.

## Reinicio del servidor sin esperar al gist

- Al reiniciar `data/serve.sh`, la web tardaba ~60 s en ver el servidor (ni un hard refresh ayudaba): cada reinicio creaba un túnel con URL nueva, y la API de GitHub sirve el gist con `cache-control: max-age=60` (el raw hasta 5 min). La caché está en GitHub, no en el navegador.
- Primer intento: copiar siempre el link `?api=`. Descartado: la demo tiene que andar con la URL normal.
- `data/serve.sh`: el túnel sobrevive al script (su propio grupo de procesos + `nohup`, pid y URL en `data/server_data/tunnel-<puerto>.*`). Ctrl+C para solo el servidor; la siguiente corrida reusa el mismo túnel, así que la URL no cambia y el gist ya es correcto. `data/serve.sh stop` apaga el túnel y escribe `null`. Además publica solo cuando `/health` local responde.
- `data/live/src/api.js`: `findApiUrl` prueba primero el servidor local de desarrollo (`127.0.0.1:8000`, solo con `npm run dev`).
- Probado en el puerto 8011 sin gist: arranca, Ctrl+C, rearranca en 3 s con la misma URL y `/health` público responde; `stop` apaga el túnel.
- Se mataron los dos entrenamientos que corrían (`clip_2026-10-24_camara_03` y `clip_2026-10-25_camara_01`), a pedido de Juan.
- Otra sesión shippeó la rama mientras tanto y el `serve.sh` nuevo y el README quedaron fuera del squash: van en este commit.
- Para la demo: el `serve.sh` que estaba corriendo es el viejo; reiniciarlo una vez con el nuevo (ese reinicio sí cambia la URL: esperar ~1 min), y desde ahí los reinicios son instantáneos.

## La caja no aparecía en tridi-alpha

- Causa: la web desplegada es `main` y esta rama no estaba shippeada. El servidor de la Mac (reiniciado 08:04 sobre esta rama) ya servía la red: el entrenamiento de las 08:06 escribe `net.json` y `GET /train/{id}/net` responde 200.
- La caja solo vive en la pestaña que empezó el entrenamiento; recargar la pierde. Nueva ruta `#/red/<train id>` (`web/src/screens/net.js`): la red de cualquier entrenamiento en pantalla grande, enlazada desde la caja ("Ver la red en pantalla grande ↗"). Probada con un servidor local aparte.
- Sigue corriendo el entrenamiento huérfano de las 23:16 (`clip_2026-10-24_camara_03`): el reinicio del servidor no lo cortó y le quita CPU al de las 08:06.
