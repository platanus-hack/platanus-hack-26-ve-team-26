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

# ---- The training curve, kept for when a slide needs it again (it lived in the long deck) ----
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

# 30 s de pitch (láminas 1-3), 2 min 30 de demo (lámina 4) y el cierre (5-7).
S.append(slide(1, "dark cover", """
  <p class="kicker">Platanus Hack 26 · Caracas · Three Dimensions</p>
  <h1>Robots que<br>aprenden<br>de un video</h1>
  <p class="lede">Grabas a una persona moviéndose. Un humanoide aprende a hacerlo igual,
     practicando en física real hasta no caerse.</p>
  <p class="meta"><span>Cesar Martinez</span><span>Juan Villa</span><span>Pastor Jimenez</span><span>Ale Hernández</span></p>""",
  "0:00 · 4 s"))

S.append(slide(2, "dark statement", """
  <p class="kicker">El problema</p>
  <h2>La IA aprendió a hablar<br>leyendo internet.<br>
      <em>La física no tiene<br>un internet de movimiento.</em></h2>
  <p class="lede wide">Los robots ya tienen cuerpo. Les falta experiencia: hoy se la enseñan con
     trajes de captura, en un estudio, sobre un piso perfecto que en la calle no existe.</p>""",
  "0:04 · 12 s"))

S.append(slide(3, "paper key", """
  <p class="kicker">Por qué el video no alcanza</p>
  <h2>Si copia el video,<br><em>se cae.</em></h2>
  <p class="body">El robot tiene otras medidas y otro peso: lo que la persona hace en pantalla es
     físicamente imposible para él. Pasarle el movimiento es solo geometría, y la geometría no
     sabe de gravedad.</p>
  <p class="punch">El video le dice <em>qué</em> hacer.<br>La simulación le enseña <em>cómo</em>.</p>""",
  "0:16 · 14 s"))

S.append(slide(4, "dark demo", """
  <p class="kicker">Demo · 2 min 30</p>
  <h2>Mejor se los<br>enseñamos</h2>
  <ol class="beats light">
    <li><b>Capture</b><span>Un video de celular se vuelve el esqueleto 3D de una persona, y ese movimiento entra al cuerpo del G1.</span></li>
    <li><b>Gym</b><span>El mismo robot sin entrenar, a medias y entrenado: 40 millones de pasos de práctica, 73 minutos en una laptop.</span></li>
    <li><b>Policy</b><span>La política corre en el navegador de ustedes. Empújenlo: 250 newtons sobre 33 kilos.</span></li>
  </ol>""",
  "0:30 · 2:30"))

S.append(slide(5, "paper", """
  <p class="kicker">Lo que acaban de ver, medido</p>
  <h2>Los números</h2>
  <div class="stat-row four">
    <div class="stat"><b>3,2 cm</b><span>error mediano al pasar el movimiento al G1</span></div>
    <div class="stat"><b>73 min</b><span>de entrenamiento en una laptop, sin GPU</span></div>
    <div class="stat"><b>4 de 4</b><span>empujones de 250 N que aguanta de pie</span></div>
    <div class="stat"><b>265 KB</b><span>la red completa que mueve 29 motores</span></div>
  </div>
  <table class="ladder">
    <thead><tr><th>Práctica</th><th>Aguanta de pie</th><th>Empujones de 250 N</th></tr></thead>
    <tbody>
      <tr><td>Sin entrenar</td><td>1,1 s</td><td>0 de 4</td></tr>
      <tr><td>10 millones de pasos</td><td>9,6 s</td><td>1,2 de 4</td></tr>
      <tr class="on"><td>40 millones de pasos</td><td>20 s, los completos</td><td>4 de 4</td></tr>
    </tbody>
  </table>
  <p class="foot-note">El empujón del botón va en dirección al azar: medido desde 60 direcciones
     aguanta 56, así que lo tumba 1 de cada 15 veces.</p>""",
  "Al terminar la demo"))

S.append(slide(6, "paper", """
  <p class="kicker">Para quién, y qué es nuestro</p>
  <h2>Equipos que están<br>construyendo humanoides</h2>
  <div class="cols two">
    <div class="col"><p class="product">La física es de MuJoCo</p>
      <p>El estándar en robótica. Nadie escribe un motor de contacto en 36 horas. Lo nuestro es
         todo lo que va encima: el camino del video al robot, el mundo donde aprende y el
         entrenamiento. Y no es un LLM: las empresas le van a poner uno a sus robots para decidir
         a dónde ir; alguien tiene que enseñarles a llegar sin caerse.</p></div>
    <div class="col"><p class="product">Dónde estamos</p>
      <ol class="road">
        <li><span>Hoy</span><b>Pararse y aguantar empujones de 250 N</b></li>
        <li><span>Entrenando</span><b>Caminar como la persona del video</b></li>
        <li><span>Lo que viene</span><b>Practicar sobre piedras, viento y piso resbaloso, que ya existen en el simulador</b></li>
      </ol></div>
  </div>
  <p class="foot-note">No tenemos clientes ni socios, y no vamos a insinuarlo. Hablar con el
     primero es lo que hacemos el lunes.</p>""",
  "Preguntas"))

S.append(slide(7, "dark cover end", """
  <p class="kicker">Pruébenlo ahora</p>
  <h1>Robots que<br>aprenden<br>de un video</h1>
  <p class="lede">Abran la web, suban un video suyo y empujen al robot. Está desplegado y es abierto.</p>
  <p class="meta"><span>tridi-alpha.vercel.app</span><span>github.com/platanus-hack/platanus-hack-26-ve-team-26</span></p>""",
  "Cierre"))

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
.lede.wide{max-width:62ch;font-size:21px}
.stat-row.four{gap:40px}
.stat-row.four .stat b{font-size:36px}
.beats.light li{border-color:var(--fg)}
.road{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
.road li{display:flex;gap:14px;align-items:baseline}
.road span{flex:0 0 96px;font:500 12px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--signal)}
.paper .road span{color:var(--signal-ink)}
.road b{font-size:17px;font-weight:500}
.demo h2{font-size:52px}
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
