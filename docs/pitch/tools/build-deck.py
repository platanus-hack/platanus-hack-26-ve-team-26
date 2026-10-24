#!/usr/bin/env python3
"""Builds the Tridi pitch deck (docs/pitch/deck/tridi-deck.html) from the repo's own numbers.

Copy and palette come from the landing (web/src/screens/home.js, web/src/landing/landing.css);
the training curve is the real log (web/src/landing/training-curve.json). Regenerate after any
number changes:  python3 docs/pitch/tools/build-deck.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
curve = json.loads((ROOT / "web/src/landing/training-curve.json").read_text())
OUT = ROOT / "docs/pitch/deck/tridi-deck.html"

# ---- The training curve, drawn from the real log: seconds standing per attempt ----
pts = curve["points"]
xs = [p[0] if isinstance(p, list) else p["x"] for p in pts]
ys = [p[1] if isinstance(p, list) else p["y"] for p in pts]
W, H = 980, 300
x0, x1 = min(xs), max(xs)
y1 = max(max(ys), curve["episodeCap"])
path = " ".join(
    f"{(x - x0) / (x1 - x0) * W:.1f},{H - y / y1 * H:.1f}" for x, y in zip(xs, ys)
)
cap_y = H - curve["episodeCap"] / y1 * H

MARK = ('<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">'
        '<circle cx="12" cy="6.5" r="2.6"/>'
        '<path d="M12 10v6.5M7 12.5h10M12 16.5l-3.5 5M12 16.5l3.5 5"/></svg>')

def slide(n, kind, body, label=""):
    return f'''<section class="slide {kind}">
  <div class="inner">{body}</div>
  <footer class="chrome"><span class="wm">{MARK}Tridi</span><span class="lbl">{label}</span><span class="pg">{n:02d}</span></footer>
</section>'''

S = []

S.append(slide(1, "dark cover", '''
  <p class="kicker">Platanus Hack 26 · Caracas · Three Dimensions</p>
  <h1>Robots que<br>aprenden<br>de un video</h1>
  <p class="lede">Grabas a una persona moviéndose. Un humanoide aprende a hacerlo igual,
     practicando en física real hasta no caerse.</p>
  <p class="meta"><span>Cesar Martinez</span><span>Juan Villa</span><span>Pastor Jimenez</span><span>Ale Hernández</span></p>'''))

S.append(slide(2, "dark statement", '''
  <p class="kicker">El problema</p>
  <h2>La IA aprendió a hablar<br>leyendo internet.<br>
      <em>La IA física no tiene<br>un internet de movimiento.</em></h2>''', "El problema"))

S.append(slide(3, "paper", '''
  <p class="kicker">El problema</p>
  <h2>Los robots ya tienen cuerpo.<br>Les falta experiencia.</h2>
  <p class="body">Para que un humanoide aprenda a caminar, bailar o cargar una caja necesita
     miles de ejemplos de cómo se mueve una persona. Hoy esos ejemplos se graban con trajes de
     captura, en un estudio, sobre un piso perfecto que en la calle no existe.</p>
  <ul class="bullets">
    <li><b>Caro</b><span>un estudio de captura por sesión</span></li>
    <li><b>Lento</b><span>un movimiento nuevo, días de trabajo</span></li>
    <li><b>No escala</b><span>y millones de horas de video ya existen</span></li>
  </ul>''', "El problema"))

S.append(slide(4, "paper key", '''
  <p class="kicker">Por qué el video no alcanza</p>
  <h2>Si copia el video,<br><em>se cae.</em></h2>
  <p class="body">El robot tiene otras medidas y otro peso: lo que la persona hace en pantalla es
     físicamente imposible para él. Pasar el movimiento a su cuerpo es solo geometría — y la
     geometría no sabe de gravedad.</p>
  <div class="stat-row">
    <div class="stat"><b>29</b><span>articulaciones del G1</span></div>
    <div class="stat"><b>3,2 cm</b><span>error mediano al pasar el movimiento</span></div>
    <div class="stat"><b>0 s</b><span>lo que aguanta de pie si solo copia</span></div>
  </div>
  <p class="punch">El video le dice <em>qué</em> hacer.<br>La simulación le enseña <em>cómo</em>.</p>''', "La idea"))

S.append(slide(5, "paper", '''
  <p class="kicker">Cómo funciona</p>
  <h2>Tres piezas</h2>
  <div class="cols">
    <div class="col"><p class="product">Tridi Capture</p>
      <p>Un video de celular, la cámara de la laptop o un MP4. Encuentra a la persona —aunque
         haya más gente— y saca su esqueleto en 3D, cuadro por cuadro.</p>
      <p class="num">33 puntos · 30 por segundo</p></div>
    <div class="col"><p class="product">Tridi Gym</p>
      <p>El robot practica ese movimiento millones de veces en física real. Si se cae, vuelve a
         intentarlo. Nadie le escribe cómo pararse.</p>
      <p class="num">40 M pasos · 73 min en una laptop</p></div>
    <div class="col"><p class="product">Tridi Policy</p>
      <p>Sale una red pequeña que mueve los 29 motores del robot, y el movimiento humano
         corregido por la física para que un robot sí pueda hacerlo.</p>
      <p class="num">265 KB · decide cada 20 ms</p></div>
  </div>''', "Producto"))

S.append(slide(6, "paper", '''
  <p class="kicker">Tridi Capture</p>
  <h2>De un video cualquiera<br>al cuerpo del robot</h2>
  <ol class="beats">
    <li><b>Un video cualquiera</b><span>Once segundos de celular. Sin trajes, sin estudio, sin marcadores.</span></li>
    <li><b>Su esqueleto, en 3D</b><span>33 puntos por cuadro, 30 veces por segundo. Si hay más gente, eliges a quién seguir.</span></li>
    <li><b>En el cuerpo del robot</b><span>Otras medidas, otro peso, 29 articulaciones: 3,2 cm de error mediano.</span></li>
  </ol>
  <p class="foot-note">10 segundos de video salen procesados en unos 40.</p>''', "Producto"))

S.append(slide(7, "dark", '''
  <p class="kicker">Tridi Gym</p>
  <h2>Nadie le escribe<br>cómo pararse</h2>
  <p class="body">Lo intenta, se cae y vuelve a intentarlo. Lo empujamos cada 2,5 segundos mientras
     entrena, hasta con 300 newtons desde cualquier dirección.</p>
  <table class="ladder">
    <thead><tr><th>Práctica</th><th>Aguanta de pie</th><th>Empujones de 250 N</th></tr></thead>
    <tbody>
      <tr><td>Sin entrenar</td><td>1,1 s</td><td>0 de 4</td></tr>
      <tr><td>3 millones de pasos</td><td>4,2 s</td><td>0 de 4</td></tr>
      <tr><td>10 millones</td><td>9,6 s</td><td>1,2 de 4</td></tr>
      <tr><td>20 millones</td><td>13,4 s</td><td>2,2 de 4</td></tr>
      <tr class="on"><td>40 millones</td><td>20 s, los completos</td><td>4 de 4</td></tr>
    </tbody>
  </table>''', "Cómo aprende"))

S.append(slide(8, "dark chart-slide", '''
  <p class="kicker">Tridi Gym · log real</p>
  <h2>Segundos de pie por intento</h2>
  <figure class="chart">
    <svg viewBox="0 0 980 300" preserveAspectRatio="none" role="img"
         aria-label="La curva de entrenamiento: de poco más de un segundo de pie a los veinte del tope">
      <line class="cap" x1="0" y1="__CAP__" x2="980" y2="__CAP__"/>
      <polyline points="__PATH__"/>
    </svg>
    <figcaption><span>0</span><span>__CAPSEC__ s: el tope del intento</span><span>__STEPS__ millones de pasos</span></figcaption>
  </figure>
  <p class="body">__MIN__ minutos de entrenamiento en una laptop, sin GPU. La línea es el log, no un dibujo.</p>'''
  .replace("__CAP__", f"{cap_y:.1f}").replace("__PATH__", path)
  .replace("__CAPSEC__", str(curve["episodeCap"])).replace("__MIN__", str(curve["minutes"]))
  .replace("__STEPS__", str(round(curve["steps"] / 1_000_000))), "Cómo aprende"))

S.append(slide(9, "paper key", '''
  <p class="kicker">La prueba</p>
  <h2>Empújalo</h2>
  <p class="body">En la web, cualquiera le da al botón y empuja al robot con 250 newtons durante una
     décima de segundo, sobre 33 kilos. Es física resolviéndose en su propio teléfono.</p>
  <div class="stat-row">
    <div class="stat"><b>250 N</b><span>el empujón del botón</span></div>
    <div class="stat"><b>4 de 4</b><span>aguantados por la política entrenada</span></div>
    <div class="stat"><b>56 de 60</b><span>direcciones probadas alrededor del robot</span></div>
  </div>
  <p class="punch">Un video de un robot<br>no se deja empujar.</p>
  <p class="foot-note">Las 4 direcciones que falla son un sector de unos 20° por detrás: el botón
     empuja al azar, así que lo tumba 1 de cada 15 veces. Está medido en <code>physics/README.md</code>.</p>''', "La prueba"))

S.append(slide(10, "paper", '''
  <p class="kicker">Tridi Policy</p>
  <h2>Lo que entregamos<br>cabe en un correo</h2>
  <div class="specs">
    <div><b>265 KB</b><span>la red completa que mueve al robot</span></div>
    <div><b>29</b><span>motores que controla a la vez</span></div>
    <div><b>20 ms</b><span>entre una decisión y la siguiente</span></div>
    <div><b>&lt; 1 ms</b><span>lo que tarda en decidir</span></div>
  </div>
  <p class="body">Hoy entregamos la política de pie, que corre en el navegador de quien la prueba.
     Lo siguiente es entregar también los datos: el movimiento de la persona corregido por la
     física, listo para entrenar tu propio robot.</p>''', "Producto"))

S.append(slide(11, "paper", '''
  <p class="kicker">Para quién</p>
  <h2>Equipos que están<br>construyendo humanoides</h2>
  <p class="body">Y los laboratorios de robótica que entrenan políticas de control. Lo que compran
     no es un robot: son horas de movimiento humano que su robot sí pueda ejecutar, y la política
     que las ejecuta.</p>
  <ul class="bullets">
    <li><b>Hoy</b><span>una política de pie que aguanta empujones, en 73 minutos de laptop</span></li>
    <li><b>Entrenando</b><span>caminar como la persona del video</span></li>
    <li><b>Lo que viene</b><span>practicar sobre piedras, viento y piso resbaloso, que ya existen en el simulador</span></li>
  </ul>
  <p class="foot-note">No tenemos clientes ni socios, y no vamos a insinuarlo. Hablar con el primero
     es lo que hacemos el lunes.</p>''', "Para quién"))

S.append(slide(12, "paper", '''
  <p class="kicker">En qué nos diferenciamos</p>
  <h2>Lo que ya existe,<br>dicho por nosotros</h2>
  <table class="vs">
    <thead><tr><th>Quién</th><th>Qué hace</th><th>Qué le falta</th></tr></thead>
    <tbody>
      <tr><td>VideoMimic</td><td>Video monocular a política, sobre un robot físico</td><td>Un laboratorio y un robot de 16.000 dólares</td></tr>
      <tr><td>Ultimate Bots</td><td>Tu video a un robot en el navegador, gratis</td><td><b>Copia</b>: evalúa con un modelo que NVIDIA ya tenía entrenado</td></tr>
      <tr><td>AgiBot LinkCraft</td><td>Video de celular a su robot, en su nube</td><td>Cerrado, su robot, su plataforma</td></tr>
      <tr class="on"><td>Tridi</td><td>Video a una política <b>que entrenamos nosotros</b>, abierta y en el navegador</td><td>Todavía en simulación, no en un robot real</td></tr>
    </tbody>
  </table>''', "Originalidad"))

S.append(slide(13, "dark", '''
  <p class="kicker">Lo decimos claro</p>
  <h2>Qué es nuestro<br>y qué no</h2>
  <div class="cols two">
    <div class="col"><p class="product">La física es de MuJoCo</p>
      <p>El estándar en robótica, el mismo que usa Google DeepMind. Nadie escribe un motor de
         contacto en 36 horas. Lo nuestro es todo lo que va encima: el camino del video al robot,
         el mundo donde aprende y el entrenamiento.</p></div>
    <div class="col"><p class="product">Y no es un LLM</p>
      <p>Las empresas le van a poner un LLM a sus robots para decidir a dónde ir. Alguien tiene que
         enseñarles a llegar sin caerse. Eso es Tridi: una red pequeña que aprendió a no caerse.</p></div>
  </div>''', "Honestidad"))

S.append(slide(14, "dark cover end", '''
  <p class="kicker">Pruébalo ahora</p>
  <h1>Robots que<br>aprenden<br>de un video</h1>
  <p class="lede">Abre la web, sube un video tuyo y empuja al robot. Está desplegado y es abierto.</p>
  <p class="meta"><span>tridi-alpha.vercel.app</span><span>github.com/platanus-hack/platanus-hack-26-ve-team-26</span></p>'''))

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap');
:root{
  --paper:#eeece7; --ink:#0d0d0b; --ink-soft:#3a3935; --muted:#6e6b64;
  --bg:#0a0a09; --fg:#efede8; --fg-2:#b5b2aa; --dim:#77746d;
  --signal:#ff4f1a; --signal-ink:#d93a08;
  --display:'Inter Tight',system-ui,-apple-system,sans-serif;
  --mono:'Geist Mono',ui-monospace,'SF Mono',Menlo,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#55534e}
.slide{position:relative;width:1280px;height:720px;overflow:hidden;
  font:400 20px/1.45 var(--display);display:flex;flex-direction:column}
.slide.paper{background:var(--paper);color:var(--ink)}
.slide.dark{background:var(--bg);color:var(--fg)}
.inner{flex:1;padding:72px 88px 0;display:flex;flex-direction:column;justify-content:center;gap:22px}
h1,h2{margin:0;font-weight:500;text-transform:uppercase;letter-spacing:-0.025em;line-height:0.94}
h1{font-size:92px}
h2{font-size:60px}
h1 em,h2 em{font-style:normal;color:var(--signal)}
.paper h1 em,.paper h2 em{color:var(--signal-ink)}
.kicker{margin:0;font:500 13px/1 var(--mono);text-transform:uppercase;letter-spacing:.16em;color:var(--signal-ink)}
.dark .kicker{color:var(--signal)}
.lede{margin:0;max-width:30ch;font-size:24px;color:var(--fg-2)}
.body{margin:0;max-width:66ch;font-size:21px;color:var(--ink-soft)}
.dark .body{color:var(--fg-2)}
.meta{margin:0;display:flex;gap:28px;font:400 14px/1 var(--mono);color:var(--dim);flex-wrap:wrap}
.cover h1{font-size:104px}
.statement h2{font-size:68px;max-width:22ch}
.key .punch{margin:0;font:500 38px/1.05 var(--display);text-transform:uppercase;letter-spacing:-0.02em}
.key .punch em{font-style:normal;color:var(--signal-ink)}
.stat-row{display:flex;gap:56px;border-top:1px solid rgb(13 13 11/.14);padding-top:20px}
.dark .stat-row{border-color:rgb(239 237 232/.14)}
.stat b,.specs b,.col .num{display:block;font:500 42px/1 var(--mono);letter-spacing:-.02em}
.stat span,.specs span{display:block;margin-top:6px;font-size:16px;color:var(--muted);max-width:26ch}
.bullets,.beats{margin:0;padding:0;list-style:none;display:flex;gap:40px}
.beats{counter-reset:b}
.bullets li,.beats li{flex:1;border-top:2px solid var(--ink);padding-top:14px}
.dark .bullets li{border-color:var(--fg)}
.beats li::before{counter-increment:b;content:counter(b,decimal-leading-zero);
  display:block;font:500 13px/1 var(--mono);color:var(--signal-ink);margin-bottom:10px}
.bullets b,.beats b{display:block;font-size:24px;font-weight:600;letter-spacing:-.01em}
.bullets span,.beats span{display:block;margin-top:8px;font-size:17px;color:var(--muted)}
.cols{display:flex;gap:48px}
.cols.two{gap:72px}
.col{flex:1;border-top:2px solid var(--ink);padding-top:16px}
.dark .col{border-color:var(--fg)}
.col p{margin:0 0 12px;font-size:18px;color:var(--ink-soft)}
.dark .col p{color:var(--fg-2)}
.product{font:500 13px/1 var(--mono)!important;text-transform:uppercase;letter-spacing:.14em;
  color:var(--signal-ink)!important;margin-bottom:14px!important}
.dark .product{color:var(--signal)!important}
.col .num{font-size:20px;color:var(--ink)}
.dark .col .num{color:var(--fg)}
.specs{display:flex;gap:56px;border-top:1px solid rgb(13 13 11/.14);padding-top:20px}
table{width:100%;border-collapse:collapse;font-size:19px}
th{text-align:left;font:500 12px/1 var(--mono);text-transform:uppercase;letter-spacing:.14em;
  color:var(--dim);padding-bottom:12px;border-bottom:1px solid rgb(239 237 232/.18)}
.paper th{color:var(--muted);border-color:rgb(13 13 11/.16)}
td{padding:13px 0;border-bottom:1px solid rgb(239 237 232/.1)}
.paper td{border-color:rgb(13 13 11/.09)}
td:not(:first-child){font-family:var(--mono);font-size:18px}
.vs td:not(:first-child){font-family:var(--display);font-size:18px}
tr.on td{color:var(--signal);font-weight:500}
.paper tr.on td{color:var(--signal-ink)}
.chart svg{width:100%;height:300px;display:block}
.chart polyline{fill:none;stroke:var(--signal);stroke-width:2.5;vector-effect:non-scaling-stroke}
.chart .cap{stroke:rgb(239 237 232/.3);stroke-width:1;stroke-dasharray:4 5;vector-effect:non-scaling-stroke}
.chart figcaption{display:flex;justify-content:space-between;margin-top:10px;
  font:400 13px/1 var(--mono);color:var(--dim)}
.foot-note{margin:0;font-size:15px;color:var(--muted);max-width:78ch}
.dark .foot-note{color:var(--dim)}
code{font:400 .92em var(--mono)}
.chrome{display:flex;align-items:center;justify-content:space-between;
  padding:0 88px 34px;font:400 12px/1 var(--mono);color:var(--muted)}
.dark .chrome{color:var(--dim)}
.wm{display:flex;align-items:center;gap:8px;font-weight:500;letter-spacing:.06em;text-transform:uppercase}
.mark{width:15px;height:15px;fill:none;stroke:var(--signal);stroke-width:1.6;stroke-linecap:round}
.lbl{text-transform:uppercase;letter-spacing:.14em}
@media screen{
  body{display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px}
  .slide{box-shadow:0 20px 50px -24px rgb(0 0 0/.6)}
}
@page{size:1280px 720px;margin:0}
@media print{
  body{background:#fff;display:block;padding:0;gap:0}
  .slide{box-shadow:none;break-after:page;page-break-after:always}
  .slide:last-child{break-after:auto;page-break-after:auto}
}
"""

html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Tridi — pitch deck</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>{CSS}</style></head>
<body>
{chr(10).join(S)}
</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html)
print(f"{OUT.relative_to(ROOT)}: {len(S)} láminas, {len(html) // 1024} KB")
