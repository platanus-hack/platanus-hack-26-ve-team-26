// The one loader of the app and the landing: Tridi's mark turning inside a lime arc that circles it
// (styles: .loader in style.css). CSS only, so it shows before any WebGL or wasm is ready.
import { LOGO } from './brand.js';

/** @param size  'small' for a loader next to a line of text, as the landing's boot readout */
export const loader = (size = '') => `<span class="loader ${size}" aria-hidden="true">${LOGO}</span>`;
