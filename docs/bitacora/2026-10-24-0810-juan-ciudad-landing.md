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

## Sigue

- César: revisar la ciudad (es su `city.js`, reescrito).
