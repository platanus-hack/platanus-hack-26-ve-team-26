"""What Python feeds an imitation policy, for physics/ to check the browser builds the same.

    uv run --project training python -m training.browser_fixture training/policies/g1-walk.onnx

Runs the exported policy (its .onnx and .json) on its clip from the start, as MimicEnv does, and
writes training/policies/<id>.fixture.json: for each of the first decisions, the robot's state
(qpos, qvel, previous targets and clip time), the observation Python built from it and the targets
the network answered. physics/scripts/check-mimic.mjs puts the browser in each of those states and
must get the same observation and targets: if the observation differs, the robot falls in the
browser even though everything "runs".
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

from .env import ACTION_SCALE
from .imitate import MimicEnv

# 40 decisions: 0.8 s of the clip, through the first step, enough to cover every look-ahead.
DECISIONS = 40
# 9 decimals: far below what float32 (the network's input) tells apart, and a third of the file.
DECIMALS = 9


def rounded(x) -> list:
    return [round(float(v), DECIMALS) for v in np.asarray(x).ravel()]


def fixture(onnx_path: Path) -> Path:
    meta = json.loads(onnx_path.with_suffix(".json").read_text())
    env = MimicEnv(seed=0, clips=(meta["motion"],))
    session = ort.InferenceSession(str(onnx_path))
    obs = env.reset_at(0.0)
    samples = []
    for _ in range(DECISIONS):
        state = {"t": round(env.t, DECIMALS), "qpos": rounded(env.data.qpos), "qvel": rounded(env.data.qvel),
                 "previous": rounded(env.prev_ctrl)}
        ctrl = session.run(None, {"obs": obs[None]})[0][0]
        samples.append({**state, "obs": rounded(obs), "ctrl": rounded(ctrl)})
        obs, _, fell, done, _ = env.step((ctrl - env.ref_next) / ACTION_SCALE)
        if fell or done:
            break
    out = onnx_path.with_suffix(".fixture.json")
    out.write_text(json.dumps({"policy": meta["id"], "motion": meta["motion"], "samples": samples}) + "\n")
    print(f"{out} ({len(samples)} decisions, {out.stat().st_size // 1024} KB)")
    return out


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.browser_fixture", description=__doc__.split("\n")[0])
    p.add_argument("onnx", type=Path, help="an exported imitation policy (its .json next to it)")
    fixture(p.parse_args().onnx)


if __name__ == "__main__":
    main()
