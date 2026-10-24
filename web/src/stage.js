// The simulation stage: the human skeleton of the selected clip next to the G1 from physics/,
// with one set of controls for both. The skeleton shows at once; the robot pane shows a dot
// robot until the real one has loaded (robot-pane.js).
//
// The robot repeats the clip (its RobotMotion: saved for the preloaded clips, computed here from the
// PoseClip for any other) in step with the
// skeleton, and has a trained policy loaded: "Empujar" drops the clip and shows the policy
// keeping the robot up. "Empezar de nuevo" puts both back at the start of the clip. "Mundo" puts
// the robot on another floor, grip, wind, mass and motor strength (physics/worlds); leaving the
// screen puts it back on flat ground, since the app shares one robot.
//
// For a clip with an imitation policy (policies.js IMITATIONS), "Robot entrenado con" also offers
// it: the robot then does the clip itself, with physics, from its first pose, and the skeleton
// follows the robot's clock (view.clipTime) instead of the other way around.
import { SCENES, WORLDS } from 'tridi-physics';

import { savedMotion } from './motions.js';
import { FINAL_LEVEL, IMITATIONS, imitationOf, levelLabel, policyUrls } from './policies.js';
import { dressWorld } from './looks/index.js';
import { dressPlace, setFloor } from './props.js';
import { mountRobotPane } from './robot-pane.js';
import { SkeletonView } from './skeleton.js';
import { createVideoOverlay } from './video-overlay.js';

// Player icons (24 px, currentColor): the playback buttons carry only an icon and a tooltip.
export const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5M5 4v4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
// The speed button cycles through these (1 = real time).
const SPEEDS = [1, 0.5, 0.25];

// A hidden tab or a shader compile can stall a frame; past this the skeleton skips ahead
// instead of jumping, as physics/ does for the robot.
const MAX_FRAME_S = 1 / 30;

/**
 * @param root  element holding the stage markup of screens/simulations.js
 */
