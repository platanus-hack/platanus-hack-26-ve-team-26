---
persona: Juan
rama: juan/pipeline
sesion: 190d4d14-8b8c-42f0-9d64-5a4056dfc887
inicio: 2026-10-24 08:10
estado: en curso
---

# La ciudad de la landing, pegada al robot en cada toma

## Objetivo

La ciudad de César (`f7a6baa`) se veía lejos: edificios a 21 m, la calle corría a lo largo de z y la toma de Capture (que mira hacia −z) miraba por la calle hacia la niebla, sin nada detrás del robot. Además el robot caminaba hacia +x, cruzando la calle. Que en todas las tomas (hero, Capture, Gym, Policy, cierre) haya ciudad cerca detrás del robot, y mejorar el Gym.

## Qué se hizo

- `web/src/landing/city.js` reescrito: la calle corre a lo largo de x (el robot camina por su acera). Fachadas a 6,2 m del robot (su lado) y a 12,4 m (enfrente), sin estirar los modelos (8 m por unidad de Kenney: una planta ≈ 3,4 m), con frentes hacia la calle, torres detrás y una fila que cierra cada punta (x = ±78). Piso propio en 3D: aceras de losas, bordillo real y la calzada 14 cm abajo, con estacionamiento, flecha de sentido único y un paso de peatones. Utilería por código, unida por material (≈ 120 draw calls en total): postes con charcos de luz, árboles, carros estacionados, parada de bus con afiche iluminado, café con toldo, mesas y sillas, bancos, papeleras, hidrante, semáforos peatonales y letreros de neón (Café, Farmacia, Panadería, Abierto 24 h, Ferretería, Arepera, Librería). Atardecer: paredes al 20 % del colormap de Kenney y ventanas encendidas con un mapa emisivo sobre la muestra de vidrio de la paleta.
- `KEEP_CLEAR` en `city.js`: dos rectángulos donde camina y se cae el robot y por donde vuelan las cámaras (tomas y transiciones, también en celular); nada más alto que el bordillo ahí, así ninguna cosa tapa al robot ni atraviesa el lente.
- `web/src/screens/home.js`: la landing usa solo `dressCity` (el piso de `street.js` queda para la vereda de Simulaciones). Cada empujón dibuja una flecha naranja desde donde viene la fuerza (lee `xfrc_applied` del torso); en el Gym aparece un anillo de prueba de 1,2 m en el piso alrededor del robot. Velo del texto más oscuro (`landing.css`) y también en el hero, porque el fondo ahora está lleno.
- `web/src/landing/street.js`: solo el comentario de cabecera (ya no es el piso de la landing).

## Qué funcionó

- Revisado en el navegador, 1440×900 y 375×812: hero (café, farmacia y la calle hacia el fondo), Capture (taxis, Panadería y fachadas detrás del robot que camina), Gym (café detrás, anillo y flecha), Policy, cierre y las transiciones. Sin errores nuevos en consola (los únicos son el `/health` del servidor de videos apagado).

## Qué no funcionó

- Los frentes de Kenney miran a −z, no a +z como decía el comentario anterior: con la rotación vieja la fila del robot mostraba la espalda (paredes sin puertas).
- Con el colormap a 42 % las paredes seguían pastel; a 20 % ya se lee atardecer.

## Decisiones

- Sin autos en movimiento: el carril pasa por donde están las cámaras de Policy y del cierre en celular (z = −4,4 a −6,4).

- En `main` como `c336a26` ([PR #78](https://github.com/platanus-hack/platanus-hack-26-ve-team-26/pull/78)), y en el espejo `Torpass/tridi` para el deploy. Se hizo ship desde un worktree temporal (`juan/landing-city`): `ship.sh` pide árbol limpio y termina en `git reset --hard`, y este checkout tenía cambios sin commitear de otra sesión (entrega, `data/`, `training/`) que no se tocaron.

### Segunda vuelta (pedido de Juan: header, fluidez, simulación, Gym, contraste)

- **Fluidez** (`home.js`): Lenis con `lerp` 0,15 (0,09 planeaba el doble y se sentía pesado); cada parada del Gym frena el scroll una sola vez por visita y como mucho 1,2 s (antes 2,5 s, siempre); las posiciones de los capítulos se miden una vez y al cambiar de tamaño, no cada frame (leer `offsetTop` cada frame obligaba a recalcular el layout después de que GSAP y el velo escribían estilos); el velo escribe solo cuando cambia; el canvas de la landing a `devicePixelRatio` 1,5 como máximo (44 % menos píxeles que 2 en retina); sin luces puntuales en la ciudad (los charcos de luz están pintados). Medido en el navegador: 2160×1350 en vez de 2880×1800, recorrido completo a 60 fps.
- **Header**: flota separado de los bordes, siempre sobre vidrio oscuro, así el texto y el botón contrastan sobre el hero.
- **Pill del hero sin espacio**: `.landing p` (reset de padding) le ganaba a `.state` por especificidad; ahora `.landing .state`.
- **Hero**: eyebrow, segunda línea del título en naranja, los tres pasos (video → esqueleto 3D → robot que practica) y velo más fuerte.
- **Que se lea como simulación** (`landing/telemetry.js`, nuevo): grilla de medición en el piso alrededor del robot con un pulso tipo sensor, contactos de los pies, la línea entre ellos y el centro de masa (`subtree_com` del mundo) bajado al piso; todo leído de MuJoCo cada frame. Esquinas de visor y lectura de la simulación arriba a la derecha (física 250 Hz, política 50 Hz, tiempo, contactos). Se apaga en Capture (ahí el robot es títere, sin física) y el centro de masa no sale en el primer plano del hero.
- **Gym**: tarjeta oscura con título, qué es un paso en una línea, la escala real 0-40 M y las tres etapas como control segmentado, cifras como chips. La etapa "Estable" responde si más pasos sirven: pasa la prueba entera; más práctica serviría para empujones más fuertes (con 350 N aguanta 1,2 de 4, `training/README.md`). El log se esconde en pantallas de 940 px de alto o menos.
- **Policy**: misma tarjeta oscura; el texto ya no queda sobre el café.
- **Esqueleto** (`skeleton.js`, también lo usan Simulaciones y En vivo): los 11 puntos de la cara (nariz, ojos, orejas, boca) se dibujaban como un grumo; ahora una cabeza (esfera de 9 cm entre las orejas, corrida hacia la nariz) y un cuello desde los hombros.
- En `main` como `271ea6e` ([PR #79](https://github.com/platanus-hack/platanus-hack-26-ve-team-26/pull/79)) y en el espejo. Ship otra vez desde un worktree temporal; el squash se llevó también `c9a377f` (`docs(contract)`: las filas de replay se muestran como se grabaron), que otra sesión había commiteado en `juan/pipeline` justo antes. Eran 2 líneas de `docs/contrato.md`, ya en `main` dentro de este commit.

## Sigue

- César: revisar la ciudad (es su `city.js`, reescrito).
