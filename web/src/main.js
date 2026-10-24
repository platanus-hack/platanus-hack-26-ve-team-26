// Entry point: the dot field and its robots live behind every screen; the router swaps screens.
// The one G1 starts loading right away, behind a short splash with its progress.
import '@fontsource-variable/quicksand';
import '@fontsource-variable/nunito';
import './style.css';
import { createApi } from './api.js';
import { DotStage } from './dots/stage.js';
import { loadRobot, onRobotProgress } from './robot-host.js';
import { startRouter } from './router.js';
import { createStore } from './state.js';

// The splash shows at least this long, so it reads instead of flashing, and at most this long:
// on a slow network the home comes up and the robot keeps loading behind it (its panes show a
// placeholder until it is ready). No 3D on the splash: it would compete with the robot's load.
const SPLASH_MIN_MS = 900;
const SPLASH_MAX_MS = 7000;

const dots = new DotStage(document.getElementById('scene'));
const robot = loadRobot();

function runSplash() {
  const splash = document.getElementById('splash');
  const say = (text) => (splash.querySelector('.splash-status').textContent = text);
  const stopProgress = onRobotProgress(({ done, total, compiling, policy }) => {
    splash.querySelector('.splash-progress').style.width = `${(100 * done) / total}%`;
    if (policy) say('Enseñándole a mantenerse de pie…');
    else if (compiling) say('Armando al robot…');
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const loaded = robot.then(() => true, () => true); // an error still ends the splash; panes report it
  return Promise.all([wait(SPLASH_MIN_MS), Promise.race([loaded, wait(SPLASH_MAX_MS)])]).then(async () => {
    stopProgress();
    startRouter(document.getElementById('app'), { dots, store: createStore(), api });
    splash.classList.add('done');
    await wait(400); // the fade in style.css
    splash.remove();
  });
}

// The video server check runs during the splash too, so "Subir" is settled when the menu shows.
const api = createApi();
runSplash();
