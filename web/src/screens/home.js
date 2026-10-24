// Landing (docs/marca.md): a product page for humanoid robot teams. Eight sections: hero with the
// live G1, the problem, how it works, the product console, results, who it is for, technology
// and contact. Every number links to the README where it was measured; nothing here names a
// company as a client (docs/decisiones/2026-10-24-marca-b2b-robotica.md).
import { mountRobotPane, robotPaneHTML } from '../robot-pane.js';
import { prefetch } from '../router.js';

export const title = '';

const REPO = 'https://github.com/platanus-hack/platanus-hack-26-ve-team-26';
const source = (path, text = path) => `<a class="source" href="${REPO}/blob/main/${path}" target="_blank" rel="noopener">${text}</a>`;

// The policy ladder of training/README.md ("La política de hoy"): seconds standing out of 20 and
// 250 N pushes withstood out of 4, for the same robot at each training checkpoint.
const LADDER = [
  { label: 'Sin entrenar', standing: 1.1, pushes: 0 },
  { label: '3 M pasos', standing: 4.2, pushes: 0 },
  { label: '10 M pasos', standing: 9.6, pushes: 1.2 },
  { label: '20 M pasos', standing: 13.4, pushes: 2.2 },
  { label: '40 M pasos', standing: 20, pushes: 4 },
];
const decimal = (n) => String(n).replace('.', ',');

const CONSOLE = [
  { route: 'en-vivo', name: 'Cámara en vivo', text: 'Una persona frente a la cámara; el G1 copia su postura cuadro a cuadro.', action: 'Abrir la cámara' },
  { route: 'subir', name: 'Subir un video', text: 'Un video de hasta 30 s. Tridi elige a la persona, la sigue y extrae su movimiento 3D.', action: 'Subir un video' },
  { route: 'simulaciones', name: 'Simulaciones', text: 'Clips ya procesados junto al robot, y la política en cada etapa de su entrenamiento.', action: 'Ver simulaciones' },
];

