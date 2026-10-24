# La web es un producto para empresas de robots humanoides: estilo corporativo

- **Fecha:** 2026-10-24 · **Quién:** Juan · **Estado:** vigente, **innegociable** para `web/`

## Contexto

La web nació como demo para el público (menú 3D, robots de puntos, galería). Pero lo que Tridi hace —convertir video de personas en datos de movimiento y en políticas entrenadas para un humanoide— es algo que compran las empresas que construyen humanoides (Tesla con Optimus, Figure, Agility, 1X, Apptronik, Unitree, Boston Dynamics) y los laboratorios de robótica. El jurado de Platanus es técnico y busca startups; la web tiene que verse como el producto que se le vendería a esas empresas mañana.

## Decisión

1. **La landing y la app se diseñan para un comprador de una empresa de robótica:** profesional, sobria, técnica, con números reales. Detalle en [`../marca.md`](../marca.md).
2. **Estilo propio, no una copia.** Inspiración en el tono de las marcas de deep tech (Tesla, SpaceX, Anduril, Figure…), pero con identidad distinta: nada de clonar sus layouts, tipografías ni colores.
3. **Sin logos ni nombres de terceros como clientes.** Tesla, Optimus o Figure no aparecen en la web: no son clientes ni socios, y decirlo o insinuarlo sería falso. Se habla de "equipos de robots humanoides".
4. **Lo que ya funciona se queda:** cámara en vivo, subida de videos, simulaciones, Empujar. Cambia la presentación, no las funciones.
5. Referencias para elegir el estilo: las votan los 4 (lista en [`../marca.md`](../marca.md#referencias-para-elegir)) y se combinan con los comentarios del equipo.

## Por qué

- **El producto es B2B.** El valor es para quien entrena humanoides y no tiene datos de movimiento humano a escala; un visitante casual es el público del voto, no el comprador.
- **La credibilidad se gana con sobriedad y números.** Ante un jurado técnico y un comprador técnico, una web de juguete resta, aunque el sistema sea serio.
- **Tesla y Figure como norte de tono, no como cliente:** usarlos como logos o testimonios es una mentira que un juez detecta en segundos.

## Consecuencias

- César rehace la presentación de `web/` según [`../marca.md`](../marca.md) (tarea M9 en [`../../web/TAREAS.md`](../../web/TAREAS.md)). Los robots de puntos y lo lúdico quedan solo si encajan en la paleta sobria, o salen.
- Ale alinea el pitch con el mismo mensaje y las mismas cifras.
- Toda cifra de la web sale del repo (READMEs con números medidos) y respeta "Lo que NO podemos decir" de [`../pitch/diferencia.md`](../pitch/diferencia.md#lo-que-no-podemos-decir).

## Referencias elegidas

Votos hasta ahora (falta el de Juan, Pastor y Ale; la votación cierra con los 4):

- **César:** figure.ai, skild.ai, scale.com, con base clara (blanco tirando a gris claro).
  - De figure.ai: el robot como protagonista y casi nada más alrededor.
  - De skild.ai: vender el cerebro (la política), no el robot.
  - De scale.com: el tono de empresa de datos para IA, con cifras.

La primera versión de la web (`web/`, M9) usa esto: base `#f1f2f4`, superficies blancas, tinta `#11141a`, acento cobalto `#2952ff`, Geist y Geist Mono. Si el voto de los 4 cambia la dirección, se ajustan los colores en `web/src/style.css` (`:root`).
