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

Votos hasta ahora (faltan Juan y Pastor; la votación cierra con los 4):

- **César:** figure.ai, skild.ai, scale.com, con base clara (blanco tirando a gris claro).
  - De figure.ai: el robot como protagonista y casi nada más alrededor.
  - De skild.ai: vender el cerebro (la política), no el robot.
  - De scale.com: el tono de empresa de datos para IA, con cifras.

La primera versión de la web (`web/`, M9) usa esto: base `#f1f2f4`, superficies blancas, tinta `#11141a`, acento cobalto `#2952ff`, Geist y Geist Mono. Si el voto de los 4 cambia la dirección, se ajustan los colores en `web/src/style.css` (`:root`).

**Voto de Ale (24 de octubre).** Abrí las diez de la lista en el navegador antes de votar; las notas de abajo son de lo que se ve hoy, no de memoria. Las tres no se solapan: una resuelve **qué vendemos**, otra **cómo sonamos** y otra **qué es el héroe de la página**.

| # | Referencia | Por qué esta | Qué tomar |
| --- | --- | --- | --- |
| 1 | [scale.com](https://scale.com) | **Es nuestro análogo de negocio:** vende datos para entrenar modelos, a empresas. Es la única de la lista que resuelve el problema de presentar un producto que no se puede fotografiar | Base casi negra con **un solo acento**; un titular enorme de una sola frase y nada más en el primer pantallazo; el par de botones (probar / hablar con el equipo) arriba a la derecha |
| 2 | [physicalintelligence.company](https://www.physicalintelligence.company) (hoy redirige a pi.website) | **El tono técnico que nos conviene:** es casi un índice de investigación, con entradas fechadas y texto plano, sin una sola decoración. Es exactamente el registro de "cada cifra con su fuente" de `marca.md` | La sección de resultados como **lista fechada con su enlace al repo**; la disciplina de no decorar; que el texto sea el contenido y no el relleno entre imágenes |
| 3 | [figure.ai](https://www.figure.ai) | **El héroe es el producto, a sangre, con casi nada de texto.** Nuestro equivalente no es una foto: es el G1 en vivo que se puede empujar. Es el permiso para dejar la simulación ocupando toda la pantalla | Hero a pantalla completa ocupado por el producto; navegación mínima; una línea corta y un botón sobre la imagen |

**Mi voto en contra de [linear.app](https://linear.app), que probablemente alguien proponga:** el oficio es innegable, pero al abrirla el hero quedó **en negro** mientras cargaba el JavaScript, y la primera impresión es lo único que tenemos. Un sitio cuyo primer pantallazo depende de animación pesada es justo lo que no podemos permitirnos el domingo, con el jurado abriéndolo desde su celular y en la red del venue. Si se quiere oficio de modo oscuro, está en Scale sin el riesgo.

**Las otras seis, en una línea:** anduril.com es cinematográfica y pide video de producción que no tenemos; bostondynamics.com y agilityrobotics.com venden un robot físico con casos de uso, que no es lo nuestro; skild.ai está cerca (venden un modelo, no un robot) y sería mi cuarta; developer.nvidia.com/isaac sirve para la sección de tecnología, no para el tono; palantir.com es demasiado corporativa para un repo open source.

**Lo que ninguna referencia cambia:** el punto 7 de [`../marca.md`](../marca.md) (estilo propio, no clonar) y la tabla "Lo que NO podemos decir" de [`../pitch/diferencia.md`](../pitch/diferencia.md#lo-que-no-podemos-decir), que ahora incluye la prohibición de "clientes" y de logos de terceros.
