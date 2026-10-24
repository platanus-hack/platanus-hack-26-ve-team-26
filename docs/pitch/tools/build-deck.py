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

# Un minuto de pitch (láminas 1-6), 2 min de video (7) y el cierre (8-10).
# Solo la portada va en inglés; el resto, en español.

SKELETON = """<svg class="flow" viewBox="0 0 760 300" role="img"
   aria-label="Un video se convierte en un esqueleto de 33 puntos, ese movimiento entra al robot, y sin física el robot se cae">
  <g class="step">
    <rect x="8" y="40" width="200" height="220" rx="4"/>
    <g class="person" transform="translate(108 92)">
      <circle cy="0" r="13"/><path d="M0 14v62M-34 36h68M0 76l-26 56M0 76l26 56"/>
    </g>
    <text x="108" y="286">Video</text>
  </g>
  <path class="arrow" d="M224 150h52"/>
  <g class="step">
    <rect x="288" y="40" width="200" height="220" rx="4"/>
    <g class="dots" transform="translate(388 92)">
      <path d="M0 14v62M-34 36h68M0 76l-26 56M0 76l26 56"/>
      <circle cy="0" r="7"/><circle cy="14" r="5"/><circle cx="-34" cy="36" r="5"/>
      <circle cx="34" cy="36" r="5"/><circle cy="76" r="5"/><circle cx="-26" cy="132" r="5"/>
      <circle cx="26" cy="132" r="5"/>
    </g>
    <text x="388" y="286">Esqueleto · 33 puntos</text>
  </g>
  <path class="arrow" d="M504 150h52"/>
  <g class="step fail">
    <rect x="568" y="40" width="184" height="220" rx="4"/>
    <g class="person" transform="translate(700 118) rotate(62) scale(0.78)">
      <circle cy="0" r="13"/><path d="M0 14v62M-34 36h68M0 76l-26 56M0 76l26 56"/>
    </g>
    <text x="660" y="286">Robot, sin física</text>
  </g>
</svg>"""

S.append(slide(1, "dark split cover", """
  <div class="words">
    <p class="kicker">Platanus Hack 26 · Three Dimensions</p>
    <h1>Physical&nbsp;AI<br>is the<br>new sexy</h1>
    <p class="knife">Pensar ya se resolvió en un servidor.<br><em>Moverse se resuelve caminando.</em></p>
    <p class="meta"><span>Tridi</span><span>Cesar · Juan · Pastor · Ale</span></p>
  </div>
  <figure class="shot"><img src="img/g1-de-pie.jpg" alt="El Unitree G1 simulado, de pie"></figure>""",
  "0:00 · 9 s"))

S.append(slide(2, "dark statement", """
  <h2>Un bug<br>se revierte.<br><em>Una caída, no.</em></h2>
  <p class="es">La gravedad no acepta otro intento. Lo que funciona en un simulador limpio no
     sobrevive afuera: <b>89 % de éxito en el banco de simulación, 12 % en tareas reales</b>.
     Y una línea parada cuesta <b>2,3 millones de dólares la hora</b>.</p>""",
  "0:09 · 7 s"))

S.append(slide(3, "dark statement", """
  <h2>Los robots<br>ya tienen cuerpo.<br><em>Les falta experiencia.</em></h2>
  <p class="es">Hoy se la enseñan con trajes de captura, en un estudio,
     sobre un piso que en la calle no existe.</p>""",
  "0:16 · 8 s"))

S.append(slide(4, "paper split-v key", """
  <div class="words">
    <h2>Si copia el video,<br><em>se cae.</em></h2>
    <p class="punch">El video le dice <em>qué</em> hacer.<br>La física le enseña <em>cómo</em>.</p>
  </div>
  """ + SKELETON, "0:24 · 14 s"))

S.append(slide(5, "dark worldslide", """
  <p class="kicker">Nuestro motor</p>
  <h2>Los pisos perfectos<br>no existen</h2>
  <ul class="places">
    <li><b>Acera</b><span>plano, fricción normal</span></li>
    <li><b>Piedras</b><span>el suelo deja de ser plano</span></li>
    <li><b>Recién trapeado</b><span>fricción baja</span></li>
    <li><b>Pradera con viento</b><span>fuerza lateral constante</span></li>
  </ul>
  <p class="es">Un demo se hace en el vacío. Un robot, con fricción.</p>""",
  "0:38 · 7 s"))

S.append(slide(6, "paper", """
  <p class="kicker">Tres piezas</p>
  <div class="cols trio-cols">
    <div class="col"><p class="product">Capturar</p>
      <p>Video a esqueleto 3D, y al cuerpo del robot.</p><p class="num">3,2 cm</p></div>
    <div class="col"><p class="product">Entrenar</p>
      <p>Millones de intentos con física real.</p><p class="num">40 M pasos · 73 min</p></div>
    <div class="col"><p class="product">Entregar</p>
      <p>Una red que corre en tu navegador.</p><p class="num">265 KB</p></div>
  </div>""", "0:45 · 5 s"))

S.append(slide(7, "paper", """
  <p class="kicker">El negocio</p>
  <h2>Vendemos movimiento,<br>no robots</h2>
  <div class="cols trio-cols">
    <div class="col"><p class="product">Cliente ideal</p>
      <p>Humanoides con hardware y sin datos de movimiento.</p></div>
    <div class="col"><p class="product">Primer cliente</p>
      <p>Los laboratorios que ya pagan por datos, por hora.</p></div>
    <div class="col"><p class="product">Qué compran</p>
      <p>La política entrenada y el movimiento corregido por la física.</p></div>
  </div>
  <div class="stat-row tam">
    <div class="stat"><b>2,7 mil M</b><span>USD en datos de entrenamiento, 2026</span></div>
    <div class="stat"><b>+100 M</b><span>USD al año ya se gastan en datos de robótica</span></div>
    <div class="stat"><b>≈ 0</b><span>nuestro costo por hora: no pagamos por grabar</span></div>
  </div>""", "0:50 · 13 s"))

