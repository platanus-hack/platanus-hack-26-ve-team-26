# Tridi

**Robots que aprenden de un video.**

Los robots humanoides ya tienen cuerpo; lo que les falta es experiencia. Enseñarles a moverse exige miles de ejemplos de movimiento humano, y grabarlos con trajes de captura es caro y lento. Tridi usa lo que ya existe en todas partes: video de personas.

## Cómo funciona

1. **Captura.** Un video de celular o la cámara en vivo. Si hay varias personas, Tridi elige a una y la sigue en todo el video.
2. **Esqueleto 3D.** Cada cuadro se convierte en los 33 puntos 3D del cuerpo de esa persona, suavizados en el tiempo.
3. **Al cuerpo del robot.** El movimiento pasa a las 29 articulaciones de un Unitree G1 dentro de MuJoCo, un motor de física.
4. **Práctica con física.** Una política (una red neuronal pequeña) aprende el movimiento por imitación y refuerzo; la de estar de pie aprende además a aguantar empujones.
5. **Entrega.** La política en ONNX, lista para correr, y los datos del movimiento corregidos por la física, probados en cuatro mundos: piso plano, piedras, piso resbaloso y viento.

## Qué puedes probar en la web

- **El robot con física real, en tu navegador:** MuJoCo simula 250 veces por segundo y la política decide 50 veces por segundo. Empújalo y mira cómo se recupera.
- **En vivo:** muévete frente a la cámara del computador y el robot te copia. La cámara del teléfono y el entrenamiento de tus clips pasan por nuestro servidor de videos, cuando está encendido.
- **La entrega:** la política y los datos de la caminata, con la repetición de cada episodio en los cuatro mundos, la telemetría y las descargas.

## Dónde estamos

- **De pie:** la política se sostiene sola 20 s sin girar y aguanta la mayoría de los empujones de 250 N (60 M pasos de práctica).
- **Caminar como la persona del video:** la política de imitación sigue 3,5 s de los 11,8 s de la caminata; sigue entrenando.
- **Lo que viene:** que cualquier movimiento se aprenda entero en cualquier terreno, esquivar obstáculos y probar la política en un robot real.

Equipo 26 · Platanus Hack 26 Caracas · Track 🧊 Three-Dimensional.
