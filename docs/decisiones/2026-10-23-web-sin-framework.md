# La web es JavaScript y three.js, sin framework

- **Fecha:** 2026-10-23 · **Quién:** César, con Pastor (infraestructura) · **Estado:** vigente

## Contexto

`web/` había arrancado con React y TypeScript. Pastor lleva la infraestructura y el equipo quiere una página liviana que se pueda desplegar en cualquier lado, sin depender de un proveedor ni de un runtime de servidor.

## Decisión

- `web/` es **JavaScript plano con three.js**, sin React ni TypeScript. Los tipos del contrato se escriben como JSDoc (`web/src/contract.js`).
- **Vite** solo como servidor de desarrollo y empaquetador, igual que `physics/`. `npm run build` deja un `dist/` estático con rutas relativas (`base: './'`): se sirve desde cualquier host o subcarpeta, también con `python3 -m http.server`.
- Mismas versiones que `physics/`: three 0.186.1 y Vite 8.3.4.

## Por qué

- **Vite y no cero herramientas:** `createSimView` de `physics/` usa `import.meta.glob` y los imports `?url` de Vite para encontrar el WASM y las mallas del G1. Una página sin empaquetador no podría importarlo tal cual.
- **Sin framework:** la UI es una pantalla con un visor y un panel. React suma peso y un paso más sin resolver nada que el DOM no resuelva.

## Consecuencias

- Cualquier host estático sirve para el deploy (Vercel, Netlify, GitHub Pages, un servidor propio). Lo elige Pastor.
- El servidor que procesa videos (M5 y M6) sigue siendo una pieza aparte.
