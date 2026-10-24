// Entry point: the dot field and its robots live behind the app screens; the router swaps screens.
// The one G1 starts loading right away; the landing shows at once and its robot windows show the
// download until the robot is ready (no splash in front of the page).
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/geist-mono';
import './style.css';
import { createApi } from './api.js';
import { DotStage } from './dots/stage.js';
import { loadRobot } from './robot-host.js';
import { startRouter } from './router.js';
import { createStore } from './state.js';

const dots = new DotStage(document.getElementById('scene'));
loadRobot();

// The video server check starts now, so "Subir" is settled by the time anyone scrolls to it.
const api = createApi();
startRouter(document.getElementById('app'), { dots, store: createStore(), api });
