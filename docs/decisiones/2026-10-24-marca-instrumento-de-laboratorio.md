# Marca y landing: instrumento de laboratorio, con el G1 real en cada imagen

- **Fecha:** 2026-10-24 · **Quién:** Juan · **Estado:** vigente. Reemplaza la presentación de [`2026-10-24-web-intro-dos-slides-estilo-claro.md`](2026-10-24-web-intro-dos-slides-estilo-claro.md) (César) y concreta [`2026-10-24-marca-b2b-robotica.md`](2026-10-24-marca-b2b-robotica.md). Falta conversarlo con César.

## Contexto

La web tiene que verse como el producto técnico que es (Physical AI para empresas de humanoides) y contar el [pitch del producto](../pitch/pitch-producto.md). Referencias elegidas por Juan: [motubrain.com](https://www.motubrain.com/en/), [claru.ai](https://claru.ai/), [pi.website](https://www.pi.website/), [scale.com/physical-ai](https://scale.com/physical-ai) y [typesafe.ai](https://typesafe.ai/).

## Decisión

- **Tono:** instrumento de laboratorio. Papel cálido `#eeece7` y tinta `#0d0d0b`, bandas oscuras alternadas, **un solo acento: naranja señal `#ff4f1a`** para lo que se mueve o se toca. Tokens en `web/src/style.css` (`:root`).
- **Tipografía:** Inter Tight para todo (titulares grandes y apretados), Geist Mono para números, etiquetas (`// 02 — Cómo funciona`) y telemetría.
- **Ventanas con barra negra** alrededor de todo lo real (simulación, esqueleto, log de entrenamiento), con su nombre técnico (`sim.01 — unitree_g1 · mujoco`).
- **Toda la media es el sistema de verdad, no renders:** el G1 de `physics/` (un solo robot que pasa de ventana en ventana al hacer scroll), el esqueleto del `PoseClip` de `data/` y la curva de `training/policies/*-progress.csv`. Nada de video de stock ni ilustraciones.
- **Landing de 7 bloques** con el texto del pitch: hero con el G1 que se deja empujar · el problema · cómo funciona (persona y robot en paso) · laboratorio (escalera de checkpoints que se empuja sola + curva) · mundos variados (lo que no existe todavía dice "en camino") · qué entrega · lo decimos claro (MuJoCo, no es un LLM) · pruébalo.
- **Sin splash:** la página aparece al instante y las ventanas del robot muestran su descarga.

## Qué tomamos de cada referencia

| Referencia | Qué se toma |
| --- | --- |
| typesafe.ai | Titulares gigantes y apretados, ventanas tipo sistema operativo, tramado de puntos (la curva y el bloque naranja), cifras grandes |
| claru.ai | Etiquetas mono `// SECCIÓN`, la segunda frase del titular en gris, el pipeline por pasos |
| scale.com/physical-ai | Bandas oscuras y sobrias para lo técnico |
| pi.website | Sobriedad de laboratorio: texto corto, números con su fuente |
| motubrain.com | El robot como protagonista del primer pantallazo |

## Consecuencias

- Las pantallas de la app (`#/en-vivo`, `#/subir`, `#/simulaciones`) heredan colores y tipografía por los tokens, pero conservan su maquetación y los robots de puntos azules: falta pasarlas al mismo estilo (César).
- El nombre sigue siendo provisional; la marca no depende de él (el wordmark es texto + el ícono de la figura).
