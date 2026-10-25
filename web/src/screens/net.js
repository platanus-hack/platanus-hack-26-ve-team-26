// #/red/<train id>: the policy network of one training, alone and full size (netview.js). The
// training box links here in a new tab, and the link survives reloads: a training lives on the
// server, while the box only exists in the tab that started it.
import { mountNetView } from '../netview.js';

export const title = 'La red entrenándose';

export function mount(app, { api }, [trainId]) {
  app.innerHTML = `
    <main class="net-screen">
      <a class="button" href="#/">← Volver al inicio</a>
      <section class="train-box"><div data-train="progress"><div class="train-net"></div></div></section>
      <p class="net-screen-note"></p>
    </main>`;
  const note = app.querySelector('.net-screen-note');
  if (!trainId) {
    note.textContent = 'Falta el entrenamiento: abre esta página desde la caja de Entrenar.';
    return () => {};
  }
  let view = null;
  try {
    view = mountNetView(app.querySelector('.train-net'));
  } catch (error) {
    console.error(error);
    note.textContent = 'Este navegador no puede dibujar en 3D (WebGL).';
    return () => {};
  }
  let gone = false;
  api.checked.then(() => {
    if (gone) return;
    if (!api.ok) note.textContent = 'El servidor de videos no está encendido.';
    else view.follow(api.url, trainId, true);
  });
  return () => {
    gone = true;
    view.dispose();
  };
}
