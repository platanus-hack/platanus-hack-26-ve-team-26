// Sube un video: upload, pick the person and follow the progress (web/TAREAS.md M5 and M6).
import { watching } from '../dots/poses.js';
import { mountIntro } from './intro.js';

export const title = 'Subir un video';

export function mount(root, context) {
  return mountIntro(root, context, {
    variant: watching,
    title: 'Sube un video',
    lead: 'Tridi aprende de una persona moviéndose: caminando, bailando o corriendo.',
    steps: [
      'Elige un video de tu teléfono o computadora.',
      'Si hay varias personas, toca la que quieres que Tridi aprenda.',
      'Espera un momento mientras Tridi lo mira. Mientras tanto, puedes ver otras simulaciones.',
    ],
    action: 'Elegir un video',
    note: 'Muy pronto.',
  });
}
