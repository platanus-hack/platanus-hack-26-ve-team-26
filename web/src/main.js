// Entry point of the web app: one screen with the simulation and the side panel.
import './style.css';
import { createStore } from './state.js';
import { mountPanel } from './panel.js';
import { mountViewer } from './viewer.js';

const store = createStore();
mountPanel(store);
mountViewer();
