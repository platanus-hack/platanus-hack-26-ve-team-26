// App-wide state: one object, changed only through transition(), so every panel reacts to
// the same phase. The phases are the ones in web/TAREAS.md (W1.2).

/** Phases each phase can move to. Any phase can also move to 'error'. */
const NEXT = {
  idle: ['capturing', 'uploading'],
  capturing: ['processing', 'idle'],
  uploading: ['processing', 'idle'],
  processing: ['queued', 'ready'],
  queued: ['ready'],
  ready: ['idle', 'capturing', 'uploading'],
  error: ['idle'],
};

/** What the panel says in each phase. */
export const PHASE_LABEL = {
  idle: '',
  capturing: 'Capturando…',
  uploading: 'Subiendo…',
  processing: 'Procesando el video…',
  queued: 'En cola para entrenar',
  ready: 'Listo',
  error: 'Algo salió mal',
};

/**
 * @typedef {keyof NEXT} Phase
 * @typedef {{ phase: Phase, error: string | null }} AppState
 */

export function createStore() {
  /** @type {AppState} */
  let state = { phase: 'idle', error: null };
  const listeners = new Set();

  return {
    get: () => state,
    /** @param {Phase} phase  @param {Partial<AppState>} [patch] */
    transition(phase, patch = {}) {
      if (phase !== 'error' && !NEXT[state.phase].includes(phase)) {
        throw new Error(`invalid transition ${state.phase} → ${phase}`);
      }
      state = { ...state, error: null, ...patch, phase };
      listeners.forEach((listener) => listener(state));
    },
    /** Calls `listener` now and on every change; returns the unsubscribe function. */
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
