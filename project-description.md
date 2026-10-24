# Tridi

**De video humano a un robot simulado que aprende a moverse solo.**

Los robots humanoides necesitan millones de ejemplos de movimiento humano para aprender, y grabarlos con trajes de captura es caro y lento. Tridi usa algo que ya existe en todas partes: video.

1. **Captura.** Cámara en vivo o videos subidos (`.mp4` o un `.zip` de videos). Si hay varias personas, Tridi elige al sujeto y lo sigue en todo el video; el resto se ignora.
2. **Esqueleto 3D.** Cada frame se convierte en las posiciones 3D de las articulaciones del sujeto.
3. **Simulación.** El movimiento se pasa a un robot dentro de MuJoCo, un motor de física usado en robótica.
4. **Aprendizaje.** Con esos datos entrenamos un modelo open source pequeño que controla los motores del robot. Nadie le programa cómo correr: aprende a hacerlo sin caerse imitando a las personas.

Mientras un video nuevo se procesa, Tridi muestra simulaciones ya entrenadas, así nunca hay una pantalla de carga vacía.

Equipo 26 · Platanus Hack 26 Caracas · Track Three Dimensions.
