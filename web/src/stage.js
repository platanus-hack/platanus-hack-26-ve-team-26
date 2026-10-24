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
import { mountRobotPane } from './robot-pane.js';
import { SkeletonView } from './skeleton.js';

// A hidden tab or a shader compile can stall a frame; past this the skeleton skips ahead
// instead of jumping, as physics/ does for the robot.
const MAX_FRAME_S = 1 / 30;

/**
 * @param root  element holding the stage markup of screens/simulations.js
 * @param dots  the page's DotStage, for the placeholder robot
 */
export function mountStage(root, dots) {
  const $ = (id) => root.querySelector(`#${id}`);
  const skeleton = new SkeletonView($('human'));
  const label = root.querySelector('.robot-pane .pane-label');
  // The robot is physical (policy in control) after a push; otherwise it plays the clip.
  const robot = mountRobotPane(root.querySelector('.robot-pane'), dots, {
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

  function setRobotLabel(text) {
    const world = robot.view?.world();
    const place = robot.view?.scene();
    const where = [world && world.id !== 'plano' ? world.title : null, place?.title].filter(Boolean).map((w) => ` · ${w.toLowerCase()}`).join('');
    const doing = imitating()
      ? 'imita el video con física (en entrenamiento)'
      : copying ? 'repite el movimiento' : `se equilibra solo (${levelLabel(level).toLowerCase()})`;
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
    startMotion();
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
      root.querySelector('.push').disabled = false;
    }
    copying = false;
    if (motion && !imitating()) startMotion();
    else setRobotLabel();
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
    } catch (error) {
      console.error(error);
      setRobotLabel('No se pudo cambiar de mundo.');
    } finally {
      $('world').disabled = false;
      root.querySelector('.push').disabled = false;
    }
    copying = false;
    syncSliders(); // the new world's own values
    if (motion && !imitating()) startMotion();
    else setRobotLabel();
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
    } catch (error) {
      console.error(error);
      setRobotLabel('No se pudo armar el lugar.');
    } finally {
      $('place').disabled = false;
      root.querySelector('.push').disabled = false;
    }
    copying = false;
    if (motion && !imitating()) startMotion();
    else setRobotLabel();
  }

  robot.ready.then(async (view) => {
    if (!view) return;
    view.setSpeed(speed);
    if (!playing) view.pause();
    await copyCurrent(); // the robot moves right away
    await loadLevel(FINAL_LEVEL); // and then learns to stand in the background
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
    $('play').textContent = playing ? 'Pausa' : 'Seguir';
  };
  $('speed').onchange = (event) => {
    speed = Number(event.target.value);
    robot.view?.setSpeed(speed);
  };
  $('reset').onclick = () => {
    skeleton.time = 0;
    if (motion && !imitating()) startMotion();
    else robot.view?.reset(); // imitating: the policy puts the robot back in the clip's first pose
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
      motion = motions.get(clip.id) ?? null;
      if (motion) startMotion();
      else copyCurrent();
    },
    dispose() {
      cancelAnimationFrame(frameId);
      skeleton.dispose();
      const view = robot.view;
      // The app shares one robot: the next screen starts on flat, empty ground. One rebuild at a time.
      if (view) {
        const flat = view.world() && view.world().id !== 'plano' ? view.setWorld(WORLDS.find((world) => world.id === 'plano')) : Promise.resolve();
        flat.then(() => view.scene() && view.setScene(null));
      }
      robot.dispose();
    },
  };
}