export function mount(root, { dots, api }) {
  root.innerHTML = `
    <header class="topbar">
      <a class="wordmark" href="#/">Tridi</a>
      <nav aria-label="Secciones">
        <a href="#problema" data-scroll>Problema</a>
        <a href="#como-funciona" data-scroll>Cómo funciona</a>
        <a href="#resultados" data-scroll>Resultados</a>
        <a href="#tecnologia" data-scroll>Tecnología</a>
      </nav>
      <a class="button primary small" href="#/en-vivo">Probar en vivo</a>
    </header>

    <section class="hero">
      <div class="hero-text">
        <p class="kicker">Datos de movimiento para robótica humanoide</p>
        <h1>Datos de movimiento humano para robots humanoides, desde cualquier video.</h1>
        <p class="lead">Tridi convierte video de personas reales en movimiento 3D y en políticas entrenadas en simulación física. Sin estudios de captura, sin trajes, sin teleoperación.</p>
        <div class="row">
          <a class="button primary" href="#/en-vivo">Probar en vivo</a>
          <a class="button" href="#contacto" data-scroll>Hablar con el equipo</a>
        </div>
        <p class="hero-note">Este robot corre en tu navegador, con física real. Empújalo: lo mantiene de pie una política que entrenamos nosotros.</p>
      </div>
      ${robotPaneHTML('Unitree G1 · política entrenada, 40 M pasos')}
    </section>

    <section class="band" id="problema">
      <p class="kicker">El problema</p>
      <h2>Un humanoide aprende a moverse viendo a personas moverse. Ese dato hoy es caro.</h2>
      <div class="grid three">
        <article>
          <h3>Estudios de captura</h3>
          <p>Salas con cámaras, trajes con marcadores y actores. Cada hora de movimiento cuesta equipo, espacio y gente.</p>
        </article>
        <article>
          <h3>Teleoperación</h3>
          <p>Una persona maneja el robot para enseñarle cada tarea. Escala tan rápido como se contratan operadores.</p>
        </article>
        <article>
          <h3>El video ya existe</h3>
          <p>Hay grabaciones de personas caminando, corriendo y trabajando en todas partes. Lo que falta es convertirlas en datos que un robot pueda usar.</p>
        </article>
      </div>
      <p class="answer"><strong>Tridi hace esa conversión:</strong> toma un video común, extrae el movimiento de una persona y lo lleva a un robot en una simulación física, donde una red aprende a ejecutarlo sin caerse.</p>
    </section>

    <section class="band" id="como-funciona">
      <p class="kicker">Cómo funciona</p>
      <h2>Del video a una política, en tres pasos.</h2>
      <ol class="grid three steps-list">
        <li>
          <span class="step-num">01</span>
          <h3>Video</h3>
          <p>Un archivo o la cámara. Si hay varias personas, Tridi elige una y la sigue en todo el video.</p>
          <p class="figure"><span class="mono">~40 s</span> para procesar 10 s de video ${source('data/README.md', 'data/README.md')}</p>
        </li>
        <li>
          <span class="step-num">02</span>
          <h3>Movimiento 3D</h3>
          <p>El esqueleto 3D de esa persona se traduce a las articulaciones del Unitree G1.</p>
          <p class="figure"><span class="mono">3,2 cm</span> de error mediano en una caminata real ${source('physics/README.md', 'physics/README.md')}</p>
        </li>
        <li>
          <span class="step-num">03</span>
          <h3>Política</h3>
          <p>Una red neuronal pequeña aprende, por refuerzo en física real (MuJoCo), a sostener al robot y a recuperarse.</p>
          <p class="figure"><span class="mono">73 min</span> de entrenamiento en una laptop ${source('training/README.md', 'training/README.md')}</p>
        </li>
      </ol>
    </section>

    <section class="band" id="pruebalo">
      <p class="kicker">Pruébalo</p>
      <h2>La consola del producto.</h2>
      <div class="grid three console"></div>
    </section>

    <section class="band" id="resultados">
      <p class="kicker">Resultados</p>
      <h2>Números, no adjetivos.</h2>
      <div class="grid four stats">
        <div><p class="stat mono">4 de 4</p><p>empujones de 250 N aguantados por la política final</p>${source('training/README.md', 'Fuente')}</div>
        <div><p class="stat mono">20 s</p><p>de pie en cada prueba de 20 s, frente a 1,1 s sin entrenar</p>${source('training/README.md', 'Fuente')}</div>
        <div><p class="stat mono">3,2 cm</p><p>error mediano al llevar una caminata real al G1</p>${source('physics/README.md', 'Fuente')}</div>
        <div><p class="stat mono">40 M</p><p>pasos de entrenamiento, en dos vueltas de 38,5 y 34,5 min</p>${source('training/README.md', 'Fuente')}</div>
      </div>
      <div class="ladder">
        <div class="ladder-head">
          <h3>El mismo robot, el mismo empujón, a lo largo del entrenamiento</h3>
          <p class="legend"><span class="swatch standing"></span>Segundos de pie (de 20) <span class="swatch pushes"></span>Empujones de 250 N aguantados (de 4)</p>
        </div>
        <div class="ladder-rows"></div>
        <a class="button" href="#/simulaciones">Probar cada etapa en la simulación</a>
      </div>
    </section>

    <section class="band" id="para-quien">
      <p class="kicker">Para quién</p>
      <h2>Para quien entrena robots que se mueven como personas.</h2>
      <div class="grid three">
        <article>
          <h3>Equipos de humanoides</h3>
          <p>Datos de movimiento humano a escala, sin montar estudios de captura ni teleoperar durante meses.</p>
        </article>
        <article>
          <h3>Laboratorios de robótica</h3>
          <p>Un proceso reproducible y abierto, con cada número medido y el código para repetirlo.</p>
        </article>
        <article>
          <h3>Integradores</h3>
          <p>Movimientos de tareas reales, grabados en el lugar de trabajo con una cámara común.</p>
        </article>
      </div>
    </section>

    <section class="band" id="tecnologia">
      <p class="kicker">Tecnología</p>
      <h2>Lo que usamos y lo que hicimos.</h2>
      <dl class="tech">
        <div><dt>Física</dt><dd>El solver es MuJoCo, como en todo el sector. La escena, el visor, el lazo de simulación, las pruebas de física y el entorno de entrenamiento son nuestros.</dd></div>
        <div><dt>Robot</dt><dd>Unitree G1, el modelo de MuJoCo Menagerie sin cambios: 29 articulaciones, 33 kg.</dd></div>
        <div><dt>Visión</dt><dd>YOLO y ByteTrack para encontrar y seguir a la persona; MediaPipe para su pose 3D.</dd></div>
        <div><dt>Política</dt><dd>Una red pequeña entrenada con PPO en MuJoCo y exportada a ONNX: corre en el navegador, junto a la física.</dd></div>
        <div><dt>Código</dt><dd>Todo abierto: <a href="${REPO}" target="_blank" rel="noopener">github.com/platanus-hack/platanus-hack-26-ve-team-26</a></dd></div>
      </dl>
    </section>

    <section class="band closing" id="contacto">
      <p class="kicker">Hablar con el equipo</p>
      <h2>¿Entrenas un humanoide? Hablemos.</h2>
      <p class="lead">Somos cuatro personas en Caracas. Escríbenos por GitHub o abre un issue en el repositorio.</p>
      <ul class="team">
        <li><strong>Juan</strong><span>Datos y entrenamiento</span><a href="https://github.com/juanevillam" target="_blank" rel="noopener">github.com/juanevillam</a></li>
        <li><strong>Pastor</strong><span>Física y robot</span><a href="https://github.com/torpass" target="_blank" rel="noopener">github.com/torpass</a></li>
        <li><strong>César</strong><span>Producto y web</span><a href="https://github.com/cisorm" target="_blank" rel="noopener">github.com/cisorm</a></li>
        <li><strong>Ale</strong><span>Estrategia</span><a href="https://github.com/alehernandezt" target="_blank" rel="noopener">github.com/alehernandezt</a></li>
      </ul>
      <a class="button primary" href="${REPO}/issues" target="_blank" rel="noopener">Abrir un issue</a>
    </section>

    <footer class="footer">
      <span class="wordmark">Tridi</span>
      <span>Platanus Hack 26 · Caracas · Código abierto</span>
    </footer>`;

  // Same-page links scroll; the hash stays for the router.
  for (const link of root.querySelectorAll('[data-scroll]')) {
    link.onclick = (event) => {
      event.preventDefault();
      root.querySelector(link.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
    };
  }

  // The policy ladder as bars, from the table above.
  root.querySelector('.ladder-rows').innerHTML = LADDER.map(
    ({ label, standing, pushes }) => `
      <div class="ladder-row">
        <span class="ladder-label">${label}</span>
        <div class="bars">
          <div class="bar-line"><span class="bar-track"><span class="bar standing" style="width:${(100 * standing) / 20}%"></span></span><span class="mono">${decimal(standing)} s</span></div>
          <div class="bar-line"><span class="bar-track"><span class="bar pushes" style="width:${(100 * pushes) / 4}%"></span></span><span class="mono">${decimal(pushes)} / 4</span></div>
        </div>
      </div>`,
  ).join('');

  // The product console: the three working features.
  const consoleGrid = root.querySelector('.console');
  for (const item of CONSOLE) {
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = `#/${item.route}`;
    tile.innerHTML = `<span class="status mono">Disponible</span><h3></h3><p></p><span class="tile-action"></span>`;
    tile.querySelector('h3').textContent = item.name;
    tile.querySelector('p').textContent = item.text;
    tile.querySelector('.tile-action').textContent = `${item.action} →`;
    // Intent to open a screen starts loading its code.
    tile.addEventListener('pointerenter', () => prefetch(item.route), { once: true });
    consoleGrid.append(tile);
  }
  // Without the video server, upload stays listed but says why it is off (Juan's call).
  let gone = false;
  api.checked.then((ok) => {
    if (ok || gone) return;
    const tile = consoleGrid.children[CONSOLE.findIndex((item) => item.route === 'subir')];
    tile.classList.add('unavailable');
    tile.removeAttribute('href');
    tile.setAttribute('aria-disabled', 'true');
    tile.querySelector('.status').textContent = 'No disponible ahora';
    tile.querySelector('p').textContent = 'El equipo que procesa los videos está apagado. Mientras tanto, usa la cámara o las simulaciones.';
    tile.querySelector('.tile-action').textContent = '';
  });

  const robot = mountRobotPane(root.querySelector('.hero .robot-pane'), dots);
  return () => {
    gone = true;
    robot.dispose();
  };
}
