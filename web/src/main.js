// Entry point: the router swaps screens over a still background (style.css body::before).
// The one G1 starts loading right away; the landing shows at once and its robot windows show the
// download until the robot is ready (no splash in front of the page).
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/geist-mono';
import './style.css';
import { createApi } from './api.js';
import { loader } from './loader.js';
import { loadRobot } from './robot-host.js';
import { startRouter } from './router.js';
import { createStore } from './state.js';

document.getElementById('app-loading').insertAdjacentHTML('afterbegin', loader('small'));
loadRobot();

// The video server check starts now, so "Subir" is settled by the time anyone scrolls to it.
const api = createApi();
startRouter(document.getElementById('app'), { store: createStore(), api });
