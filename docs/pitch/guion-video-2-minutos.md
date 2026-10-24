# El video de 2 minutos: 36 horas, contadas por el robot

- **Fecha:** 2026-10-24 · **Quién:** Ale · **Estado:** borrador 1, para que el equipo lo revise

**El enfoque lo decidió el equipo:** no es un recorrido por las funciones, es **la historia de las 36 horas**, contada a través de lo que le pasó al robot: no se sostenía, se caía, se equivocaba, y de a poco aprendió a no caerse y a dar sus primeros pasos sobre pisos que no son perfectos.

**El hallazgo del guion:** no hace falta inventar el relato. **Los commits del repo ya lo cuentan, con hora.** Cada rótulo de abajo es un commit real, y el agente del juez puede verificarlo mientras lo ve. La curva de aprendizaje del robot y la noche del equipo son la misma línea de tiempo.

**Medido: 108 s de narración en los 120** (con [`tools/cronometro.py`](tools/cronometro.py), a 3,6 sílabas por segundo, que es ritmo de voz en off con pausas). Los 12 s que sobran son para que los planos respiren: en un video de este tipo, el silencio después de una caída vale más que una frase.

**La regla que ordena todo:** el robot se cae en los dos primeros tercios. Si el video no duele un poco al principio, el final no vale nada.

---

## El guion

### 0:00–0:14 · Viernes, 22:10. Un repositorio vacío

**En pantalla:** negro. Aparece el rótulo `viernes 23 · 22:10` y la primera línea del `git log`: *Add README.md*. Nada más.

> "Un viernes a las diez de la noche teníamos un repositorio vacío.
> Y una sola idea: que un robot aprendiera a moverse mirando un video."

### 0:14–0:30 · 23:26. El robot existe, pero es una estatua

**En pantalla:** rótulo `23:26 · feat(physics): G1 standing in MuJoCo WASM`. El G1 aparece de pie. Alguien le da a **Empujar**. Se cae. Se levanta la escena, lo empujan otra vez, se vuelve a caer.

> "A las once y media el robot ya existía. Pero solo sabía sostener una pose.
> Un empujón de doscientos cincuenta newtons y al piso. Otra vez. Y otra."

### 0:30–0:46 · Sábado, 00:07. Copiar no es saber

**En pantalla:** rótulo `00:07 · feat(physics): G1 copies a person from the camera`. Alguien se mueve frente a la cámara y el robot lo copia. Luego se le prende la física: el robot se desarma y cae.

> "A medianoche logramos que copiara a una persona.
> Pero copiar no es saber: en cuanto le prendimos la física, el peso y la gravedad hicieron lo suyo."

### 0:46–1:12 · La madrugada. Cuarenta millones de intentos

**En pantalla:** la escalera, cuatro robots a la vez con su rótulo de pasos. Sin entrenar se desploma. A los tres millones aguanta un segundo más. A los diez empieza a corregir. A los cuarenta, se queda de pie. Encima, la curva real subiendo.

> "Entonces dejamos de decirle cómo pararse y lo pusimos a intentarlo.
> Cuarenta millones de intentos. Cada vez que se caía, el episodio se cortaba y volvía a empezar.
> Setenta y tres minutos de laptop, sin tarjeta gráfica, mientras nosotros dormíamos por turnos."

### 1:12–1:28 · 04:55. El commit que dice que todavía falla

**En pantalla:** rótulo `04:55 · docs(training): walk-lookahead results, the robot still falls behind the path`. El robot intenta seguir la caminata y se queda atrás.

> "A las cinco de la mañana escribimos un commit que decía, con todas sus letras, que el robot seguía quedándose atrás.
> No lo borramos. Está en el repositorio."

### 1:28–1:44 · 04:56. El piso deja de ser perfecto

**En pantalla:** rótulo `04:56 · feat(physics): worlds (flat, stones, slippery, wind)`. El mismo robot sobre los cuatro mundos: acera, piedras, recién trapeado, pradera con viento. En el resbaloso patina; aguanta.

> "Un minuto después le quitamos el piso perfecto.
> Piedras. Un lobby recién trapeado. Viento de costado. Porque ningún robot va a trabajar en un plano infinito."

### 1:44–2:00 · Dónde quedamos

**En pantalla:** el robot de pie, aguantando un empujón. Corte a negro con tres líneas.

> "Hoy se para, aguanta los empujones y sigue tres segundos y medio de la caminata.
> Todavía no son los doce. Pero hace treinta y seis horas no sabía estar de pie."

**Texto final en pantalla, sin voz:**

```
Se para.          4 de 4 empujones de 250 N
Está aprendiendo. 3,5 s de 11,8 de la caminata
Sigue entrenando. tridi-alpha.vercel.app
```

---

## De dónde sale cada cosa

Todo lo que se afirma existe y se puede verificar. **Nada de esto se actúa ni se recrea.**

| Lo que se dice | Dónde está |
| --- | --- |
| Los rótulos con hora | `git log` del repo, tal cual |
| El empujón de 250 N | `physics/src/sim.js`, y el botón de la web |
| La escalera (1,1 → 4,2 → 9,6 → 20 s) | `training/README.md`, medida con `evaluate.py` |
| 40 M pasos y 73 minutos | `training/README.md` (38,5 + 34,5 min, dos vueltas) |
| "Se queda atrás del camino" | El commit de las 04:55, literal |
| Los cuatro mundos | `physics/worlds/`, y el selector de Simulaciones |
| 3,5 s de 11,8 | `docs/plan-producto.md`, `walk-v4` |

## Lo que hay que grabar (y lo que ya existe)

| Plano | Estado |
| --- | --- |
| El G1 de pie y el empujón | ✅ Existe en la web; se graba la pantalla |
| La cámara copiando a una persona | ✅ Existe (`#/en-vivo`) |
| El robot con la física prendida cayéndose | ✅ Reiniciar y soltar |
| La escalera de cuatro checkpoints a la vez | ⚠️ El panel de entrega la dibuja; hay que ver si se pueden correr los cuatro en una pantalla |
| Los cuatro mundos | ✅ Selector en Simulaciones |
| El robot siguiendo la caminata y quedándose atrás | ✅ `g1-walk` en Simulaciones |
| Los rótulos con hora | Se montan encima, en la edición |

## Decisiones de tono, para discutir

1. **Sin música épica.** La historia aguanta sola; la música de superación la vuelve un comercial y el jurado es técnico.
2. **Sin caras del equipo.** El protagonista es el robot. Que no aparezca nadie hace más fuerte el "nosotros" de la voz en off.
3. **Nada de "lo logramos".** El final dice lo que falta. Un jurado que ve a un equipo admitir el límite le cree el resto.
4. **La voz, una sola persona**, hablando normal. Si suena a locutor, se pierde.
5. **Dos tercios de caídas.** Es incómodo a propósito.

## Pendiente

- Que el equipo valide el enfoque y el tono.
- Decidir quién pone la voz.
- Grabar las pantallas (lo más largo) y montar los rótulos.
- **Si antes del domingo `walk-v5` sigue más segundos, cambia una sola línea del cierre.** El guion está escrito para que ese número se pueda actualizar sin tocar nada más.
