// The simulation stage: the human skeleton of the selected clip next to the G1 from physics/,
// with one set of controls for both. The skeleton shows at once; the robot pane shows a dot
// robot until the real one has loaded (robot-pane.js).
//
// The robot repeats the clip (its RobotMotion: saved for the preloaded clips, computed here from the
// PoseClip for any other) in step with the
// skeleton, and has a trained policy loaded: "Empujar" drops the clip and shows the policy
// keeping the robot up. "Empezar de nuevo" puts both back at the start of the clip.
import { savedMotion } from './motions.js';
import { FINAL_LEVEL, levelLabel, policyUrls } from './policies.js';
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

  function setRobotLabel(text) {
    label.textContent = text ?? (copying ? 'Robot · repite el movimiento' : `Robot · se equilibra solo (${levelLabel(level).toLowerCase()})`);
  }

  let last = performance.now();
  let frameId = requestAnimationFrame(function frame(now) {
    const wall = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    if (playing) skeleton.advance(wall * speed);
    // The skeleton's clock is the stage's: the robot follows it, so the two never drift apart.
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
    if (!robot.view || !motion) return;
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
      await view.loadPolicy(onnx, json);
      level = id;
    } catch (error) {
      console.error(error);
      $('policy').value = level;
      setRobotLabel('No se pudo cargar lo que aprendió el robot.');
    } finally {
      $('policy').disabled = false;
      root.querySelector('.push').disabled = false;
    }
    copying = false;
    if (motion) startMotion();
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
    if (motion) startMotion();
    else robot.view?.reset();
  };

  return {
    /** @param {import('./contract.js').PoseClip} clip  @param {string} title */
    showClip(clip, title) {
      skeleton.setClip(clip);
      $('human-label').textContent = `Persona · ${title}`;
      current = { clip, title };
      motion = motions.get(clip.id) ?? null;
      if (motion) startMotion();
      else copyCurrent();
    },
    dispose() {
      cancelAnimationFrame(frameId);
      skeleton.dispose();
      robot.dispose();
    },
  };
}
