"""Does a checkpoint stand still, and does it survive the web's push?

    uv run --project training python -m training.evaluate training/runs/stand-v1/step_*.pt [--onnx training/policies/g1-stand.onnx]

Two tests per policy, over several starting wobbles:

- **Quiet:** 20 s with no push at all. Reports how long it stood, how much it turned (deg/s, the
  heading drift over the run), how far the pelvis wandered from where it started (m), how often a
  foot left the floor (taps per second) and how jerky the motors were (mean |action rate|). A
  standing robot should score near zero on all four: the first policies learned to balance by
  pivoting on one foot (57 deg/s) and nobody measured it.
- **Pushes:** the "Empujar" push of physics/ (250 N for 0.1 s on the torso) at 4, 8, 12 and 16 s,
  from the front, left, back and right. Reports how long it stood and how many pushes it survived.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import torch

from .env import ACTION_SCALE, EPISODE_STEPS, G1Env
from .ppo import ActorCritic

PUSH_N = 250.0  # physics/src/sim.js
PUSHES = [(4, 0.0), (8, np.pi / 2), (12, np.pi), (16, 3 * np.pi / 2)]  # (second, direction)
TRIALS = 5
# A foot is off the floor when its ankle rose this much above where it rests standing: the tapping
# foot of g1-stand lifted ~2.2 cm, and a planted foot rolling on its sole moves its ankle less than
# 1 cm.
TAP_HEIGHT_M = 0.01
FEET = ("left_ankle_roll_link", "right_ankle_roll_link")


def yaw_of(quat: np.ndarray) -> float:
    w, x, y, z = quat
    return float(np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))


class Policy:
    """A checkpoint (.pt) or an exported policy (.onnx), called the same way."""

    def __init__(self, path: Path | None):
        self.model = self.session = None
        if path is None:
            return
        if path.suffix == ".onnx":
            import onnxruntime as ort

            self.session = ort.InferenceSession(str(path))
            self.input = self.session.get_inputs()[0].name
        else:
            self.model = ActorCritic()
            self.model.load_state_dict(torch.load(path)["model"])
            self.model.eval()

    def act(self, env: G1Env, obs: np.ndarray) -> np.ndarray:
        if self.session is not None:
            # The ONNX returns ctrl (motor targets) directly: back to an action for env.step().
            ctrl = self.session.run(None, {self.input: obs[None].astype(np.float32)})[0][0]
            return (ctrl - env.default) / ACTION_SCALE
        if self.model is None:
            return np.zeros(29)  # no policy: hold the standing targets, like physics/ today
        with torch.no_grad():
            return self.model.actor(self.model.norm(torch.as_tensor(obs)[None]))[0].numpy()


def run(policy: Policy, seed: int, pushes: bool) -> dict[str, float]:
    env = G1Env(seed=seed, push=False)
    obs = env.reset()
    feet = [env.model.body(name).id for name in FEET]
    floor = env.data.xpos[feet, 2].copy()  # where the soles rest when standing
    start = env.data.qpos[:2].copy()
    yaw0 = yaw_of(env.data.qpos[3:7])
    survived = np.zeros(len(PUSHES))  # per push, so a weak side shows (the right one, in stand-v7b)
    taps = 0
    airborne = np.zeros(2, dtype=bool)
    rates: list[float] = []
    drift = 0.0
    yaw_total = 0.0
    prev_yaw = yaw0
    prev_action = np.zeros(29)
    k = 0
    for k in range(EPISODE_STEPS):
        if pushes:
            for second, angle in PUSHES:
                if k == second * 50:
                    env.push_now(PUSH_N, angle)
                if k == second * 50 + 100:  # still up 2 s after the push
                    survived[PUSHES.index((second, angle))] = 1
        action = policy.act(env, obs)
        rates.append(float(np.mean(np.abs(action - prev_action))))
        prev_action = action
        obs, _, fell, _, _ = env.step(action)
        yaw = yaw_of(env.data.qpos[3:7])
        yaw_total += (yaw - prev_yaw + np.pi) % (2 * np.pi) - np.pi  # unwrapped
        prev_yaw = yaw
        drift = max(drift, float(np.linalg.norm(env.data.qpos[:2] - start)))
        up = env.data.xpos[feet, 2] - floor > TAP_HEIGHT_M
        taps += int(np.sum(up & ~airborne))  # count each lift once
        airborne = up
        if fell:
            break
    seconds = min(k + 1, EPISODE_STEPS) / 50
    return {
        "seconds": seconds,
        "survived": survived,
        "yaw_rate": abs(np.degrees(yaw_total)) / seconds,
        "drift": drift,
        "taps": taps / seconds,
        "rate": float(np.mean(rates)),
    }


def evaluate(policy: Policy, pushes: bool) -> dict:
    results = [run(policy, seed, pushes) for seed in range(TRIALS)]
    return {key: np.mean([r[key] for r in results], axis=0) for key in results[0]}


def report(name: str, policy: Policy) -> None:
    quiet = evaluate(policy, pushes=False)
    pushed = evaluate(policy, pushes=True)
    print(
        f"{name:>14}: quieto {quiet['seconds']:5.1f} s de 20, gira {quiet['yaw_rate']:5.1f} °/s, se va {quiet['drift']:.2f} m, "
        f"{quiet['taps']:.1f} pisadas/s, acción {quiet['rate']:.3f} | empujado {pushed['seconds']:5.1f} s, "
        f"aguanta {pushed['survived'].sum():.1f} de 4 (adelante izq atrás der: {' '.join(f'{v:.1f}' for v in pushed['survived'])})"
    )


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.evaluate", description=__doc__.split("\n")[0])
    p.add_argument("checkpoints", nargs="*", type=Path, help=".pt checkpoints")
    p.add_argument("--onnx", nargs="*", type=Path, default=[], help="exported policies (training/policies/*.onnx)")
    args = p.parse_args()
    report("sin política", Policy(None))
    for path in sorted(args.checkpoints, key=lambda q: int(re.findall(r"\d+", q.stem)[-1])):
        report(path.stem, Policy(path))
    for path in args.onnx:
        report(path.stem, Policy(path))


if __name__ == "__main__":
    main()
