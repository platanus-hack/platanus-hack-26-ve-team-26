// Shown when a screen's code cannot be downloaded (no connection, or a deploy replaced it).
export const title = 'Sin conexión';

export function mount(root) {
  root.innerHTML = `
    <section class="page narrow">
      <a class="back" href="#/">← Tridi</a>
      <h1>No pudimos abrir esta parte</h1>
      <p class="lead">Revisa tu conexión a internet y vuelve a intentarlo.</p>
      <button class="primary" type="button">Intentar de nuevo</button>
    </section>`;
  root.querySelector('button').onclick = () => location.reload();
  return () => {};
}
