// Entrena a Tridi en vivo: the camera, and the robot copying the person (web/TAREAS.md M4).
import { dancing } from '../dots/poses.js';
import { mountIntro } from './intro.js';

export const title = 'En vivo';

export function mount(root, context) {
  return mountIntro(root, context, {
    variant: dancing,
    title: 'Entrena a Tridi en vivo',
    lead: 'Tridi mira cómo te mueves y te imita en su mundo de física.',
    steps: [
      'Deja que la página use tu cámara.',
      'Aléjate hasta que se vea todo tu cuerpo.',
      'Muévete despacio: Tridi copia lo que haces.',
    ],
    action: 'Encender la cámara',
    note: 'Muy pronto.',
  });
}
