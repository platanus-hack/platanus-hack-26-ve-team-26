# La web queda en En vivo y la entrega; sin laboratorio y con subir video en "Próximamente"

- **Fecha:** 2026-10-24 · **Quién:** Juan · **Estado:** vigente, salvo subir video, que se volvió a prender el 24-10 (ver abajo). Reemplaza las tres opciones del menú de [`2026-10-24-ui-menu-y-carga-por-etapas.md`](2026-10-24-ui-menu-y-carga-por-etapas.md)

## Contexto

La web tenía cuatro formas de probar Tridi: cámara en vivo, subir un video, "Persona y robot, lado a lado" (Simulaciones: galería de clips, el esqueleto junto al robot, mundos, entrenar desde la web) y la entrega. Para la demo se quiere un recorrido corto y que funcione siempre.

## Decisión

- El cierre de la landing muestra tres tarjetas: **Muévete y el robot te copia** (`#/en-vivo`), **Sube un video de una persona** (desactivada, "Próximamente") y **La política y los datos que entregamos** (`#/entrega`).
- Se borró Simulaciones: `screens/simulations.js`, `gallery.js`, `stage.js`, `training.js` y `props.js`, y la ruta `#/simulaciones` (una dirección vieja abre la landing). Lo compartido queda: `looks/`, `skeleton.js`, `motions.js`, `video-overlay.js`, `robot-pane.js`.
- `#/subir` se apagó en el router, pero `screens/upload.js` queda para volver a prenderlo. Sus enlaces "Verlo en simulaciones" habrá que cambiarlos entonces.
- En vivo ya no graba: sin "Parar y guardar", contador ni clip guardado. Sin laboratorio, el clip no tenía dónde verse ni entrenarse.

## Consecuencias

- César: su pantalla de Simulaciones (y lo que estaba mejorando en ella) ya no está en `main`.
- Pitch (Ale): `pitch/guion-video-2-minutos.md` filma los mundos y `g1-walk` en Simulaciones, y `pitch/guion-3-minutos.md` dice "suban un video suyo". Hay que cambiar esas tomas y esa frase.
- Quedan reglas de CSS de Simulaciones en `web/src/style.css` que ya no usa nadie: se pueden borrar con cuidado, porque varias clases (`card`, `stage`, `saved`) también las usan la entrega y la pantalla de subir.

## Actualización (2026-10-24, noche)

- Subir video vuelve: la tarjeta del cierre abre `#/subir` otra vez y la ruta está prendida en el router. Sus enlaces a Simulaciones ahora van a En vivo, a la entrega y al inicio.
- Necesita el servidor de videos (`data/serve.sh`). Si no está, la pantalla dice que está apagado y ofrece la cámara y la entrega.
