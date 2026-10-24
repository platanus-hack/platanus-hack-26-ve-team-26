// Entry point: the dot field and its robots live behind every screen; the router swaps screens.
// The one G1 starts loading right away, behind a splash that keeps the first seconds busy.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { createApi } from './api.js';
import { DotStage } from './dots/stage.js';
import { waiting } from './dots/poses.js';
import { loadRobot, onRobotProgress } from './robot-host.js';
import { startRouter } from './router.js';
import { createStore } from './state.js';

// The splash shows at least this long, so its animation reads instead of flashing, and at most
// this long: on a slow network the menu comes up and the robot keeps loading behind it (its
// panes show a placeholder until it is ready).
const SPLASH_MIN_MS = 1800;
const SPLASH_MAX_MS = 7000;
// Time for the face to break up into the waving robot before the splash fades.
const DISSOLVE_MS = 1100;

// No drifting background: on the sober brand only the robot and the data move.
const dots = new DotStage(document.getElementById('scene'), { field: false });
const robot = loadRobot();

function runSplash() {
  const splash = document.getElementById('splash');
  const view = dots.addView(splash.querySelector('.splash-scene'), waiting);
  view.morph = 1; // starts as a cloud of data points
  const say = (text) => (splash.querySelector('.splash-status').textContent = text);
  const stopProgress = onRobotProgress(({ done, total, compiling, policy }) => {
    splash.querySelector('.splash-progress').style.width = `${(100 * done) / total}%`;
    if (policy) say('Cargando la política entrenada');
    else if (compiling) say('Compilando el modelo del robot');
    else say(`Descargando la simulación · ${done} / ${total}`);
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const loaded = robot.then(() => true, () => true); // an error still ends the splash; panes report it
  return Promise.all([wait(SPLASH_MIN_MS), Promise.race([loaded, wait(SPLASH_MAX_MS)])]).then(async () => {
    view.morph = 0; // the cloud settles into the robot
    say('Listo');
    await wait(DISSOLVE_MS);
    stopProgress();
    // The menu starts only now: its robots share the page canvas with the splash's.
    startRouter(document.getElementById('app'), { dots, store: createStore(), api });
    splash.classList.add('done');
    await wait(400); // the fade in style.css
    dots.removeView(view);
    splash.remove();
  });
}

// The video server check runs during the splash too, so "Subir" is settled when the menu shows.
const api = createApi();
runSplash();
