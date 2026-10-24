// Shared layout of the live and upload screens until their tools land (web/TAREAS.md M4, M5):
// the card's robot large on one side, and the steps in plain words on the other.

/**
 * @param {{ variant, title, lead, steps: string[], action: string, note: string }} page
 */
export function mountIntro(root, { dots }, page) {
  root.innerHTML = `
    <section class="page intro">
      <a class="back" href="#/">← Volver al inicio</a>
      <div class="intro-grid">
        <div class="intro-scene" aria-hidden="true"></div>
        <div class="intro-text">
          <h1></h1>
          <p class="lead"></p>
          <ol class="steps"></ol>
          <button class="primary" type="button" disabled></button>
          <p class="note"></p>
        </div>
      </div>
    </section>`;
  root.querySelector('h1').textContent = page.title;
  root.querySelector('.lead').textContent = page.lead;
  root.querySelector('.steps').append(
    ...page.steps.map((step) => Object.assign(document.createElement('li'), { textContent: step })),
  );
  root.querySelector('.primary').textContent = page.action;
  root.querySelector('.note').textContent = page.note;
  const view = dots.addView(root.querySelector('.intro-scene'), page.variant, root.querySelector('.intro-text'));
  return () => dots.removeView(view);
}
