// The push the trained robot is shown taking, wherever it stands on its own (the landing's hero,
// Simulaciones). Measured with g1-stand in the page's own simulation (physics/, Node), pushes at 2,
// 4 and 6 s after standing up in random directions (30 trials): 150 N held 93 % of first pushes
// and 90 % of all three; 250 N held 43 % and 10 %, so a few presses laid it on the floor
// (training/env.py agrees: 100 % and 98 % against 65 % and 32 %). The landing's Gym keeps 250 N,
// the force its ladder of checkpoints was measured with.
export const PUSH_N = 150;
// A push waits until the robot has stood this long, and this long after the last push: sooner is
// outside what it trained on (training/env.py pushes from 2 s, every 2-4 s). Pushing a robot the
// moment it was stood up (Simulaciones, from a clip) was its worst case.
export const SETTLE_S = 2.0;
export const GAP_S = 2.0;

/**
 * Pushes `view`'s robot with PUSH_N as soon as it may: a press that comes early is kept (one at a
 * time) and lands when it may. The simulation's clock restarts at 0 when the robot is stood up
 * again, which also ends the wait after the last push.
 * @param state  { lastT, queued } kept by the caller across presses: lastT is the simulation's time
 *   at the last push (set it too when the robot is pushed some other way), queued the pending timer
 * @param land   called when the push lands (the arrow, the words)
 * @param may    whether a push may still land (a kept press is dropped if the page moved on)
 */
export function pushWhenReady(state, view, land, may = () => true) {
  if (!may()) return;
  const t = view.sim.data.time;
  const sinceLast = state.lastT > t ? Infinity : t - state.lastT;
  const wait = Math.max(0, SETTLE_S - t, GAP_S - sinceLast);
  if (wait > 0) {
    state.queued ||= setTimeout(() => {
      state.queued = 0;
      pushWhenReady(state, view, land, may);
    }, wait * 1000);
    return;
  }
  state.lastT = t;
  view.push(undefined, PUSH_N);
  land?.();
}
