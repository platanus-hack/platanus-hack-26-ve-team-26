// Hash routes (#/, #/en-vivo, #/subir, #/simulaciones): they work on any static host, with no
// server rewrites. Every screen but home is a separate chunk loaded on first visit, so the menu
// does not wait for MuJoCo, the robot or MediaPipe.
import * as home from './screens/home.js';

const ROUTES = {
  '': async () => home,
  'en-vivo': () => import('./screens/live.js'),
  subir: () => import('./screens/upload.js'),
  simulaciones: () => import('./screens/simulations.js'),
};
// The fade between screens; long enough to read as a transition, short enough not to wait on it.
const FADE_MS = 180;
// A screen that takes longer than this to arrive shows "Cargando…" instead of a frozen page.
const SLOW_MS = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts loading a screen's code ahead of a click, e.g. while the pointer is over its card. */
export function prefetch(name) {
  return ROUTES[name]?.().then((screen) => screen.prefetch?.());
}

/**
 * @param app      element the screens render into
 * @param context  shared with every screen: { dots, store }
 */
export function startRouter(app, context) {
  let unmount = null;
  let navigation = 0;

  async function show() {
    const name = location.hash.replace(/^#\/?/, '');
    const load = ROUTES[name] ?? ROUTES[''];
    const mine = ++navigation;
    app.classList.add('leaving');
    const slow = setTimeout(() => app.classList.add('loading'), SLOW_MS);
    let screen;
    try {
      [screen] = await Promise.all([load(), wait(FADE_MS)]);
    } catch (error) {
      console.error(error);
      screen = await import('./screens/offline.js');
    } finally {
      clearTimeout(slow);
    }
    if (mine !== navigation) return; // another link was clicked meanwhile
    unmount?.();
    app.replaceChildren();
    unmount = screen.mount(app, context);
    document.title = screen.title ? `${screen.title} · Tridi` : 'Tridi';
    window.scrollTo(0, 0);
    app.classList.remove('leaving', 'loading');
  }

  window.addEventListener('hashchange', show);
  show();
}
