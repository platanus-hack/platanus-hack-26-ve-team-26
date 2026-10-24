// Entry point: the dot field and its robots live behind every screen; the router swaps screens.
import '@fontsource-variable/quicksand';
import '@fontsource-variable/nunito';
import './style.css';
import { DotStage } from './dots/stage.js';
import { startRouter } from './router.js';
import { createStore } from './state.js';

const dots = new DotStage(document.getElementById('scene'));
startRouter(document.getElementById('app'), { dots, store: createStore() });
