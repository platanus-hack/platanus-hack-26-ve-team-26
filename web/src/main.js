// Entry point of the web app: one screen with the simulation and the side panel.
import './style.css';
import { createStore } from './state.js';
import { mountGallery } from './gallery.js';
import { mountPanel } from './panel.js';
import { mountStage } from './stage.js';

const store = createStore();
mountPanel(store);
mountGallery(mountStage());
