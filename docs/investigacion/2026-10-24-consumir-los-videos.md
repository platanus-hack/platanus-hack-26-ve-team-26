# Cómo consumir los videos para entrenar: opciones, no una receta

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** investigación, **para decidir quien programa**

Esto acompaña a [`../videos-para-datos.txt`](../videos-para-datos.txt) (188 enlaces). **No es una decisión ni una instrucción**: es lo que encontré leyendo cómo lo hacen los proyectos que hacen exactamente esto, con sus números y sus fuentes, para que Pastor, Juan y César tengan una base y elijan — o busquen por su lado y elijan otra cosa. Si alguien llega a algo mejor, esto se tacha y se reemplaza.

Leí antes lo que ya existe en el repo: [`data/README.md`](../../data/README.md) (pasos 1 a 4), [`docs/contrato.md`](../contrato.md) (cómo viaja la pelvis en `RobotMotion`) y [`docs/plan-producto.md`](../plan-producto.md) (los dos errores ya arreglados y el que queda).

---

## 1. Lo primero: el cuello de botella no son los videos

El pipeline de hoy es **YOLO11-pose + ByteTrack → MediaPipe heavy sobre el recorte → Savitzky-Golay → trayectoria reconstruida**. Los tres primeros pasos están bien resueltos. El cuarto es el que decide si el robot camina:

> MediaPipe da la pose **centrada en las caderas, sin desplazamiento**. `lift.py` la reconstruye por dos vías (el pie de apoyo quieto en el suelo, y el ajuste de la pose 3D a la imagen) y en cada eje gana la que más se movió. — `data/README.md`

Y el síntoma ya está medido en el repo: **el robot avanza a 0,47 m/s cuando la referencia va a 0,78** (`plan-producto.md`), y la bitácora de entrenamiento dice que *"the robot still falls behind the path"*.

