"""Checkpoint -> policy.onnx + policy.json, as docs/contrato.md defines the Policy.

    uv run --project training python -m training.export training/runs/stand-v1/step_20000000.pt --id g1-stand

The ONNX takes the raw observation (93 numbers of env.observe() for standing, imitate.MIMIC_OBS_DIM
of MimicEnv.observe() for imitation) and returns the 29 motor targets (MuJoCo ctrl) directly: normalization, the deterministic action, the 0.25 rad scale, the standing
offset and the motor ranges are all inside, so the browser only builds obs and writes ctrl.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn

from .env import ACTION_SCALE, MJCF, NU, OBS_DIM, G1Env
from .imitate import LOOKAHEAD_S
from .ppo import ActorCritic, obs_size

OUT = Path(__file__).parent / "policies"

# The worlds an imitation policy trains in (physics/worlds/<id>.json). Only the flat floor until
# MimicEnv draws a world per episode (ENT-3 in docs/plan-producto.md).
TRAINED_WORLDS = ["plano"]


class Deployed(nn.Module):
    def __init__(self, model: ActorCritic, env: G1Env, walk: bool = False):
        super().__init__()
        self.model = model
        self.walk = walk
        self.register_buffer("default", torch.as_tensor(env.default, dtype=torch.float32))
        self.register_buffer("low", torch.as_tensor(env.ctrl_low, dtype=torch.float32))
        self.register_buffer("high", torch.as_tensor(env.ctrl_high, dtype=torch.float32))

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        action = self.model.actor(self.model.norm(obs))  # the mean: no exploration noise in the demo
        # Standing corrects the standing pose; walking corrects the reference pose it receives in
        # obs[93:122] (as an offset from the standing pose, see imitate.MimicEnv.observe).
        base = self.default + obs[:, 93:122] if self.walk else self.default
        return torch.minimum(torch.maximum(base + ACTION_SCALE * action, self.low), self.high)


def export(checkpoint: Path, policy_id: str, out: Path, task: str | None = None, motion: str | None = None) -> Path:
    """task and motion come from the checkpoint (ppo.py saves them); the arguments are for older
    checkpoints that do not say."""
    state = torch.load(checkpoint)
    task = state.get("task") or task or "stand"
    walk = task == "mimic"
    model = ActorCritic(obs_size(task))
    model.load_state_dict(state["model"])
    model.eval()
    if walk:
        from .imitate import DEFAULT_MOTION, MimicEnv

        motion = state.get("motion") or motion or DEFAULT_MOTION
        env = MimicEnv(seed=0, clips=(motion,))
    else:
        env = G1Env(seed=0, push=False)
    deployed = Deployed(model, env, walk).eval()

    out.mkdir(parents=True, exist_ok=True)
    onnx_path = out / f"{policy_id}.onnx"
    torch.onnx.export(
        deployed, torch.zeros(1, obs_size(task)), str(onnx_path), input_names=["obs"], output_names=["ctrl"],
        dynamic_axes={"obs": {0: "batch"}, "ctrl": {0: "batch"}}, opset_version=17, dynamo=False,
    )

    # The ONNX must give the same targets as the training code, on real observations.
    session = ort.InferenceSession(str(onnx_path))
    obs = env.reset()
    worst = 0.0
    for _ in range(200):
        onnx_ctrl = session.run(None, {"obs": obs[None]})[0][0]
        with torch.no_grad():
            torch_ctrl = deployed(torch.as_tensor(obs)[None])[0].numpy()
        worst = max(worst, float(np.abs(onnx_ctrl - torch_ctrl).max()))
        base = env.ref_next if walk else env.default
        obs, _, fell, done, _ = env.step((onnx_ctrl - base) / ACTION_SCALE)
        if fell or done:
            obs = env.reset()
    assert worst < 1e-4, f"ONNX and torch disagree by {worst} rad"

    followed = {}
    if walk:
        # How much of the clip this checkpoint follows from its first frame: what the web shows as
        # training progress. Same measure as evaluate_walk.py, on the exported weights.
        from .evaluate_walk import run

        followed_s, duration_s, _, _ = run(model, motion)
        followed = {"followed_s": round(followed_s, 2), "duration_s": round(duration_s, 2)}

    meta = {
        "id": policy_id,
        "robot": "unitree_g1",
        "mjcf": MJCF,
        "obs_dim": obs_size(task),
        "nu": NU,
        "task": task,
        # Standing learns from pushes, not from people; imitation from the clip it imitates.
        "trained_on": [m.id for m in env.motions] if walk else [],
        # Imitation: the clip it follows, and how far ahead the observation shows it
        # (imitate.MimicEnv.observe).
        **({"motion": env.motions[0].id, "lookahead_s": list(LOOKAHEAD_S)} if walk else {}),
        "worlds": TRAINED_WORLDS,
        **followed,
        "steps": int(state["step"]),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out / f"{policy_id}.json").write_text(json.dumps(meta, indent=2) + "\n")
    follow = f", follows {followed['followed_s']} s of {followed['duration_s']} s" if followed else ""
    print(f"{onnx_path} ({onnx_path.stat().st_size // 1024} KB), ONNX vs torch max diff {worst:.1e} rad{follow}")
    return onnx_path


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.export", description=__doc__.split("\n")[0])
    p.add_argument("checkpoint", type=Path)
    p.add_argument("--id", required=True, help="policy id, e.g. g1-stand")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--task", choices=["stand", "mimic", "walk"], help="only for checkpoints that do not say it")
    p.add_argument("--motion", help="only for mimic checkpoints that do not say which clip they imitate")
    args = p.parse_args()
    export(args.checkpoint, args.id, args.out, "mimic" if args.task == "walk" else args.task, args.motion)


if __name__ == "__main__":
    main()
