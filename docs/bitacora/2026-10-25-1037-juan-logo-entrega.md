---
persona: Juan
rama: juan/logo-entrega
sesion: 5c1ba990-e7e0-43d3-bd64-15d1c4b27836
inicio: 2026-10-25 10:37
estado: cerrada
---

# Logo de Tridi en el archivo de entrega

## Objetivo

Que `project-logo.png` (archivo de entrega de Platanus) sea el logo de Tridi y no el genérico "PH26 Caracas" que tenía desde el commit `830afcb`. Pendiente desde `2026-10-24-1705-juan-landing-marca.md`.

## Qué se hizo

- `project-logo.png`: la marca de `web/src/brand.js` (cubo lima con la persona en las aristas), sin wordmark, sobre el fondo `--bg` (#08090b), 1000x1000, 42 KB. Colores copiados de `web/src/style.css` (`--signal`, `--signal-2`, `--signal-3`).
- La marca ocupa 640 px de los 1000 (escala 20 del viewBox de 32, margen de 180 px) para que se lea como ícono cuando Platanus la muestre chica.

## Qué funcionó

- Render del SVG con Quick Look (`qlmanage -t -s 1000`): no había rsvg, ImageMagick ni cairosvg en la Mac.
- `scripts/check-submission.sh` pasa.

## Decisiones

- Sin wordmark: el wordmark usa la fuente Inter Tight y la i sin punto; en un cuadrado de 1000 la marca sola se lee mejor.

## Sigue

- Shipear con `scripts/ship.sh` cuando el equipo lo apruebe.
