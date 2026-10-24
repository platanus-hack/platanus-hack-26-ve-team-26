// Hash routes (#/, #/en-vivo, #/subir, #/simulaciones, #/simulaciones/<clip id>, #/entrega, #/entrega/<clip id>, #/camara/<session id>): they work on any static host, with no server rewrites. Every screen but home is a separate chunk loaded on first visit, so the menu
// does not wait for MuJoCo, the robot or MediaPipe.
import * as home from './screens/home.js';

const ROUTES = {
  '': async () => home,
  'en-vivo': () => import('./screens/live.js'),
  subir: () => import('./screens/upload.js'),
  // A recorded clip's simulation (person and robot side by side, worlds, training): reached from En
  // vivo after recording, not from the home.
  simulaciones: () => import('./screens/simulations.js'),
  entrega: () => import('./screens/delivery.js'),
  camara: () => import('./screens/phone.js'), // the phone as the live camera, opened from the QR on #/en-vivo
};
// The fade between screens; long enough to read as a transition, short enough not to wait on it.
const FADE_MS = 180;
// A screen that takes longer than this to arrive shows "Cargando…" instead of a frozen page.
const SLOW_MS = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A screen's code is a file named after its build. A page opened before a deploy asks for the old
// file, which the new deploy no longer has: the screen fails until a reload brings the new page.
// So a failed screen reloads the page once on its own; only if it fails again within this long (no
// connection, really) does the offline screen show.
const RELOAD_GUARD_MS = 30_000;
const RELOADED_AT = 'tridi-reloaded-at';

function reloadForNewDeploy() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false; // no storage (private mode): no guard against a reload loop, so do not reload
  }
  location.reload();
  return true;
}

/** Starts loading a screen's code ahead of a click, e.g. while the pointer is over its card. */
export function prefetch(name) {
  return ROUTES[name]?.().then((screen) => screen.prefetch?.());
}

/**
 * @param app      element the screens render into
 * @param context  shared with every screen: { store, api }
 */
export function startRouter(app, context) {
  let unmount = null;
  let navigation = 0;

  async function show() {
    const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const load = ROUTES[name] ?? ROUTES[''];
    const mine = ++navigation;
    app.classList.add('leaving');
    const slow = setTimeout(() => app.classList.add('loading'), SLOW_MS);
    let screen;
    try {
      [screen] = await Promise.all([load(), wait(FADE_MS)]);
    } catch (error) {
      console.error(error);
      if (reloadForNewDeploy()) return;
      screen = await import('./screens/offline.js');
    } finally {
      clearTimeout(slow);
    }
    if (mine !== navigation) return; // another link was clicked meanwhile
    unmount?.();
    app.replaceChildren();
    unmount = screen.mount(app, context, params);
    document.title = screen.title ? `${screen.title} · Tridi` : 'Tridi';
    window.scrollTo(0, 0);
    app.classList.remove('leaving', 'loading');
  }

  window.addEventListener('hashchange', show);
  show();
}
