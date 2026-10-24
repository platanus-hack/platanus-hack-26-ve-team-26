// Side panel: three tabs (capture, upload, gallery) and the current phase of the app.
import { PHASE_LABEL } from './state.js';

const TABS = ['capture', 'upload', 'gallery'];
// The gallery opens first: it is the part that already works.
const DEFAULT_TAB = 'gallery';

export function selectTab(name) {
  for (const tab of TABS) {
    const selected = tab === name;
    document.getElementById(`tab-${tab}`).setAttribute('aria-selected', String(selected));
    document.getElementById(`pane-${tab}`).hidden = !selected;
  }
}

export function mountPanel(store) {
  for (const tab of TABS) {
    document.getElementById(`tab-${tab}`).onclick = () => selectTab(tab);
  }
  selectTab(DEFAULT_TAB);

  const phase = document.getElementById('phase');
  store.subscribe(({ phase: current, error }) => {
    phase.textContent = current === 'error' && error ? `${PHASE_LABEL.error}: ${error}` : PHASE_LABEL[current];
    phase.dataset.phase = current;
  });
}