S.append(slide(8, "paper", """
  <p class="kicker">Para equipos de humanoides</p>
  <h2>Dónde estamos</h2>
  <ol class="road big">
    <li><span>Hoy</span><b>Se para y aguanta empujones</b></li>
    <li><span>Entrenando</span><b>Caminar como la persona del video</b></li>
    <li><span>Lo que viene</span><b>Entrenar en los cuatro mundos, no solo probar</b></li>
  </ol>
  <p class="foot-note">La física es de MuJoCo; nuestro es todo lo que va encima. Y no es un LLM:
     el LLM decide a dónde ir, nosotros enseñamos a llegar sin caerse.</p>""",
  "Preguntas"))

S.append(slide(9, "dark demo", """
  <p class="kicker">Demo</p>
  <h1>2:00</h1>
  <p class="trio"><span>Capture</span><span>Gym</span><span>Policy</span></p>""",
  "Penúltima · 2:00"))

S.append(slide(10, "dark split end", """
  <div class="words">
    <p class="kicker">Pruébenlo ahora · empújenlo</p>
    <h2>tridi-alpha<br>.vercel.app</h2>
    <p class="meta"><span>Abierto en GitHub</span><span>platanus-hack/…-ve-team-26</span></p>
  </div>
  <figure class="shot"><img src="img/g1-perfil.jpg" alt="El Unitree G1 simulado, de perfil"></figure>""",
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

/* ---- Lámina partida: palabras a un lado, el robot real al otro ---- */
.split .inner{flex-direction:row;align-items:center;gap:56px;padding-right:0}
.split .words{flex:1 1 46%;display:flex;flex-direction:column;gap:22px}
.split .shot{flex:1 1 54%;margin:0;align-self:stretch;overflow:hidden}
.split .shot img{width:100%;height:100%;object-fit:cover;object-position:52% 50%;display:block}
.split.end .shot img{object-position:40% 40%}
.split h1{font-size:76px}
.split.end h2{font-size:58px;word-break:break-word}
.split .meta{gap:18px}
/* ---- Lámina partida en vertical: titular arriba, diagrama abajo ---- */
.split-v .inner{gap:30px}
.split-v .words{display:flex;flex-direction:column;gap:18px}
.flow{width:100%;height:270px;display:block}
.flow rect{fill:none;stroke:rgb(13 13 11/.18)}
.flow .person,.flow .dots{fill:none;stroke:var(--ink);stroke-width:5;stroke-linecap:round}
.flow .person circle{fill:var(--ink)}
.flow .dots path{stroke:rgb(13 13 11/.25);stroke-width:3}
.flow .dots circle{fill:var(--signal-ink);stroke:none}
.flow .arrow{stroke:rgb(13 13 11/.3);stroke-width:2;marker-end:none}
.flow .fail .person{stroke:var(--signal-ink)}
.flow .fail .person circle{fill:var(--signal-ink)}
.flow .fail rect{stroke:rgb(217 58 8/.35)}
.flow text{font:500 13px var(--mono);fill:var(--muted);text-anchor:middle;text-transform:uppercase;letter-spacing:.1em}
/* ---- La lámina de la demo ---- */
.demo .inner{align-items:flex-start}
.demo h1{font-size:150px;line-height:.86}
.trio{margin:0;display:flex;gap:40px;font:500 20px/1 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--fg-2)}
.split-v .punch{font-size:25px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink-soft)}
.split-v .punch em{font-weight:600}
.road.big li{align-items:center}
.road.big span{flex:0 0 200px;font-size:13px}
.road.big b{font-size:40px;font-weight:500;letter-spacing:-.02em}

.knife{margin:0;max-width:26ch;font:500 26px/1.2 var(--display);color:var(--fg)}
.knife em{font-style:normal;color:var(--signal)}
.statement .es{margin:0;max-width:52ch;font:400 21px/1.4 var(--display);color:var(--fg-2)}
.places{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
.places li{border-top:2px solid var(--fg);padding-top:14px}
.places b{display:block;font-size:25px;font-weight:600;letter-spacing:-.015em;line-height:1.05}
.places span{display:block;margin-top:10px;font:400 14px/1.4 var(--mono);color:var(--dim)}

.dark .es{margin:0;font:400 19px/1.4 var(--display);color:var(--fg-2)}
.split.cover h1{font-size:82px}
.split.end h2{font-size:58px;word-break:break-word}
.lede.wide{max-width:62ch;font-size:21px}
.stat-row.four{gap:40px}
.trio-cols .col p{font-size:19px}
.trio-cols .col .num{margin-top:14px}
.statement .es b{font-weight:600;color:var(--fg)}
.stat-row.tam{border-top:1px solid rgb(13 13 11/.14);padding-top:18px;gap:44px}
.stat-row.tam .stat b{font-size:34px}
.stat-row.tam .stat span{font-size:14px;max-width:30ch}
.stat-row.four .stat b{font-size:52px}
.stat-row.four .stat span{font-size:17px}
.beats.light li{border-color:var(--fg)}
.road{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
.road.big{gap:26px}
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