export function mountStage(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const skeleton = new SkeletonView($('human'));
  const label = root.querySelector('.robot-pane .pane-label');
  // The robot is physical (policy in control) after a push; otherwise it plays the clip.
  const robot = mountRobotPane(root.querySelector('.robot-pane'), {
    beforePush() {
      copying = false;
      setRobotLabel();
    },
  });
  let playing = true;
  let speed = 1;
  let level = $('policy').value;
  let current = null; // { clip, title }: what the gallery selected
  let motion = null; // the RobotMotion of `current`
  let copying = false; // the robot is playing `motion`
  const motions = new Map(); // clip id -> RobotMotion, so a clip is retargeted once

  const imitating = () => imitationOf(level) !== null;
  // With physics (default) the robot moves by itself: the imitation policy of the clip if there is
  // one, or standing with its policy if it has not learned this movement yet. Without physics it
  // replays the movement as a puppet, as a reference: what it would look like, not what it can do.
  let physics = true;
  const imitationFor = (clip) => IMITATIONS.find((imitation) => imitation.clip === clip?.id) ?? null;
  const overlay = createVideoOverlay(root.querySelector('#human-pane'));

  // A clip moves with physics only if a policy learned it (an imitation); any other clip is shown
  // as before, the robot replaying its movement without physics.
  const withPhysics = () => physics && imitationFor(current?.clip) !== null;

  // After any change (checkpoint, world, place): the puppet replay unless the clip moves with physics.
  function resume() {
    if (!withPhysics() && motion && !imitating()) startMotion();
    else {
      copying = false;
      setRobotLabel();
    }
  }

  // With physics, a clip with an imitation policy is shown with it.
  function physicsFor(clip) {
    const imitation = imitationFor(clip);
    if (physics && imitation && level !== imitation.id) {
      $('policy').value = imitation.id;
      return loadLevel(imitation.id);
    }
    resume();
  }

  // What the world looks like (looks/): redone after every change of world or place.
  let look = null;
  function refreshLook() {
    look?.undo();
    look = robot.view ? dressWorld(robot.view) : null;
  }

  function setRobotLabel(text) {
    const world = robot.view?.world();
    const place = robot.view?.scene();
    const where = [world && world.id !== 'plano' ? world.title : null, place?.title].filter(Boolean).map((w) => ` · ${w.toLowerCase()}`).join('');
    const doing = imitating()
      ? 'imita el video con física (en entrenamiento)'
      : copying
        ? 'repite el movimiento, sin física'
        : `se equilibra solo (${levelLabel(level).toLowerCase()})`;
    label.textContent = text ?? `Robot · ${doing}${where}`;
  }

  let last = performance.now();
  let frameId = requestAnimationFrame(function frame(now) {
    const wall = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    // Imitating, the robot's physics sets the time and the skeleton follows it. Otherwise the
    // skeleton's clock is the stage's and the robot follows it, so the two never drift apart.
    if (imitating() && robot.view) skeleton.time = robot.view.clipTime();
    else if (playing) skeleton.advance(wall * speed);
    if (copying && robot.view) robot.view.seek(skeleton.time);
    look?.update(wall);
    overlay.sync(skeleton.time, playing, speed);
    skeleton.render();
    frameId = requestAnimationFrame(frame);
  });

  // Shows the current clip on the robot. Its RobotMotion comes from the saved ones if there is one;
  // otherwise it is computed in slices, with its progress on the label, so the page keeps working.
  async function copyCurrent() {
    const view = robot.view;
    if (!view || !current) return;
    const { clip } = current;
    if (!motions.has(clip.id)) {
      const saved = await savedMotion(clip.id);
      if (saved) motions.set(clip.id, saved);
      else {
        setRobotLabel('Calculando el movimiento del robot…');
        const computed = await view.retarget(clip, {
          onProgress: (done) => current?.clip === clip && setRobotLabel(`Calculando el movimiento del robot… ${Math.round(100 * done)} %`),
        });
        if (!computed) return; // the user left the screen
        motions.set(clip.id, computed.motion);
      }
    }
    if (current?.clip !== clip) return; // the user chose another clip meanwhile
    motion = motions.get(clip.id);
    resume();
  }

  function startMotion() {
    if (!robot.view || !motion || imitating()) return;
    robot.view.playClip(motion);
    robot.view.seek(skeleton.time);
    copying = true;
    setRobotLabel();
  }

  // Loads a training checkpoint. It ends the clip (the robot goes physical), so the clip resumes after.
  async function loadLevel(id) {
    const view = robot.view;
    if (!view) return;
    $('policy').disabled = true;
    root.querySelector('.push').disabled = true;
    setRobotLabel('Cargando lo que aprendió el robot…');
    try {
      const { onnx, json } = policyUrls(id);
      // An imitation policy also needs the RobotMotion of the clip it learned.
      const imitation = imitationOf(id);
      const learned = imitation && (motions.get(imitation.clip) ?? (await savedMotion(imitation.clip)));
      await view.loadPolicy(onnx, json, imitation ? { motion: learned } : {});
      level = id;
      if (imitation) skeleton.time = 0; // the robot starts the clip from its first pose
    } catch (error) {
      console.error(error);
      $('policy').value = level;
      setRobotLabel('No se pudo cargar lo que aprendió el robot.');
    } finally {
      $('policy').disabled = false;
      root.querySelector('.push').disabled = !robot.view; // never before the robot is there
    }
    // The user may have picked another clip while it loaded: an imitation is only for its own clip.
    if (imitating() && imitationOf(level).clip !== current?.clip.id) {
      $('policy').value = FINAL_LEVEL;
      return loadLevel(FINAL_LEVEL);
    }
    copying = false;
    resume();
  }

  // Another world: a world on the stones scene reloads the model (a moment), and the clip resumes after.
  async function setWorld(id) {
    const view = robot.view;
    if (!view) return;
    $('world').disabled = true;
    root.querySelector('.push').disabled = true;
    setRobotLabel('Cambiando de mundo…');
    try {
      await view.setWorld(WORLDS.find((world) => world.id === id));
      await dressPlace(view); // a new world rebuilds the drawn geoms: dress the place again
      refreshLook();
    } catch (error) {
      console.error(error);
      setRobotLabel('No se pudo cambiar de mundo.');
    } finally {
      $('world').disabled = false;
      root.querySelector('.push').disabled = !robot.view; // never before the robot is there
    }
    copying = false;
    syncSliders(); // the new world's own values
    resume();
  }

  // Another place (a kitchen, a warehouse, a sidewalk): its furniture is solid and its loose objects
  // can be knocked over. It rebuilds the model (a moment), and the clip resumes after.
  async function setPlace(id) {
    const view = robot.view;
    if (!view) return;
    $('place').disabled = true;
    root.querySelector('.push').disabled = true;
    setRobotLabel('Armando el lugar…');
    try {
      await view.setScene(SCENES.find((scene) => scene.id === id) ?? null);
      await dressPlace(view); // real models over the place's boxes and cylinders
      setFloor(view, id); // and its floor: tiles, concrete or sidewalk
      refreshLook();
    } catch (error) {
      console.error(error);
      setRobotLabel('No se pudo armar el lugar.');
    } finally {
      $('place').disabled = false;
      root.querySelector('.push').disabled = !robot.view; // never before the robot is there
    }
    copying = false;
    resume();
  }

  robot.ready.then(async (view) => {
    if (!view) return;
    refreshLook();
    view.setSpeed(speed);
    if (!playing) view.pause();
    await loadLevel(FINAL_LEVEL); // standing with its policy: physics from the first frame
    if (current) await physicsFor(current.clip);
    copyCurrent(); // the puppet reference, ready for the "sin física" mode
  });

  $('show').onchange = (event) => ($('stage').dataset.show = event.target.value);
  $('policy').onchange = (event) => loadLevel(event.target.value);
  $('world').onchange = (event) => setWorld(event.target.value);

  // Conditions by hand: each slider sets one value at once (view.setConditions), over the world.
  const sliders = [...root.querySelectorAll('input[data-condition]')];
  const decimal = (value, digits) => value.toFixed(digits).replace('.', ',');
  const showValue = (key, value) => {
    const out = root.querySelector(`output[data-condition="${key}"]`);
    if (key === 'friction') out.textContent = decimal(value, 2);
    // The force comes from physics/ (view.conditions), so the drag formula lives in one place.
    else if (key === 'wind_mps') out.textContent = value ? `${decimal(value, 0)} m/s · ${decimal(robot.view?.conditions().wind_newtons ?? 0, 0)} N` : 'sin viento';
    else out.textContent = `×${decimal(value, 2)}`;
  };
  function syncSliders() {
    const view = robot.view;
    if (!view) return;
    const current = view.conditions();
    for (const slider of sliders) {
      slider.value = current[slider.dataset.condition];
      slider.disabled = false;
      showValue(slider.dataset.condition, Number(slider.value));
    }
  }
  for (const slider of sliders) {
    slider.oninput = () => {
      const value = Number(slider.value);
      robot.view?.setConditions({ [slider.dataset.condition]: value });
      showValue(slider.dataset.condition, value);
    };
  }
  robot.ready.then(syncSliders);
  $('place').onchange = (event) => setPlace(event.target.value);
  $('play').onclick = () => {
    playing = !playing;
    if (robot.view) playing ? robot.view.play() : robot.view.pause();
    $('play').innerHTML = playing ? ICONS.pause : ICONS.play;
    $('play').setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
    $('play').title = playing ? 'Pausa' : 'Reproducir';
  };
  $('speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    robot.view?.setSpeed(speed);
    $('speed').textContent = `${String(speed).replace('.', ',')}×`;
  };
  // The physics switch only means something for a clip a policy learned: elsewhere it says so.
  function showMode(clip) {
    const learned = imitationFor(clip) !== null;
    root.querySelector('[data-physics="on"]').disabled = !learned;
    // Each note has a short phone version (.only-narrow, style.css).
    root.querySelector('.mode-note').innerHTML = learned
      ? '<span class="only-wide">Con física el robot lo hace solo, con sus motores (todavía en entrenamiento: se cae a los pocos segundos). Sin física lo repite como un títere.</span><span class="only-narrow">Con física lo hace solo (aún se cae pronto). Sin física, lo copia como títere.</span>'
      : '<span class="only-wide">Este movimiento todavía no tiene una política entrenada: el robot lo repite sin física, como referencia.</span><span class="only-narrow">Aún sin política entrenada: lo copia sin física.</span>';
    root.querySelectorAll('[data-physics]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.physics === 'on') === (learned && physics))));
  }

  // Physics on or off (see `physics`).
  for (const button of root.querySelectorAll('[data-physics]')) {
    button.onclick = async () => {
      physics = button.dataset.physics === 'on';
      root.querySelectorAll('[data-physics]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (!robot.view) return;
      if (physics) {
        robot.view.stop(); // the puppet stands back up, on its own motors
        copying = false;
        await physicsFor(current?.clip);
      } else if (imitating()) {
        $('policy').value = FINAL_LEVEL;
        await loadLevel(FINAL_LEVEL); // ends with resume(): the puppet replay
      } else resume();
    };
  }
  $('reset').onclick = () => {
    skeleton.time = 0;
    if (!withPhysics() && motion && !imitating()) startMotion();
    else robot.view?.reset(); // the policy puts the robot back in its first pose (standing or the clip's)
  };

  // An imitation option is only for the clip it learned; leaving that clip goes back to standing.
  function offerImitations(clip) {
    for (const { id, clip: learned } of IMITATIONS) {
      const option = $('policy').querySelector(`option[value="${id}"]`);
      if (option) option.disabled = clip.id !== learned;
    }
    if (imitating() && imitationOf(level).clip !== clip.id) {
      $('policy').value = FINAL_LEVEL;
      loadLevel(FINAL_LEVEL);
    }
  }

  return {
    /** @param {import('./contract.js').PoseClip} clip  @param {string} title */
    showClip(clip, title) {
      skeleton.setClip(clip);
      $('human-label').textContent = `Persona · ${title}`;
      current = { clip, title };
      offerImitations(clip);
      showMode(clip);
      overlay.show(clip.id).catch(console.error);
      motion = motions.get(clip.id) ?? null;
      physicsFor(clip);
      if (!motion) copyCurrent();
    },
    dispose() {
      cancelAnimationFrame(frameId);
      skeleton.dispose();
      overlay.dispose();
      const view = robot.view;
      // The app shares one robot: the next screen starts on flat, empty ground. One rebuild at a time.
      if (view) {
        look?.undo();
        look = null;
        setFloor(view, null); // the viewer's own floor again
        const flat = view.world() && view.world().id !== 'plano' ? view.setWorld(WORLDS.find((world) => world.id === 'plano')) : Promise.resolve();
        flat.then(() => view.scene() && view.setScene(null));
      }
      robot.dispose();
    },
  };
}