**La buena noticia: ese enfoque no es un parche, es lo que hace la literatura.** HuB desplaza la raíz durante el apoyo simple dejando los ángulos quietos, para que el pie plantado no patine ([arXiv 2505.07294](https://arxiv.org/pdf/2505.07294)); WHAM corrige la velocidad de la raíz con probabilidades de contacto del pie, y avisa que eso mete ruido cuando el contacto o la pose se estiman mal ([arXiv 2312.07531](https://arxiv.org/pdf/2312.07531)). Un trabajo de retargeting en coordenadas de mundo dice lo mismo que nos está pasando: la ambigüedad de profundidad de una sola cámara hace que la traslación global salga ruidosa, y eso se ve como temblor y como pies que patinan ([arXiv 2512.21573](https://arxiv.org/pdf/2512.21573)).

**O sea: el problema no es qué video se elige, sino de dónde sale el recorrido de la pelvis.** Por eso las opciones de abajo se ordenan por cómo resuelven eso.

## 2. Las opciones

| | Qué es | Trayectoria global | Costo de integrar | ¿Corre en Mac? | Riesgo |
| --- | --- | --- | --- | --- | --- |
| **A. Lo que ya existe** | YOLO+ByteTrack+MediaPipe y la reconstrucción por apoyo del pie | Heurística propia, la que ya está medida | 0 h | Sí, ~40 s por 10 s de video | Ninguno: es lo que hay |
| **B. Cambiar solo el "levantar a 3D"** | Dejar `track.py` y reemplazar `lift.py` por **GVHMR** | **Viene resuelta**: SMPL en marco de mundo, con la traslación | Media: una dependencia pesada y convertir SMPL a lo que espera el retargeting | Un fork dice soportar Apple Silicon; **sin verificar** | El formato de salida cambia |
| **C. El camino de los papers** | **GVHMR → GMR** | Viene resuelta y el retargeting también | Alta: dos dependencias nuevas y una conversión que **ningún script oficial hace** | GMR sí (corre en CPU en tiempo real); GVHMR, sin verificar | Alto para 36 h |
| **D. No usar video para caminar** | Sacar la referencia de **mocap** (AMASS, LAFAN1) y dejar el video para el show | Perfecta, viene del mocap | Baja | Sí | **Licencia: LAFAN1 es CC-BY-NC-ND, no comercial** |
| **E. Raíz sintética** | Los ángulos salen del video; el avance se impone constante, sacado de la cadencia y el largo de zancada | Inventada pero limpia | Baja | Sí | Deja de ser "del video"; solo sirve para caminatas parejas |

### Lo que dice cada fuente, en corto

- **GVHMR** (SIGGRAPH Asia 2024, TPAMI 2026): de un video monocular saca movimiento SMPL **en marco de cámara y de mundo**, con coordenadas "gravity-view". Sus autores reportan **78,8 mm de WA-MPJPE en RICH contra 109,9 de WHAM (−28 %)** y menos deslizamiento de pies; y no es autoregresivo, así que no acumula error ([proyecto](https://zju3dv.github.io/gvhmr/), [alphaXiv](https://www.alphaxiv.org/overview/2409.06662)).
- **Ojo con esa comparación:** una tabla de CVPR 2026 (OnlineHMR) pone a **TRAM por delante de GVHMR** en EMDB-2 (76,4 contra 111,0 mm), y a GVHMR por delante de WHAM ([PDF](https://openaccess.thecvf.com/content/CVPR2026/papers/Zhao_OnlineHMR_Video-based_Online_World-Grounded_Human_Mesh_Recovery_CVPR_2026_paper.pdf)). **El orden depende de qué paper se le crea**, y casi siempre gana el que publica. TRAM además necesita SLAM para la cámara, que es otra pieza.
- **GMR** (ICRA 2026): retargetea movimiento humano a varios humanoides **en tiempo real y en CPU**, el G1 entre ellos; en su evaluación sale más fiel que PHC y ProtoMotions. Su propio paper avisa que **solo lo probaron con LAFAN1 y que falta estudiarlo con movimiento reconstruido de video monocular** ([arXiv 2510.02252](https://arxiv.org/abs/2510.02252)).
- **MimicX** (2026) usa justo **GVHMR para reconstruir y GMR para retargetear**: es la combinación por defecto del estado del arte ([arXiv 2610.09055](https://arxiv.org/html/2610.09055)).
- **BeyondRetarget** (2026) dice tener **menos error de trayectoria y menos deslizamiento que los pipelines de dos etapas GVHMR→GMR y WHAM→GMR**, haciéndolo de una sola pieza ([arXiv 2609.29850](https://arxiv.org/pdf/2609.29850)). Dato de su propio paper.
- **Apple Silicon: no encontré ningún número.** Todas las velocidades publicadas son de CUDA (GVHMR: 1.430 cuadros en 0,28 s en una RTX 4090). Hay un fork que dice correr en Apple Silicon con instalación por pip, pero **nadie lo verificó aquí**. Esto es lo primero que habría que probar antes de comprometerse con B o C.

## 3. Lo que recomendaría yo, y por qué

**Para el domingo: A, con una prueba acotada de B.** No porque A sea lo mejor, sino porque es lo único que ya está medido y porque el reloj manda. La prueba de B que vale la pena son 30 minutos: instalar el fork de GVHMR, correrlo sobre **un** clip de perfil de los que ya funcionan, y comparar el recorrido de la pelvis contra el que saca `lift.py` hoy. Si GVHMR corre en la Mac y la trayectoria sale más limpia, se gana exactamente lo que falta; si no corre, se perdieron 30 minutos y queda escrito.

**D merece una conversación aparte**, porque es incómoda pero honesta: si lo que se quiere es *que el robot camine bien en la demo*, una caminata de mocap es gratis, perfecta y sin ruido de trayectoria. Lo que se pierde es la historia, que es justamente "de cualquier video". Mi opinión: **el video tiene que quedarse en el camino principal** porque es el producto; el mocap sirve como control — si con mocap tampoco camina, el problema no estaba en los datos sino en el entrenamiento, y eso se sabe en una hora.

## 4. Lo que sí vale la pena arreglar en los videos, pase lo que pase

Esto no depende de qué opción se elija y **no está en el TXT**:

1. **La cámara lenta miente sobre el tiempo.** En la lista hay unos 30 enlaces de *slow motion* (incluido uno a 5.000 fps). Si se procesan tal cual, el `PoseClip` queda con las velocidades divididas por el factor de cámara lenta, y como la recompensa de imitación **sigue velocidades**, el robot aprendería a moverse a cámara lenta. Hay que **devolver el clip a tiempo real con `ffmpeg` antes de procesarlo**, o anotar el factor en el clip. Es el error más fácil de cometer con esta lista.
2. **Normalizar a 30 fps.** Varios son de 60 fps; el contrato dice 30.
3. **La regla de "de perfil" del TXT tiene respaldo:** la ambigüedad de profundidad de una sola cámara es justo sobre el eje que mira la cámara ([arXiv 2512.21573](https://arxiv.org/pdf/2512.21573)). De frente, el avance se va por ese eje y sale casi cero. La regla está bien puesta.
4. **Bajar con `yt-dlp` y cortar con `ffmpeg`** clips de 10 a 30 s, que es el tope del servidor (30 s) y lo que pide el pipeline.
5. **Licencia:** son videos de terceros. Para probar y para la demo, bien; **para publicar un dataset, no**. Ya está dicho en el TXT y conviene que siga dicho en voz alta.

## 5. Qué habría que medir para decidir bien

Si alguien quiere cerrar esto con datos en vez de opiniones, estas son las tres mediciones, sobre el mismo clip de caminata que ya está en `deliveries/`:

| Medida | Cómo | Para qué |
| --- | --- | --- |
| Velocidad de la pelvis de la referencia contra la real de la persona | Comparar con el largo de zancada y la cadencia contadas a mano | Dice si la trayectoria está bien escalada |
| Deslizamiento del pie en apoyo | Cuánto se mueve el pie que debería estar quieto | Es la métrica que usan todos los papers de arriba |
| `followed_s` del entrenamiento | Ya existe en el pipeline | Dice si el cambio sirve de verdad, que es lo único que importa |

Con eso, cambiar de A a B deja de ser una opinión.
